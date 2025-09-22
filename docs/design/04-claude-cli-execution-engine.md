# Claude CLI执行引擎设计文档

## 1. 执行引擎概览

### 1.1 设计目标
- **安全隔离**: 每个项目独立的执行环境，防止相互影响
- **实时交互**: 支持Claude CLI的交互式操作和确认流程
- **资源控制**: 限制CPU、内存、磁盘使用，防止资源滥用
- **状态管理**: 实时追踪执行状态，支持暂停、恢复、取消操作

### 1.2 核心架构
```
┌─────────────────────────────────────────────────────────────────┐
│                    Claude CLI执行引擎                            │
├─────────────────┬─────────────────┬─────────────────┬─────────────┤
│   命令解析器    │   执行容器      │   交互管理器    │   资源监控   │
│                 │                 │                 │             │
│ ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────┐ │
│ │命令验证     │ │ │Docker容器   │ │ │用户确认     │ │ │CPU监控  │ │
│ │参数解析     │ │ │环境隔离     │ │ │输入处理     │ │ │内存监控 │ │
│ │权限检查     │ │ │进程管理     │ │ │输出捕获     │ │ │磁盘监控 │ │
│ └─────────────┘ │ └─────────────┘ │ └─────────────┘ │ └─────────┘ │
└─────────────────┴─────────────────┴─────────────────┴─────────────┘
                               │
┌─────────────────────────────────────────────────────────────────┐
│                      底层执行环境                                │
├─────────────────┬─────────────────┬─────────────────┬─────────────┤
│   文件系统      │   网络配置      │   Claude CLI    │   日志系统   │
│                 │                 │                 │             │
│ ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────┐ │
│ │项目目录     │ │ │网络策略     │ │ │CLI版本      │ │ │执行日志 │ │
│ │临时文件     │ │ │代理设置     │ │ │配置管理     │ │ │错误日志 │ │
│ │权限控制     │ │ │DNS配置      │ │ │插件支持     │ │ │审计日志 │ │
│ └─────────────┘ │ └─────────────┘ │ └─────────────┘ │ └─────────┘ │
└─────────────────┴─────────────────┴─────────────────┴─────────────┘
```

## 2. 执行环境架构

### 2.1 容器化执行环境

#### 2.1.1 Docker镜像设计
```dockerfile
# Claude CLI执行环境镜像
FROM node:18-alpine

# 安装系统依赖
RUN apk add --no-cache \
    git \
    curl \
    python3 \
    py3-pip \
    build-base \
    linux-headers

# 创建执行用户（非root）
RUN addgroup -g 1000 claude && \
    adduser -D -s /bin/sh -u 1000 -G claude claude

# 安装Claude CLI
RUN npm install -g @anthropic-ai/claude-cli@latest

# 设置工作目录
WORKDIR /workspace
RUN chown claude:claude /workspace

# 切换到非特权用户
USER claude

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD claude --version || exit 1

# 默认命令
CMD ["/bin/sh"]
```

#### 2.1.2 容器配置
```python
from dataclasses import dataclass
from typing import Dict, List, Optional

@dataclass
class ContainerConfig:
    """容器配置"""
    # 资源限制
    memory_limit: str = "512m"
    cpu_limit: str = "0.5"
    disk_limit: str = "1g"
    
    # 网络配置
    network_mode: str = "bridge"
    dns_servers: List[str] = None
    
    # 安全配置
    read_only_root_fs: bool = True
    no_new_privileges: bool = True
    user: str = "claude:claude"
    
    # 环境变量
    environment: Dict[str, str] = None
    
    # 挂载点
    volumes: Dict[str, str] = None
    
    # 执行超时
    execution_timeout: int = 3600  # 1小时
    idle_timeout: int = 1800      # 30分钟

@dataclass 
class ExecutionContext:
    """执行上下文"""
    project_id: str
    user_id: str
    task_id: str
    working_directory: str
    environment_vars: Dict[str, str]
    secrets: Dict[str, str]
    container_id: Optional[str] = None
```

### 2.2 执行引擎核心类

```python
import asyncio
import docker
import uuid
import json
import time
from datetime import datetime, timedelta
from typing import AsyncGenerator, Dict, List, Optional, Callable

class ClaudeExecutionEngine:
    """Claude CLI执行引擎"""
    
    def __init__(self, docker_client: docker.DockerClient):
        self.docker = docker_client
        self.active_containers: Dict[str, ContainerExecutor] = {}
        self.resource_monitor = ResourceMonitor()
        self.interaction_manager = InteractionManager()
        
    async def create_execution_context(
        self, 
        project_id: str,
        user_id: str,
        task_id: str,
        config: ContainerConfig = None
    ) -> ExecutionContext:
        """创建执行上下文"""
        config = config or ContainerConfig()
        
        # 创建工作目录
        working_dir = f"/tmp/claude-execution/{project_id}"
        os.makedirs(working_dir, exist_ok=True)
        
        # 准备环境变量
        env_vars = await self._prepare_environment(project_id, user_id)
        
        # 获取项目密钥
        secrets = await self._get_project_secrets(project_id, user_id)
        
        context = ExecutionContext(
            project_id=project_id,
            user_id=user_id,
            task_id=task_id,
            working_directory=working_dir,
            environment_vars=env_vars,
            secrets=secrets
        )
        
        return context
    
    async def execute_command(
        self,
        context: ExecutionContext,
        command: str,
        args: List[str] = None,
        interactive: bool = True,
        timeout: int = None
    ) -> AsyncGenerator[Dict, None]:
        """执行Claude CLI命令"""
        
        # 1. 命令验证和预处理
        validated_command = await self._validate_command(command, args)
        
        # 2. 创建或获取容器
        executor = await self._get_or_create_container(context)
        
        # 3. 执行命令
        async for event in executor.execute(
            validated_command, 
            interactive=interactive, 
            timeout=timeout
        ):
            # 4. 处理执行事件
            yield await self._process_execution_event(event, context)
    
    async def _get_or_create_container(self, context: ExecutionContext) -> 'ContainerExecutor':
        """获取或创建容器执行器"""
        container_key = f"{context.project_id}:{context.user_id}"
        
        if container_key in self.active_containers:
            executor = self.active_containers[container_key]
            if executor.is_healthy():
                return executor
            else:
                # 清理不健康的容器
                await executor.cleanup()
                del self.active_containers[container_key]
        
        # 创建新的容器执行器
        executor = ContainerExecutor(
            context=context,
            docker_client=self.docker,
            resource_monitor=self.resource_monitor
        )
        
        await executor.initialize()
        self.active_containers[container_key] = executor
        
        return executor
    
    async def _validate_command(self, command: str, args: List[str] = None) -> Dict:
        """验证和解析Claude CLI命令"""
        # 命令白名单
        ALLOWED_COMMANDS = {
            'claude': {
                'subcommands': [
                    'help', 'version', 'auth', 'project', 'chat', 'task',
                    'file', 'edit', 'run', 'test', 'deploy'
                ],
                'dangerous_flags': [
                    '--execute-arbitrary', '--system-access', '--root'
                ]
            }
        }
        
        if command not in ALLOWED_COMMANDS:
            raise SecurityError(f"Command '{command}' is not allowed")
        
        # 检查危险参数
        if args:
            for arg in args:
                for dangerous_flag in ALLOWED_COMMANDS[command]['dangerous_flags']:
                    if dangerous_flag in arg:
                        raise SecurityError(f"Dangerous flag '{dangerous_flag}' is not allowed")
        
        return {
            'command': command,
            'args': args or [],
            'safe': True,
            'validated_at': datetime.utcnow().isoformat()
        }
    
    async def _process_execution_event(self, event: Dict, context: ExecutionContext) -> Dict:
        """处理执行事件"""
        event_type = event.get('type')
        
        if event_type == 'output':
            # 处理输出
            return {
                'type': 'output',
                'data': event['data'],
                'timestamp': datetime.utcnow().isoformat(),
                'task_id': context.task_id
            }
        
        elif event_type == 'confirmation_required':
            # 处理确认请求
            return {
                'type': 'confirmation_required',
                'message': event['message'],
                'options': event.get('options', ['yes', 'no']),
                'timestamp': datetime.utcnow().isoformat(),
                'task_id': context.task_id
            }
        
        elif event_type == 'error':
            # 处理错误
            return {
                'type': 'error',
                'message': event['message'],
                'code': event.get('code'),
                'timestamp': datetime.utcnow().isoformat(),
                'task_id': context.task_id
            }
        
        elif event_type == 'completed':
            # 处理完成
            return {
                'type': 'completed',
                'exit_code': event['exit_code'],
                'duration': event['duration'],
                'timestamp': datetime.utcnow().isoformat(),
                'task_id': context.task_id
            }
        
        return event
    
    async def send_input(
        self, 
        context: ExecutionContext, 
        input_data: str
    ) -> bool:
        """发送用户输入到执行中的命令"""
        container_key = f"{context.project_id}:{context.user_id}"
        
        if container_key not in self.active_containers:
            raise ValueError("No active execution context")
        
        executor = self.active_containers[container_key]
        return await executor.send_input(input_data)
    
    async def cancel_execution(self, context: ExecutionContext) -> bool:
        """取消执行"""
        container_key = f"{context.project_id}:{context.user_id}"
        
        if container_key not in self.active_containers:
            return False
        
        executor = self.active_containers[container_key]
        return await executor.cancel_current_execution()
    
    async def cleanup_context(self, context: ExecutionContext):
        """清理执行上下文"""
        container_key = f"{context.project_id}:{context.user_id}"
        
        if container_key in self.active_containers:
            executor = self.active_containers[container_key]
            await executor.cleanup()
            del self.active_containers[container_key]
        
        # 清理工作目录
        import shutil
        if os.path.exists(context.working_directory):
            shutil.rmtree(context.working_directory)


class ContainerExecutor:
    """Docker容器执行器"""
    
    def __init__(
        self, 
        context: ExecutionContext,
        docker_client: docker.DockerClient,
        resource_monitor: 'ResourceMonitor'
    ):
        self.context = context
        self.docker = docker_client
        self.resource_monitor = resource_monitor
        self.container: Optional[docker.models.containers.Container] = None
        self.current_process: Optional[asyncio.subprocess.Process] = None
        self.last_activity = datetime.utcnow()
        
    async def initialize(self):
        """初始化容器"""
        # 准备容器配置
        config = ContainerConfig()
        
        # 准备挂载卷
        volumes = {
            self.context.working_directory: {
                'bind': '/workspace',
                'mode': 'rw'
            }
        }
        
        # 准备环境变量
        environment = {
            **self.context.environment_vars,
            'CLAUDE_PROJECT_ID': self.context.project_id,
            'CLAUDE_TASK_ID': self.context.task_id
        }
        
        # 添加密钥到环境变量
        for key, value in self.context.secrets.items():
            environment[f"CLAUDE_SECRET_{key}"] = value
        
        # 创建容器
        self.container = self.docker.containers.run(
            image="claude-cli-executor:latest",
            command="/bin/sh",
            detach=True,
            tty=True,
            stdin_open=True,
            working_dir="/workspace",
            environment=environment,
            volumes=volumes,
            mem_limit=config.memory_limit,
            cpu_quota=int(float(config.cpu_limit) * 100000),
            cpu_period=100000,
            network_mode=config.network_mode,
            read_only=config.read_only_root_fs,
            user=config.user,
            security_opt=["no-new-privileges:true"],
            cap_drop=["ALL"],
            cap_add=["DAC_OVERRIDE"]  # 允许文件操作
        )
        
        # 启动资源监控
        await self.resource_monitor.start_monitoring(
            self.container.id, 
            self.context.task_id
        )
    
    async def execute(
        self,
        validated_command: Dict,
        interactive: bool = True,
        timeout: int = None
    ) -> AsyncGenerator[Dict, None]:
        """在容器中执行命令"""
        if not self.container:
            raise RuntimeError("Container not initialized")
        
        command = validated_command['command']
        args = validated_command['args']
        full_command = [command] + args
        
        try:
            # 执行命令
            exec_result = self.container.exec_run(
                full_command,
                stdout=True,
                stderr=True,
                stdin=True,
                tty=interactive,
                stream=True,
                demux=True
            )
            
            start_time = time.time()
            self.last_activity = datetime.utcnow()
            
            # 处理流式输出
            for stdout_chunk, stderr_chunk in exec_result.output:
                if stdout_chunk:
                    yield {
                        'type': 'output',
                        'stream': 'stdout',
                        'data': stdout_chunk.decode('utf-8', errors='replace')
                    }
                
                if stderr_chunk:
                    output = stderr_chunk.decode('utf-8', errors='replace')
                    
                    # 检查是否需要用户确认
                    if self._is_confirmation_required(output):
                        yield {
                            'type': 'confirmation_required',
                            'message': self._extract_confirmation_message(output),
                            'options': self._extract_confirmation_options(output)
                        }
                    else:
                        yield {
                            'type': 'output',
                            'stream': 'stderr', 
                            'data': output
                        }
                
                self.last_activity = datetime.utcnow()
                
                # 检查超时
                if timeout and (time.time() - start_time) > timeout:
                    await self.cancel_current_execution()
                    yield {
                        'type': 'error',
                        'message': 'Execution timeout',
                        'code': 'TIMEOUT'
                    }
                    return
            
            # 获取退出代码
            exit_code = exec_result.exit_code
            duration = time.time() - start_time
            
            yield {
                'type': 'completed',
                'exit_code': exit_code,
                'duration': duration
            }
            
        except Exception as e:
            yield {
                'type': 'error',
                'message': str(e),
                'code': 'EXECUTION_ERROR'
            }
    
    async def send_input(self, input_data: str) -> bool:
        """向执行中的命令发送输入"""
        if not self.container:
            return False
        
        try:
            # 通过stdin发送输入
            # 这需要维护一个到容器的持久连接
            # 实际实现可能需要使用docker-py的低级API
            self.container.exec_run(
                f"echo '{input_data}' > /tmp/claude_input",
                stdout=False,
                stderr=False
            )
            self.last_activity = datetime.utcnow()
            return True
        except Exception:
            return False
    
    async def cancel_current_execution(self) -> bool:
        """取消当前执行"""
        if not self.container:
            return False
        
        try:
            # 发送中断信号
            self.container.kill(signal="SIGINT")
            
            # 等待一段时间后强制终止
            await asyncio.sleep(5)
            
            if self.container.status == "running":
                self.container.kill(signal="SIGKILL")
            
            return True
        except Exception:
            return False
    
    def is_healthy(self) -> bool:
        """检查容器健康状态"""
        if not self.container:
            return False
        
        try:
            self.container.reload()
            
            # 检查容器状态
            if self.container.status != "running":
                return False
            
            # 检查空闲超时
            idle_timeout = timedelta(minutes=30)
            if datetime.utcnow() - self.last_activity > idle_timeout:
                return False
            
            return True
        except Exception:
            return False
    
    async def cleanup(self):
        """清理容器资源"""
        if self.container:
            try:
                # 停止资源监控
                await self.resource_monitor.stop_monitoring(self.container.id)
                
                # 停止并删除容器
                self.container.stop(timeout=10)
                self.container.remove()
            except Exception as e:
                logger.warning(f"Error during container cleanup: {e}")
            finally:
                self.container = None
    
    def _is_confirmation_required(self, output: str) -> bool:
        """检查输出是否需要用户确认"""
        confirmation_patterns = [
            r"Do you want to continue\?",
            r"Are you sure\?",
            r"Proceed with.*\?",
            r"Continue\?",
            r"\(y/n\)",
            r"\[Y/n\]",
            r"\[y/N\]"
        ]
        
        import re
        for pattern in confirmation_patterns:
            if re.search(pattern, output, re.IGNORECASE):
                return True
        return False
    
    def _extract_confirmation_message(self, output: str) -> str:
        """提取确认消息"""
        lines = output.strip().split('\n')
        return lines[-1] if lines else output
    
    def _extract_confirmation_options(self, output: str) -> List[str]:
        """提取确认选项"""
        if "(y/n)" in output.lower():
            return ["y", "n"]
        elif "[Y/n]" in output:
            return ["Y", "n"]
        elif "[y/N]" in output:
            return ["y", "N"]
        else:
            return ["yes", "no"]
```

## 3. 资源监控系统

### 3.1 资源监控器

```python
import psutil
from dataclasses import dataclass
from typing import Dict, Optional, Callable

@dataclass
class ResourceUsage:
    """资源使用情况"""
    cpu_percent: float
    memory_used: int  # bytes
    memory_percent: float
    disk_used: int    # bytes
    network_io: Dict[str, int]  # bytes sent/received
    timestamp: datetime

@dataclass
class ResourceLimits:
    """资源限制"""
    max_cpu_percent: float = 80.0
    max_memory_mb: int = 512
    max_disk_mb: int = 1024
    max_execution_time: int = 3600  # seconds
    max_idle_time: int = 1800       # seconds

class ResourceMonitor:
    """资源监控器"""
    
    def __init__(self):
        self.monitored_containers: Dict[str, Dict] = {}
        self.alert_callbacks: List[Callable] = []
        self._monitoring_task: Optional[asyncio.Task] = None
    
    async def start_monitoring(self, container_id: str, task_id: str, limits: ResourceLimits = None):
        """开始监控容器资源"""
        limits = limits or ResourceLimits()
        
        self.monitored_containers[container_id] = {
            'task_id': task_id,
            'limits': limits,
            'start_time': datetime.utcnow(),
            'last_usage': None,
            'alerts_sent': set()
        }
        
        # 启动监控任务（如果尚未启动）
        if not self._monitoring_task or self._monitoring_task.done():
            self._monitoring_task = asyncio.create_task(self._monitor_loop())
    
    async def stop_monitoring(self, container_id: str):
        """停止监控容器"""
        if container_id in self.monitored_containers:
            del self.monitored_containers[container_id]
    
    async def get_current_usage(self, container_id: str) -> Optional[ResourceUsage]:
        """获取当前资源使用情况"""
        try:
            # 获取Docker容器统计信息
            import docker
            client = docker.from_env()
            container = client.containers.get(container_id)
            stats = container.stats(stream=False)
            
            # 解析CPU使用率
            cpu_delta = stats['cpu_stats']['cpu_usage']['total_usage'] - \
                       stats['precpu_stats']['cpu_usage']['total_usage']
            system_delta = stats['cpu_stats']['system_cpu_usage'] - \
                          stats['precpu_stats']['system_cpu_usage']
            
            cpu_percent = (cpu_delta / system_delta) * \
                         len(stats['cpu_stats']['cpu_usage']['percpu_usage']) * 100.0
            
            # 解析内存使用
            memory_used = stats['memory_stats']['usage']
            memory_limit = stats['memory_stats']['limit']
            memory_percent = (memory_used / memory_limit) * 100.0
            
            # 解析网络I/O
            network_io = {}
            if 'networks' in stats:
                for interface, data in stats['networks'].items():
                    network_io[interface] = {
                        'rx_bytes': data['rx_bytes'],
                        'tx_bytes': data['tx_bytes']
                    }
            
            return ResourceUsage(
                cpu_percent=cpu_percent,
                memory_used=memory_used,
                memory_percent=memory_percent,
                disk_used=0,  # Docker stats不直接提供磁盘使用情况
                network_io=network_io,
                timestamp=datetime.utcnow()
            )
            
        except Exception as e:
            logger.error(f"Failed to get resource usage for {container_id}: {e}")
            return None
    
    async def _monitor_loop(self):
        """监控循环"""
        while self.monitored_containers:
            for container_id, monitor_data in self.monitored_containers.items():
                try:
                    usage = await self.get_current_usage(container_id)
                    if usage:
                        monitor_data['last_usage'] = usage
                        await self._check_limits(container_id, usage, monitor_data)
                
                except Exception as e:
                    logger.error(f"Error monitoring container {container_id}: {e}")
            
            await asyncio.sleep(10)  # 每10秒检查一次
    
    async def _check_limits(
        self, 
        container_id: str, 
        usage: ResourceUsage, 
        monitor_data: Dict
    ):
        """检查资源限制"""
        limits = monitor_data['limits']
        task_id = monitor_data['task_id']
        alerts_sent = monitor_data['alerts_sent']
        
        # 检查CPU使用率
        if usage.cpu_percent > limits.max_cpu_percent:
            alert_key = f"cpu_high_{container_id}"
            if alert_key not in alerts_sent:
                await self._send_alert({
                    'type': 'resource_limit_exceeded',
                    'resource': 'cpu',
                    'current': usage.cpu_percent,
                    'limit': limits.max_cpu_percent,
                    'container_id': container_id,
                    'task_id': task_id
                })
                alerts_sent.add(alert_key)
        
        # 检查内存使用
        memory_mb = usage.memory_used / (1024 * 1024)
        if memory_mb > limits.max_memory_mb:
            alert_key = f"memory_high_{container_id}"
            if alert_key not in alerts_sent:
                await self._send_alert({
                    'type': 'resource_limit_exceeded',
                    'resource': 'memory',
                    'current': memory_mb,
                    'limit': limits.max_memory_mb,
                    'container_id': container_id,
                    'task_id': task_id
                })
                alerts_sent.add(alert_key)
        
        # 检查执行时间
        execution_time = (datetime.utcnow() - monitor_data['start_time']).total_seconds()
        if execution_time > limits.max_execution_time:
            alert_key = f"execution_timeout_{container_id}"
            if alert_key not in alerts_sent:
                await self._send_alert({
                    'type': 'execution_timeout',
                    'execution_time': execution_time,
                    'limit': limits.max_execution_time,
                    'container_id': container_id,
                    'task_id': task_id
                })
                alerts_sent.add(alert_key)
    
    async def _send_alert(self, alert_data: Dict):
        """发送告警"""
        for callback in self.alert_callbacks:
            try:
                await callback(alert_data)
            except Exception as e:
                logger.error(f"Error sending alert: {e}")
    
    def add_alert_callback(self, callback: Callable):
        """添加告警回调"""
        self.alert_callbacks.append(callback)


class SecurityError(Exception):
    """安全相关异常"""
    pass
```

## 4. 交互管理系统

### 4.1 交互式处理

```python
import asyncio
from typing import Dict, Optional, Callable, Any
from enum import Enum

class InteractionType(Enum):
    CONFIRMATION = "confirmation"
    INPUT_REQUEST = "input_request"
    CHOICE_SELECTION = "choice_selection"
    FILE_SELECTION = "file_selection"

@dataclass
class InteractionRequest:
    """交互请求"""
    id: str
    type: InteractionType
    message: str
    options: List[str] = None
    default_value: str = None
    timeout: int = 300  # 5分钟超时
    created_at: datetime = None
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.utcnow()

class InteractionManager:
    """交互管理器"""
    
    def __init__(self):
        self.pending_interactions: Dict[str, InteractionRequest] = {}
        self.interaction_callbacks: Dict[str, Callable] = {}
        self.response_futures: Dict[str, asyncio.Future] = {}
    
    async def create_interaction(
        self,
        task_id: str,
        interaction_type: InteractionType,
        message: str,
        options: List[str] = None,
        default_value: str = None,
        timeout: int = 300
    ) -> str:
        """创建交互请求"""
        interaction_id = str(uuid.uuid4())
        
        request = InteractionRequest(
            id=interaction_id,
            type=interaction_type,
            message=message,
            options=options,
            default_value=default_value,
            timeout=timeout
        )
        
        self.pending_interactions[interaction_id] = request
        
        # 创建响应Future
        future = asyncio.Future()
        self.response_futures[interaction_id] = future
        
        # 发送交互请求到前端
        await self._notify_interaction_required(task_id, request)
        
        # 设置超时
        asyncio.create_task(self._handle_timeout(interaction_id, timeout))
        
        return interaction_id
    
    async def wait_for_response(self, interaction_id: str) -> Optional[str]:
        """等待用户响应"""
        if interaction_id not in self.response_futures:
            return None
        
        try:
            future = self.response_futures[interaction_id]
            response = await future
            return response
        except asyncio.TimeoutError:
            return None
        finally:
            # 清理
            self._cleanup_interaction(interaction_id)
    
    async def submit_response(self, interaction_id: str, response: str) -> bool:
        """提交用户响应"""
        if interaction_id not in self.pending_interactions:
            return False
        
        request = self.pending_interactions[interaction_id]
        
        # 验证响应
        if not self._validate_response(request, response):
            return False
        
        # 设置Future结果
        if interaction_id in self.response_futures:
            future = self.response_futures[interaction_id]
            if not future.done():
                future.set_result(response)
        
        return True
    
    async def cancel_interaction(self, interaction_id: str) -> bool:
        """取消交互"""
        if interaction_id not in self.pending_interactions:
            return False
        
        if interaction_id in self.response_futures:
            future = self.response_futures[interaction_id]
            if not future.done():
                future.cancel()
        
        self._cleanup_interaction(interaction_id)
        return True
    
    def _validate_response(self, request: InteractionRequest, response: str) -> bool:
        """验证用户响应"""
        if request.type == InteractionType.CONFIRMATION:
            return response.lower() in ['y', 'n', 'yes', 'no']
        
        elif request.type == InteractionType.CHOICE_SELECTION:
            if request.options:
                return response in request.options
        
        elif request.type == InteractionType.INPUT_REQUEST:
            return len(response.strip()) > 0
        
        return True
    
    async def _notify_interaction_required(self, task_id: str, request: InteractionRequest):
        """通知前端需要用户交互"""
        notification_data = {
            'type': 'interaction_required',
            'task_id': task_id,
            'interaction_id': request.id,
            'interaction_type': request.type.value,
            'message': request.message,
            'options': request.options,
            'default_value': request.default_value,
            'timeout': request.timeout
        }
        
        # 通过WebSocket发送给前端
        await WebSocketManager.broadcast_to_user(task_id, notification_data)
    
    async def _handle_timeout(self, interaction_id: str, timeout: int):
        """处理交互超时"""
        await asyncio.sleep(timeout)
        
        if interaction_id in self.pending_interactions:
            request = self.pending_interactions[interaction_id]
            
            # 使用默认值或取消
            if request.default_value:
                await self.submit_response(interaction_id, request.default_value)
            else:
                await self.cancel_interaction(interaction_id)
    
    def _cleanup_interaction(self, interaction_id: str):
        """清理交互数据"""
        if interaction_id in self.pending_interactions:
            del self.pending_interactions[interaction_id]
        
        if interaction_id in self.response_futures:
            del self.response_futures[interaction_id]
```

## 5. 命令模板系统

### 5.1 预定义命令模板

```python
from typing import Dict, List, Any
from dataclasses import dataclass

@dataclass
class CommandTemplate:
    """命令模板"""
    id: str
    name: str
    description: str
    category: str
    command: str
    args_template: List[str]
    required_permissions: List[str]
    estimated_duration: int  # seconds
    requires_confirmation: bool = False
    parameters: Dict[str, Any] = None

class CommandTemplateManager:
    """命令模板管理器"""
    
    def __init__(self):
        self.templates = self._load_default_templates()
    
    def _load_default_templates(self) -> Dict[str, CommandTemplate]:
        """加载默认命令模板"""
        return {
            # 项目初始化
            "init_project": CommandTemplate(
                id="init_project",
                name="初始化项目",
                description="初始化一个新的Claude项目",
                category="project",
                command="claude",
                args_template=["project", "init", "--name", "{project_name}"],
                required_permissions=["project:write"],
                estimated_duration=30,
                parameters={
                    "project_name": {
                        "type": "string",
                        "required": True,
                        "description": "项目名称"
                    }
                }
            ),
            
            # 代码分析
            "analyze_code": CommandTemplate(
                id="analyze_code",
                name="分析代码",
                description="分析项目代码质量和潜在问题",
                category="analysis",
                command="claude",
                args_template=["analyze", "--file", "{file_path}", "--format", "json"],
                required_permissions=["project:read"],
                estimated_duration=60,
                parameters={
                    "file_path": {
                        "type": "string",
                        "required": True,
                        "description": "要分析的文件路径"
                    }
                }
            ),
            
            # 代码重构
            "refactor_code": CommandTemplate(
                id="refactor_code",
                name="重构代码",
                description="自动重构指定的代码文件",
                category="refactoring",
                command="claude",
                args_template=["refactor", "--file", "{file_path}", "--style", "{style}"],
                required_permissions=["project:write"],
                estimated_duration=120,
                requires_confirmation=True,
                parameters={
                    "file_path": {
                        "type": "string",
                        "required": True,
                        "description": "要重构的文件路径"
                    },
                    "style": {
                        "type": "choice",
                        "options": ["clean", "optimize", "modern"],
                        "default": "clean",
                        "description": "重构风格"
                    }
                }
            ),
            
            # 测试生成
            "generate_tests": CommandTemplate(
                id="generate_tests",
                name="生成测试",
                description="为指定文件生成单元测试",
                category="testing",
                command="claude",
                args_template=["test", "generate", "--file", "{file_path}", "--framework", "{framework}"],
                required_permissions=["project:write"],
                estimated_duration=90,
                parameters={
                    "file_path": {
                        "type": "string",
                        "required": True,
                        "description": "要生成测试的文件路径"
                    },
                    "framework": {
                        "type": "choice",
                        "options": ["jest", "pytest", "junit", "mocha"],
                        "default": "jest",
                        "description": "测试框架"
                    }
                }
            ),
            
            # 文档生成
            "generate_docs": CommandTemplate(
                id="generate_docs",
                name="生成文档",
                description="自动生成代码文档",
                category="documentation",
                command="claude",
                args_template=["doc", "generate", "--input", "{input_path}", "--output", "{output_path}"],
                required_permissions=["project:write"],
                estimated_duration=60,
                parameters={
                    "input_path": {
                        "type": "string",
                        "required": True,
                        "description": "输入路径"
                    },
                    "output_path": {
                        "type": "string",
                        "default": "./docs",
                        "description": "输出路径"
                    }
                }
            )
        }
    
    def get_template(self, template_id: str) -> Optional[CommandTemplate]:
        """获取命令模板"""
        return self.templates.get(template_id)
    
    def list_templates(self, category: str = None) -> List[CommandTemplate]:
        """列出命令模板"""
        templates = list(self.templates.values())
        
        if category:
            templates = [t for t in templates if t.category == category]
        
        return templates
    
    def build_command(self, template_id: str, parameters: Dict[str, Any]) -> Dict:
        """根据模板构建命令"""
        template = self.get_template(template_id)
        if not template:
            raise ValueError(f"Template {template_id} not found")
        
        # 验证参数
        missing_params = []
        for param_name, param_config in (template.parameters or {}).items():
            if param_config.get("required", False) and param_name not in parameters:
                missing_params.append(param_name)
        
        if missing_params:
            raise ValueError(f"Missing required parameters: {missing_params}")
        
        # 替换参数
        args = []
        for arg_template in template.args_template:
            arg = arg_template
            for param_name, param_value in parameters.items():
                placeholder = f"{{{param_name}}}"
                if placeholder in arg:
                    arg = arg.replace(placeholder, str(param_value))
            args.append(arg)
        
        return {
            "command": template.command,
            "args": args,
            "template_id": template_id,
            "estimated_duration": template.estimated_duration,
            "requires_confirmation": template.requires_confirmation,
            "required_permissions": template.required_permissions
        }
```

## 6. 执行历史和审计

### 6.1 执行记录

```python
@dataclass
class ExecutionRecord:
    """执行记录"""
    id: str
    task_id: str
    project_id: str
    user_id: str
    command: str
    args: List[str]
    template_id: Optional[str]
    
    # 执行信息
    started_at: datetime
    completed_at: Optional[datetime]
    duration: Optional[float]
    exit_code: Optional[int]
    status: str  # running, completed, failed, cancelled
    
    # 资源使用
    max_cpu_usage: float
    max_memory_usage: int
    total_disk_io: int
    total_network_io: int
    
    # 输出信息
    stdout_lines: int
    stderr_lines: int
    output_size: int
    
    # 交互信息
    interactions_count: int
    confirmations_required: int

class ExecutionHistoryManager:
    """执行历史管理器"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def record_execution_start(
        self,
        task_id: str,
        project_id: str,
        user_id: str,
        command: str,
        args: List[str],
        template_id: str = None
    ) -> ExecutionRecord:
        """记录执行开始"""
        record = ExecutionRecord(
            id=str(uuid.uuid4()),
            task_id=task_id,
            project_id=project_id,
            user_id=user_id,
            command=command,
            args=args,
            template_id=template_id,
            started_at=datetime.utcnow(),
            status="running",
            max_cpu_usage=0.0,
            max_memory_usage=0,
            total_disk_io=0,
            total_network_io=0,
            stdout_lines=0,
            stderr_lines=0,
            output_size=0,
            interactions_count=0,
            confirmations_required=0
        )
        
        # 保存到数据库
        execution_log = ExecutionLog(**asdict(record))
        self.db.add(execution_log)
        await self.db.commit()
        
        return record
    
    async def update_execution_status(
        self,
        record_id: str,
        status: str,
        exit_code: int = None,
        resource_usage: ResourceUsage = None
    ):
        """更新执行状态"""
        update_data = {
            'status': status,
            'updated_at': datetime.utcnow()
        }
        
        if status in ['completed', 'failed', 'cancelled']:
            update_data['completed_at'] = datetime.utcnow()
            
        if exit_code is not None:
            update_data['exit_code'] = exit_code
            
        if resource_usage:
            update_data['max_cpu_usage'] = resource_usage.cpu_percent
            update_data['max_memory_usage'] = resource_usage.memory_used
        
        stmt = (
            update(ExecutionLog)
            .where(ExecutionLog.id == record_id)
            .values(**update_data)
        )
        
        await self.db.execute(stmt)
        await self.db.commit()
    
    async def get_execution_history(
        self,
        project_id: str,
        user_id: str = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[ExecutionRecord]:
        """获取执行历史"""
        stmt = (
            select(ExecutionLog)
            .where(ExecutionLog.project_id == project_id)
            .order_by(ExecutionLog.started_at.desc())
            .limit(limit)
            .offset(offset)
        )
        
        if user_id:
            stmt = stmt.where(ExecutionLog.user_id == user_id)
        
        result = await self.db.execute(stmt)
        logs = result.scalars().all()
        
        return [ExecutionRecord(**log.to_dict()) for log in logs]
```

## 7. API接口设计

### 7.1 执行相关接口

```yaml
# 执行命令
POST /api/v1/projects/{project_id}/execute:
  summary: 执行Claude CLI命令
  security:
    - BearerAuth: []
  parameters:
    - name: project_id
      in: path
      required: true
      schema:
        type: string
  requestBody:
    required: true
    content:
      application/json:
        schema:
          type: object
          properties:
            command:
              type: string
            args:
              type: array
              items:
                type: string
            template_id:
              type: string
            parameters:
              type: object
            interactive:
              type: boolean
              default: true
            timeout:
              type: integer
              default: 3600
          required:
            - command

# 发送用户输入
POST /api/v1/tasks/{task_id}/input:
  summary: 发送用户输入到执行中的命令
  security:
    - BearerAuth: []
  parameters:
    - name: task_id
      in: path
      required: true
      schema:
        type: string
  requestBody:
    required: true
    content:
      application/json:
        schema:
          type: object
          properties:
            input:
              type: string
          required:
            - input

# 取消执行
POST /api/v1/tasks/{task_id}/cancel:
  summary: 取消任务执行
  security:
    - BearerAuth: []
  parameters:
    - name: task_id
      in: path
      required: true
      schema:
        type: string

# 获取命令模板
GET /api/v1/command-templates:
  summary: 获取可用的命令模板
  security:
    - BearerAuth: []
  parameters:
    - name: category
      in: query
      schema:
        type: string

# 获取执行历史
GET /api/v1/projects/{project_id}/executions:
  summary: 获取项目执行历史
  security:
    - BearerAuth: []
  parameters:
    - name: project_id
      in: path
      required: true
      schema:
        type: string
    - name: limit
      in: query
      schema:
        type: integer
        default: 50
    - name: offset
      in: query
      schema:
        type: integer
        default: 0

# 获取资源使用情况
GET /api/v1/tasks/{task_id}/resources:
  summary: 获取任务资源使用情况
  security:
    - BearerAuth: []
  parameters:
    - name: task_id
      in: path
      required: true
      schema:
        type: string
```

这个Claude CLI执行引擎设计提供了完整的命令执行框架，支持安全隔离、实时交互、资源监控和状态管理。通过容器化技术确保执行环境的安全性和一致性。