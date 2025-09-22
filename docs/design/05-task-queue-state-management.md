# 任务队列和状态管理设计文档

## 1. 任务队列系统概览

### 1.1 设计目标
- **异步处理**: 长时间运行的Claude CLI命令异步执行
- **可扩展性**: 支持水平扩展，处理大量并发任务
- **可靠性**: 任务持久化存储，支持失败重试和错误恢复
- **实时性**: 任务状态实时更新，支持优先级调度

### 1.2 架构概览
```
┌─────────────────────────────────────────────────────────────────┐
│                    任务队列系统架构                               │
├─────────────────┬─────────────────┬─────────────────┬─────────────┤
│   任务调度器    │   队列管理器    │   状态管理器    │   监控系统   │
│                 │                 │                 │             │
│ ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────┐ │
│ │优先级队列   │ │ │Redis队列    │ │ │状态机       │ │ │任务监控 │ │
│ │任务分发     │ │ │消息持久化   │ │ │状态同步     │ │ │性能指标 │ │
│ │负载均衡     │ │ │死信队列     │ │ │事件通知     │ │ │告警通知 │ │
│ └─────────────┘ │ └─────────────┘ │ └─────────────┘ │ └─────────┘ │
└─────────────────┴─────────────────┴─────────────────┴─────────────┘
                               │
┌─────────────────────────────────────────────────────────────────┐
│                      执行层架构                                  │
├─────────────────┬─────────────────┬─────────────────┬─────────────┤
│   Worker节点    │   结果存储      │   任务调度      │   错误处理   │
│                 │                 │                 │             │
│ ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────┐ │
│ │Celery Worker│ │ │MySQL结果    │ │ │Cron调度     │ │ │重试机制 │ │
│ │资源限制     │ │ │Redis缓存    │ │ │延时任务     │ │ │错误分类 │ │
│ │并发控制     │ │ │文件存储     │ │ │批量处理     │ │ │死信处理 │ │
│ └─────────────┘ │ └─────────────┘ │ └─────────────┘ │ └─────────┘ │
└─────────────────┴─────────────────┴─────────────────┴─────────────┘
```

## 2. 任务模型设计

### 2.1 任务状态机

```python
from enum import Enum
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Any

class TaskStatus(Enum):
    """任务状态枚举"""
    PENDING = "pending"              # 等待执行
    RECEIVED = "received"            # 已接收
    STARTED = "started"              # 开始执行  
    RUNNING = "running"              # 执行中
    PAUSED = "paused"               # 暂停
    WAITING_CONFIRMATION = "waiting_confirmation"  # 等待用户确认
    SUCCESS = "success"              # 执行成功
    FAILURE = "failure"              # 执行失败
    RETRY = "retry"                  # 重试中
    REVOKED = "revoked"              # 已撤销
    TIMEOUT = "timeout"              # 执行超时

    @classmethod
    def terminal_states(cls) -> List['TaskStatus']:
        """终态状态"""
        return [cls.SUCCESS, cls.FAILURE, cls.REVOKED, cls.TIMEOUT]
    
    @classmethod
    def active_states(cls) -> List['TaskStatus']:
        """活跃状态"""
        return [cls.RUNNING, cls.PAUSED, cls.WAITING_CONFIRMATION]


@dataclass
class TaskDefinition:
    """任务定义"""
    id: str
    name: str
    project_id: str
    user_id: str
    command: str
    args: List[str] = field(default_factory=list)
    
    # 执行配置
    priority: int = 5  # 1-10, 10为最高优先级
    timeout: int = 3600  # 超时时间(秒)
    max_retries: int = 3  # 最大重试次数
    retry_delay: int = 60  # 重试延迟(秒)
    
    # 调度配置
    scheduled_at: Optional[datetime] = None  # 计划执行时间
    depends_on: List[str] = field(default_factory=list)  # 依赖的任务ID
    
    # 元数据
    tags: Dict[str, str] = field(default_factory=dict)
    context: Dict[str, Any] = field(default_factory=dict)
    
    created_at: datetime = field(default_factory=datetime.utcnow)


@dataclass  
class TaskResult:
    """任务结果"""
    task_id: str
    status: TaskStatus
    result: Optional[Any] = None
    error_message: Optional[str] = None
    traceback: Optional[str] = None
    
    # 执行信息
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration: Optional[float] = None
    
    # 资源使用
    max_memory: int = 0
    max_cpu: float = 0.0
    
    # 输出信息
    stdout: str = ""
    stderr: str = ""
    exit_code: Optional[int] = None
    
    # 重试信息
    retry_count: int = 0
    retry_history: List[Dict] = field(default_factory=list)
```

### 2.2 任务状态转换

```python
class TaskStateMachine:
    """任务状态机"""
    
    # 合法的状态转换
    ALLOWED_TRANSITIONS = {
        TaskStatus.PENDING: [
            TaskStatus.RECEIVED, TaskStatus.REVOKED
        ],
        TaskStatus.RECEIVED: [
            TaskStatus.STARTED, TaskStatus.REVOKED
        ],
        TaskStatus.STARTED: [
            TaskStatus.RUNNING, TaskStatus.FAILURE, TaskStatus.REVOKED
        ],
        TaskStatus.RUNNING: [
            TaskStatus.PAUSED, TaskStatus.WAITING_CONFIRMATION,
            TaskStatus.SUCCESS, TaskStatus.FAILURE, TaskStatus.TIMEOUT,
            TaskStatus.REVOKED
        ],
        TaskStatus.PAUSED: [
            TaskStatus.RUNNING, TaskStatus.REVOKED
        ],
        TaskStatus.WAITING_CONFIRMATION: [
            TaskStatus.RUNNING, TaskStatus.REVOKED
        ],
        TaskStatus.FAILURE: [
            TaskStatus.RETRY, TaskStatus.REVOKED
        ],
        TaskStatus.RETRY: [
            TaskStatus.RECEIVED, TaskStatus.FAILURE, TaskStatus.REVOKED
        ],
        # 终态不允许转换
        TaskStatus.SUCCESS: [],
        TaskStatus.REVOKED: [],
        TaskStatus.TIMEOUT: []
    }
    
    @classmethod
    def can_transition(cls, from_status: TaskStatus, to_status: TaskStatus) -> bool:
        """检查状态转换是否合法"""
        allowed = cls.ALLOWED_TRANSITIONS.get(from_status, [])
        return to_status in allowed
    
    @classmethod
    def validate_transition(cls, task_id: str, from_status: TaskStatus, to_status: TaskStatus):
        """验证并记录状态转换"""
        if not cls.can_transition(from_status, to_status):
            raise ValueError(
                f"Invalid status transition for task {task_id}: "
                f"{from_status.value} -> {to_status.value}"
            )
```

## 3. Celery任务队列实现

### 3.1 Celery配置

```python
# celery_config.py
from celery import Celery
from kombu import Exchange, Queue
import os

# Celery配置
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/1")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/2")

# 创建Celery应用
celery_app = Celery(
    "claude_tasks",
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND,
    include=["app.tasks.claude_tasks"]
)

# 配置设置
celery_app.conf.update(
    # 任务序列化
    task_serializer='json',
    result_serializer='json',
    accept_content=['json'],
    
    # 时区设置
    timezone='UTC',
    enable_utc=True,
    
    # 结果过期时间
    result_expires=3600 * 24,  # 24小时
    
    # 任务路由
    task_routes={
        'app.tasks.claude_tasks.execute_claude_command': {'queue': 'claude_execution'},
        'app.tasks.claude_tasks.sync_git_repository': {'queue': 'git_operations'},
        'app.tasks.claude_tasks.send_notification': {'queue': 'notifications'},
    },
    
    # 队列定义
    task_default_queue='default',
    task_queues=[
        Queue('default', Exchange('default'), routing_key='default'),
        Queue('claude_execution', Exchange('claude'), routing_key='claude.execute'),
        Queue('git_operations', Exchange('git'), routing_key='git.operations'),
        Queue('notifications', Exchange('notifications'), routing_key='notifications.send'),
        Queue('high_priority', Exchange('high'), routing_key='high.priority'),
    ],
    
    # Worker配置
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    worker_max_tasks_per_child=1000,
    
    # 重试配置
    task_retry_jitter=True,
    task_retry_max_delay=600,  # 10分钟
    
    # 监控配置
    task_send_sent_event=True,
    task_track_started=True,
    
    # 限流配置
    task_annotations={
        'app.tasks.claude_tasks.execute_claude_command': {
            'rate_limit': '10/m'  # 每分钟最多10个任务
        }
    }
)
```

### 3.2 核心任务定义

```python
# app/tasks/claude_tasks.py
from celery import Task, current_task
from celery.exceptions import Retry, Ignore
from app.core.celery_app import celery_app
from app.services.claude_execution import ClaudeExecutionEngine
from app.services.task_state import TaskStateManager
from app.models.task import Task as TaskModel
import asyncio
import logging

logger = logging.getLogger(__name__)


class BaseClaudeTask(Task):
    """Claude任务基类"""
    
    def on_success(self, retval, task_id, args, kwargs):
        """任务成功回调"""
        logger.info(f"Task {task_id} completed successfully")
        asyncio.run(self._update_task_status(task_id, TaskStatus.SUCCESS, result=retval))
    
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """任务失败回调"""
        logger.error(f"Task {task_id} failed: {exc}")
        asyncio.run(self._update_task_status(
            task_id, 
            TaskStatus.FAILURE, 
            error_message=str(exc),
            traceback=einfo.traceback
        ))
    
    def on_retry(self, exc, task_id, args, kwargs, einfo):
        """任务重试回调"""
        logger.warning(f"Task {task_id} retrying: {exc}")
        asyncio.run(self._update_task_status(task_id, TaskStatus.RETRY))
    
    async def _update_task_status(
        self, 
        task_id: str, 
        status: TaskStatus, 
        result=None, 
        error_message=None, 
        traceback=None
    ):
        """更新任务状态"""
        state_manager = TaskStateManager()
        await state_manager.update_task_status(
            task_id=task_id,
            status=status,
            result=result,
            error_message=error_message,
            traceback=traceback
        )


@celery_app.task(bind=True, base=BaseClaudeTask, name='execute_claude_command')
def execute_claude_command(self, task_definition_dict: dict) -> dict:
    """执行Claude CLI命令"""
    try:
        # 解析任务定义
        task_def = TaskDefinition(**task_definition_dict)
        
        # 更新任务状态为开始执行
        asyncio.run(self._update_task_status(self.request.id, TaskStatus.STARTED))
        
        # 创建执行引擎
        execution_engine = ClaudeExecutionEngine()
        
        # 创建执行上下文
        context = asyncio.run(execution_engine.create_execution_context(
            project_id=task_def.project_id,
            user_id=task_def.user_id,
            task_id=self.request.id
        ))
        
        # 更新状态为运行中
        asyncio.run(self._update_task_status(self.request.id, TaskStatus.RUNNING))
        
        # 执行命令
        result = asyncio.run(self._execute_with_monitoring(
            execution_engine, context, task_def
        ))
        
        return result
        
    except Exception as exc:
        # 判断是否需要重试
        if self.request.retries < task_def.max_retries:
            logger.warning(
                f"Task {self.request.id} failed, retrying "
                f"({self.request.retries + 1}/{task_def.max_retries}): {exc}"
            )
            raise self.retry(countdown=task_def.retry_delay, exc=exc)
        else:
            logger.error(f"Task {self.request.id} failed after all retries: {exc}")
            raise exc
    
    async def _execute_with_monitoring(
        self, 
        engine: ClaudeExecutionEngine, 
        context, 
        task_def: TaskDefinition
    ) -> dict:
        """带监控的命令执行"""
        result = {
            'output': [],
            'exit_code': None,
            'duration': 0,
            'interactions': []
        }
        
        start_time = time.time()
        
        try:
            async for event in engine.execute_command(
                context=context,
                command=task_def.command,
                args=task_def.args,
                timeout=task_def.timeout
            ):
                event_type = event.get('type')
                
                if event_type == 'output':
                    result['output'].append(event)
                    
                elif event_type == 'confirmation_required':
                    # 处理用户确认
                    await self._handle_confirmation_required(event, context)
                    result['interactions'].append(event)
                    
                elif event_type == 'completed':
                    result['exit_code'] = event['exit_code']
                    result['duration'] = event['duration']
                    break
                    
                elif event_type == 'error':
                    raise RuntimeError(event['message'])
                
                # 更新任务进度
                await self._update_task_progress(
                    self.request.id, 
                    len(result['output']), 
                    time.time() - start_time
                )
        
        finally:
            # 清理执行上下文
            await engine.cleanup_context(context)
        
        return result
    
    async def _handle_confirmation_required(self, event: dict, context):
        """处理用户确认请求"""
        task_id = self.request.id
        
        # 更新任务状态为等待确认
        await self._update_task_status(task_id, TaskStatus.WAITING_CONFIRMATION)
        
        # 发送通知给用户
        await self._send_confirmation_notification(task_id, event)
        
        # 等待用户响应（通过Redis监听）
        response = await self._wait_for_user_response(task_id, timeout=300)
        
        if response:
            # 发送用户输入到执行引擎
            execution_engine = ClaudeExecutionEngine()
            await execution_engine.send_input(context, response)
            
            # 恢复运行状态
            await self._update_task_status(task_id, TaskStatus.RUNNING)
        else:
            # 超时或用户取消
            raise TimeoutError("User confirmation timeout")


@celery_app.task(bind=True, base=BaseClaudeTask, name='sync_git_repository')
def sync_git_repository(self, project_id: str, user_id: str) -> dict:
    """同步Git仓库"""
    try:
        from app.services.git_operations import GitOperationService
        
        git_service = GitOperationService()
        result = asyncio.run(git_service.sync_repository(project_id))
        
        return {
            'project_id': project_id,
            'sync_result': result,
            'timestamp': datetime.utcnow().isoformat()
        }
        
    except Exception as exc:
        logger.error(f"Git sync failed for project {project_id}: {exc}")
        raise exc


@celery_app.task(bind=True, name='send_notification')
def send_notification(self, notification_data: dict) -> dict:
    """发送通知"""
    try:
        from app.services.notification import NotificationService
        
        notification_service = NotificationService()
        result = asyncio.run(notification_service.send_notification(notification_data))
        
        return result
        
    except Exception as exc:
        logger.error(f"Notification sending failed: {exc}")
        raise exc


@celery_app.task(bind=True, name='cleanup_expired_tasks')
def cleanup_expired_tasks(self) -> dict:
    """清理过期任务"""
    try:
        from app.services.task_cleanup import TaskCleanupService
        
        cleanup_service = TaskCleanupService()
        result = asyncio.run(cleanup_service.cleanup_expired_tasks())
        
        return {
            'cleaned_tasks': result['cleaned_count'],
            'freed_space': result['freed_space_mb'],
            'timestamp': datetime.utcnow().isoformat()
        }
        
    except Exception as exc:
        logger.error(f"Task cleanup failed: {exc}")
        raise exc
```

## 4. 任务状态管理

### 4.1 状态管理服务

```python
# app/services/task_state.py
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from app.db.database import get_db
from app.models.task import Task as TaskModel
from app.core.redis import get_redis
from typing import Dict, List, Optional
import json
import asyncio

class TaskStateManager:
    """任务状态管理器"""
    
    def __init__(self):
        self.redis = None
        self.db: Optional[AsyncSession] = None
        
    async def _get_redis(self):
        if not self.redis:
            self.redis = await get_redis()
        return self.redis
    
    async def _get_db(self):
        if not self.db:
            self.db = await get_db().__anext__()
        return self.db
    
    async def create_task(self, task_def: TaskDefinition) -> TaskModel:
        """创建任务记录"""
        db = await self._get_db()
        
        task = TaskModel(
            id=task_def.id,
            name=task_def.name,
            project_id=task_def.project_id,
            user_id=task_def.user_id,
            command=task_def.command,
            args=task_def.args,
            status=TaskStatus.PENDING.value,
            priority=task_def.priority,
            timeout=task_def.timeout,
            max_retries=task_def.max_retries,
            retry_delay=task_def.retry_delay,
            scheduled_at=task_def.scheduled_at,
            depends_on=task_def.depends_on,
            tags=task_def.tags,
            context=task_def.context,
            created_at=task_def.created_at
        )
        
        db.add(task)
        await db.commit()
        
        # 缓存任务状态
        await self._cache_task_status(task.id, TaskStatus.PENDING)
        
        return task
    
    async def update_task_status(
        self, 
        task_id: str, 
        status: TaskStatus,
        result: Any = None,
        error_message: str = None,
        traceback: str = None,
        progress: Dict = None
    ):
        """更新任务状态"""
        db = await self._get_db()
        redis = await self._get_redis()
        
        # 获取当前任务
        stmt = select(TaskModel).where(TaskModel.id == task_id)
        result_obj = await db.execute(stmt)
        task = result_obj.scalar_one_or_none()
        
        if not task:
            raise ValueError(f"Task {task_id} not found")
        
        # 验证状态转换
        current_status = TaskStatus(task.status)
        TaskStateMachine.validate_transition(task_id, current_status, status)
        
        # 准备更新数据
        update_data = {
            'status': status.value,
            'updated_at': datetime.utcnow()
        }
        
        if status == TaskStatus.STARTED:
            update_data['started_at'] = datetime.utcnow()
        elif status in TaskStatus.terminal_states():
            update_data['completed_at'] = datetime.utcnow()
            if task.started_at:
                duration = (datetime.utcnow() - task.started_at).total_seconds()
                update_data['duration'] = duration
        
        if result is not None:
            update_data['result'] = json.dumps(result) if not isinstance(result, str) else result
        
        if error_message:
            update_data['error_message'] = error_message
            
        if traceback:
            update_data['traceback'] = traceback
            
        if status == TaskStatus.RETRY:
            update_data['retry_count'] = task.retry_count + 1
        
        # 更新数据库
        stmt = (
            update(TaskModel)
            .where(TaskModel.id == task_id)
            .values(**update_data)
        )
        await db.execute(stmt)
        await db.commit()
        
        # 更新缓存
        await self._cache_task_status(task_id, status)
        
        # 发送状态变更事件
        await self._publish_status_change_event(task_id, status, progress)
        
        # 如果有依赖任务，检查是否可以开始执行
        if status == TaskStatus.SUCCESS:
            await self._check_dependent_tasks(task_id)
    
    async def get_task_status(self, task_id: str) -> Optional[TaskStatus]:
        """获取任务状态"""
        redis = await self._get_redis()
        
        # 首先从缓存获取
        cached_status = await redis.get(f"task_status:{task_id}")
        if cached_status:
            return TaskStatus(cached_status.decode())
        
        # 从数据库获取
        db = await self._get_db()
        stmt = select(TaskModel.status).where(TaskModel.id == task_id)
        result = await db.execute(stmt)
        status = result.scalar_one_or_none()
        
        if status:
            task_status = TaskStatus(status)
            await self._cache_task_status(task_id, task_status)
            return task_status
        
        return None
    
    async def get_task_progress(self, task_id: str) -> Dict:
        """获取任务进度"""
        redis = await self._get_redis()
        
        progress_data = await redis.get(f"task_progress:{task_id}")
        if progress_data:
            return json.loads(progress_data)
        
        return {'percentage': 0, 'current_step': '', 'total_steps': 0}
    
    async def update_task_progress(
        self, 
        task_id: str, 
        percentage: int,
        current_step: str = '',
        total_steps: int = 0,
        details: Dict = None
    ):
        """更新任务进度"""
        redis = await self._get_redis()
        
        progress_data = {
            'percentage': percentage,
            'current_step': current_step,
            'total_steps': total_steps,
            'details': details or {},
            'updated_at': datetime.utcnow().isoformat()
        }
        
        await redis.setex(
            f"task_progress:{task_id}",
            3600,  # 1小时过期
            json.dumps(progress_data)
        )
        
        # 发送进度更新事件
        await self._publish_progress_event(task_id, progress_data)
    
    async def list_user_tasks(
        self, 
        user_id: str,
        status_filter: List[TaskStatus] = None,
        project_id: str = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[TaskModel]:
        """列出用户任务"""
        db = await self._get_db()
        
        stmt = (
            select(TaskModel)
            .where(TaskModel.user_id == user_id)
            .order_by(TaskModel.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        
        if status_filter:
            status_values = [s.value for s in status_filter]
            stmt = stmt.where(TaskModel.status.in_(status_values))
            
        if project_id:
            stmt = stmt.where(TaskModel.project_id == project_id)
        
        result = await db.execute(stmt)
        return result.scalars().all()
    
    async def cancel_task(self, task_id: str, user_id: str) -> bool:
        """取消任务"""
        # 检查任务权限
        task_status = await self.get_task_status(task_id)
        if not task_status:
            return False
        
        if task_status in TaskStatus.terminal_states():
            return False  # 已结束的任务不能取消
        
        # 发送取消信号到Celery
        celery_app.control.revoke(task_id, terminate=True)
        
        # 更新任务状态
        await self.update_task_status(task_id, TaskStatus.REVOKED)
        
        return True
    
    async def _cache_task_status(self, task_id: str, status: TaskStatus):
        """缓存任务状态"""
        redis = await self._get_redis()
        await redis.setex(f"task_status:{task_id}", 3600, status.value)
    
    async def _publish_status_change_event(
        self, 
        task_id: str, 
        status: TaskStatus, 
        progress: Dict = None
    ):
        """发布状态变更事件"""
        redis = await self._get_redis()
        
        event_data = {
            'type': 'task_status_change',
            'task_id': task_id,
            'status': status.value,
            'progress': progress,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        # 发布到Redis频道
        await redis.publish(f"task_events:{task_id}", json.dumps(event_data))
        await redis.publish("task_events:all", json.dumps(event_data))
    
    async def _publish_progress_event(self, task_id: str, progress_data: Dict):
        """发布进度更新事件"""
        redis = await self._get_redis()
        
        event_data = {
            'type': 'task_progress_update',
            'task_id': task_id,
            'progress': progress_data,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        await redis.publish(f"task_events:{task_id}", json.dumps(event_data))
    
    async def _check_dependent_tasks(self, completed_task_id: str):
        """检查依赖任务是否可以开始"""
        db = await self._get_db()
        
        # 查找依赖于此任务的其他任务
        stmt = select(TaskModel).where(
            TaskModel.depends_on.contains([completed_task_id]),
            TaskModel.status == TaskStatus.PENDING.value
        )
        
        result = await db.execute(stmt)
        dependent_tasks = result.scalars().all()
        
        for task in dependent_tasks:
            # 检查所有依赖是否都已完成
            all_dependencies_completed = True
            for dep_task_id in task.depends_on:
                dep_status = await self.get_task_status(dep_task_id)
                if dep_status != TaskStatus.SUCCESS:
                    all_dependencies_completed = False
                    break
            
            # 如果所有依赖都完成，将任务加入队列
            if all_dependencies_completed:
                await self._enqueue_task(task)
    
    async def _enqueue_task(self, task: TaskModel):
        """将任务加入执行队列"""
        task_def = TaskDefinition(
            id=task.id,
            name=task.name,
            project_id=task.project_id,
            user_id=task.user_id,
            command=task.command,
            args=task.args,
            priority=task.priority,
            timeout=task.timeout,
            max_retries=task.max_retries,
            retry_delay=task.retry_delay
        )
        
        # 根据优先级选择队列
        queue_name = 'high_priority' if task_def.priority >= 8 else 'claude_execution'
        
        # 提交到Celery
        execute_claude_command.apply_async(
            args=[task_def.__dict__],
            task_id=task.id,
            queue=queue_name,
            priority=task_def.priority
        )
```

## 5. 任务调度系统

### 5.1 任务调度器

```python
# app/services/task_scheduler.py
from celery.schedules import crontab
from celery import Celery
from typing import Dict, List, Optional
import logging

logger = logging.getLogger(__name__)

class TaskScheduler:
    """任务调度器"""
    
    def __init__(self, celery_app: Celery):
        self.celery_app = celery_app
        self.scheduled_tasks: Dict[str, Dict] = {}
        
    def schedule_periodic_task(
        self,
        name: str,
        task_name: str,
        schedule: str,  # cron表达式
        args: List = None,
        kwargs: Dict = None,
        enabled: bool = True
    ):
        """调度周期性任务"""
        
        # 解析cron表达式
        cron_parts = schedule.split()
        if len(cron_parts) != 5:
            raise ValueError("Invalid cron expression")
        
        minute, hour, day, month, day_of_week = cron_parts
        
        # 创建crontab调度
        cron_schedule = crontab(
            minute=minute,
            hour=hour,
            day_of_month=day,
            month_of_year=month,
            day_of_week=day_of_week
        )
        
        # 添加到Celery beat调度
        self.celery_app.conf.beat_schedule[name] = {
            'task': task_name,
            'schedule': cron_schedule,
            'args': args or [],
            'kwargs': kwargs or {},
            'options': {'queue': 'default'}
        }
        
        self.scheduled_tasks[name] = {
            'task_name': task_name,
            'schedule': schedule,
            'enabled': enabled,
            'created_at': datetime.utcnow()
        }
        
        logger.info(f"Scheduled periodic task: {name}")
    
    def schedule_delayed_task(
        self,
        task_name: str,
        delay_seconds: int,
        args: List = None,
        kwargs: Dict = None
    ) -> str:
        """调度延时任务"""
        
        task = self.celery_app.send_task(
            task_name,
            args=args or [],
            kwargs=kwargs or {},
            countdown=delay_seconds
        )
        
        logger.info(f"Scheduled delayed task: {task.id} (delay: {delay_seconds}s)")
        return task.id
    
    def schedule_at_time(
        self,
        task_name: str,
        eta: datetime,
        args: List = None,
        kwargs: Dict = None
    ) -> str:
        """在指定时间调度任务"""
        
        task = self.celery_app.send_task(
            task_name,
            args=args or [],
            kwargs=kwargs or {},
            eta=eta
        )
        
        logger.info(f"Scheduled task at {eta}: {task.id}")
        return task.id
    
    def cancel_scheduled_task(self, task_id: str) -> bool:
        """取消已调度的任务"""
        try:
            self.celery_app.control.revoke(task_id, terminate=True)
            logger.info(f"Cancelled scheduled task: {task_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to cancel task {task_id}: {e}")
            return False
    
    def list_scheduled_tasks(self) -> Dict:
        """列出已调度的任务"""
        return self.scheduled_tasks
    
    def setup_default_schedules(self):
        """设置默认的周期性任务"""
        
        # 每小时清理过期任务
        self.schedule_periodic_task(
            name="cleanup_expired_tasks",
            task_name="cleanup_expired_tasks",
            schedule="0 * * * *",  # 每小时执行
            enabled=True
        )
        
        # 每天凌晨备份任务数据
        self.schedule_periodic_task(
            name="backup_task_data",
            task_name="backup_task_data",
            schedule="0 2 * * *",  # 每天凌晨2点
            enabled=True
        )
        
        # 每30分钟检查长时间运行的任务
        self.schedule_periodic_task(
            name="check_long_running_tasks",
            task_name="check_long_running_tasks", 
            schedule="*/30 * * * *",  # 每30分钟
            enabled=True
        )
        
        # 每15分钟同步任务统计信息
        self.schedule_periodic_task(
            name="sync_task_statistics",
            task_name="sync_task_statistics",
            schedule="*/15 * * * *",  # 每15分钟
            enabled=True
        )
```

### 5.2 任务优先级管理

```python
class TaskPriorityManager:
    """任务优先级管理器"""
    
    PRIORITY_QUEUES = {
        10: 'critical',      # 紧急任务
        9: 'high_priority',  # 高优先级
        8: 'high_priority',
        7: 'normal',         # 普通优先级
        6: 'normal',
        5: 'normal',         # 默认优先级
        4: 'low',           # 低优先级
        3: 'low',
        2: 'background',    # 后台任务
        1: 'background'
    }
    
    @classmethod
    def get_queue_for_priority(cls, priority: int) -> str:
        """根据优先级获取队列名"""
        return cls.PRIORITY_QUEUES.get(priority, 'normal')
    
    @classmethod
    def calculate_task_priority(
        cls, 
        user_priority: int,
        project_priority: int = 5,
        task_type: str = 'normal',
        deadline: Optional[datetime] = None
    ) -> int:
        """计算任务优先级"""
        
        base_priority = min(user_priority, 10)
        
        # 项目优先级调整
        if project_priority >= 8:
            base_priority += 1
        elif project_priority <= 3:
            base_priority -= 1
        
        # 任务类型调整
        type_modifiers = {
            'critical': 2,
            'urgent': 1,
            'normal': 0,
            'background': -1
        }
        base_priority += type_modifiers.get(task_type, 0)
        
        # 截止时间调整
        if deadline:
            time_to_deadline = deadline - datetime.utcnow()
            if time_to_deadline.total_seconds() < 3600:  # 1小时内
                base_priority += 2
            elif time_to_deadline.total_seconds() < 7200:  # 2小时内
                base_priority += 1
        
        # 确保优先级在有效范围内
        return max(1, min(base_priority, 10))


class TaskLoadBalancer:
    """任务负载均衡器"""
    
    def __init__(self):
        self.worker_stats: Dict[str, Dict] = {}
        self.queue_stats: Dict[str, Dict] = {}
        
    async def get_optimal_queue(
        self, 
        task_priority: int,
        estimated_duration: int = None,
        resource_requirements: Dict = None
    ) -> str:
        """获取最优执行队列"""
        
        # 获取基础队列
        base_queue = TaskPriorityManager.get_queue_for_priority(task_priority)
        
        # 检查队列负载
        queue_load = await self._get_queue_load(base_queue)
        
        # 如果队列负载过高，考虑降级到其他队列
        if queue_load > 0.8 and task_priority < 8:
            alternative_queues = self._get_alternative_queues(base_queue)
            for alt_queue in alternative_queues:
                alt_load = await self._get_queue_load(alt_queue)
                if alt_load < 0.6:
                    return alt_queue
        
        return base_queue
    
    async def _get_queue_load(self, queue_name: str) -> float:
        """获取队列负载"""
        try:
            # 从Celery获取队列统计信息
            inspect = celery_app.control.inspect()
            active_tasks = inspect.active()
            reserved_tasks = inspect.reserved()
            
            total_tasks = 0
            total_capacity = 0
            
            if active_tasks:
                for worker, tasks in active_tasks.items():
                    worker_queue_tasks = [t for t in tasks if t.get('delivery_info', {}).get('routing_key') == queue_name]
                    total_tasks += len(worker_queue_tasks)
                    total_capacity += 1  # 假设每个worker容量为1
            
            if reserved_tasks:
                for worker, tasks in reserved_tasks.items():
                    worker_queue_tasks = [t for t in tasks if t.get('delivery_info', {}).get('routing_key') == queue_name]
                    total_tasks += len(worker_queue_tasks)
            
            return total_tasks / max(total_capacity, 1)
            
        except Exception as e:
            logger.warning(f"Failed to get queue load for {queue_name}: {e}")
            return 0.5  # 默认中等负载
    
    def _get_alternative_queues(self, base_queue: str) -> List[str]:
        """获取备选队列"""
        alternatives = {
            'critical': ['high_priority'],
            'high_priority': ['normal'],
            'normal': ['low'],
            'low': ['background'],
            'background': ['low']
        }
        return alternatives.get(base_queue, ['normal'])
```

## 6. 错误处理和重试机制

### 6.1 错误分类和处理

```python
class TaskErrorClassifier:
    """任务错误分类器"""
    
    ERROR_TYPES = {
        'retriable': [
            'ConnectionError',
            'TimeoutError', 
            'TemporaryFailure',
            'RateLimitError',
            'ServiceUnavailable'
        ],
        'non_retriable': [
            'AuthenticationError',
            'PermissionError',
            'ValidationError',
            'SyntaxError',
            'ConfigurationError'
        ],
        'critical': [
            'SecurityError',
            'DataCorruption',
            'SystemFailure'
        ]
    }
    
    @classmethod
    def classify_error(cls, error: Exception) -> str:
        """分类错误类型"""
        error_name = error.__class__.__name__
        
        for category, error_types in cls.ERROR_TYPES.items():
            if error_name in error_types:
                return category
        
        # 默认为可重试错误
        return 'retriable'
    
    @classmethod
    def should_retry(cls, error: Exception, retry_count: int, max_retries: int) -> bool:
        """判断是否应该重试"""
        error_type = cls.classify_error(error)
        
        # 非可重试错误不重试
        if error_type == 'non_retriable':
            return False
        
        # 关键错误立即停止
        if error_type == 'critical':
            return False
        
        # 检查重试次数
        return retry_count < max_retries
    
    @classmethod
    def get_retry_delay(cls, error: Exception, retry_count: int) -> int:
        """计算重试延迟"""
        error_type = cls.classify_error(error)
        
        # 基础延迟
        base_delay = 60  # 1分钟
        
        # 根据错误类型调整
        if error_type == 'retriable':
            # 指数退避
            delay = base_delay * (2 ** retry_count)
            # 添加随机抖动
            import random
            jitter = random.uniform(0.1, 0.3) * delay
            return int(delay + jitter)
        
        return base_delay


class TaskRetryManager:
    """任务重试管理器"""
    
    def __init__(self):
        self.error_classifier = TaskErrorClassifier()
        
    async def handle_task_failure(
        self,
        task_id: str,
        error: Exception,
        retry_count: int,
        max_retries: int
    ) -> Dict:
        """处理任务失败"""
        
        error_type = self.error_classifier.classify_error(error)
        should_retry = self.error_classifier.should_retry(error, retry_count, max_retries)
        
        result = {
            'task_id': task_id,
            'error_type': error_type,
            'error_message': str(error),
            'retry_count': retry_count,
            'should_retry': should_retry,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        if should_retry:
            # 计算重试延迟
            retry_delay = self.error_classifier.get_retry_delay(error, retry_count)
            result['retry_delay'] = retry_delay
            result['next_retry_at'] = (
                datetime.utcnow() + timedelta(seconds=retry_delay)
            ).isoformat()
            
            # 记录重试信息
            await self._record_retry_attempt(task_id, error, retry_count, retry_delay)
            
        else:
            # 记录失败信息
            await self._record_task_failure(task_id, error, error_type)
            
            # 如果是关键错误，发送告警
            if error_type == 'critical':
                await self._send_critical_error_alert(task_id, error)
        
        return result
    
    async def _record_retry_attempt(
        self,
        task_id: str,
        error: Exception, 
        retry_count: int,
        retry_delay: int
    ):
        """记录重试尝试"""
        redis = await get_redis()
        
        retry_info = {
            'retry_count': retry_count,
            'error_message': str(error),
            'retry_delay': retry_delay,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        # 存储重试历史
        retry_history_key = f"task_retry_history:{task_id}"
        await redis.lpush(retry_history_key, json.dumps(retry_info))
        await redis.expire(retry_history_key, 86400 * 7)  # 保留7天
        
        # 更新重试统计
        stats_key = f"task_retry_stats:{datetime.utcnow().strftime('%Y-%m-%d')}"
        await redis.hincrby(stats_key, 'total_retries', 1)
        await redis.hincrby(stats_key, f"retry_{error.__class__.__name__}", 1)
        await redis.expire(stats_key, 86400 * 30)  # 保留30天
    
    async def _record_task_failure(
        self,
        task_id: str,
        error: Exception,
        error_type: str
    ):
        """记录任务失败"""
        redis = await get_redis()
        
        failure_info = {
            'task_id': task_id,
            'error_type': error_type,
            'error_message': str(error),
            'error_class': error.__class__.__name__,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        # 存储失败记录
        failure_key = f"task_failures:{datetime.utcnow().strftime('%Y-%m-%d')}"
        await redis.lpush(failure_key, json.dumps(failure_info))
        await redis.expire(failure_key, 86400 * 30)  # 保留30天
        
        # 更新失败统计
        stats_key = f"task_failure_stats:{datetime.utcnow().strftime('%Y-%m-%d')}"
        await redis.hincrby(stats_key, 'total_failures', 1)
        await redis.hincrby(stats_key, f"failure_{error_type}", 1)
        await redis.expire(stats_key, 86400 * 30)
    
    async def _send_critical_error_alert(self, task_id: str, error: Exception):
        """发送关键错误告警"""
        from app.services.notification import NotificationService
        
        notification_service = NotificationService()
        
        alert_data = {
            'type': 'critical_task_error',
            'task_id': task_id,
            'error_message': str(error),
            'error_class': error.__class__.__name__,
            'timestamp': datetime.utcnow().isoformat(),
            'severity': 'critical'
        }
        
        await notification_service.send_system_alert(alert_data)
```

## 7. 任务监控和统计

### 7.1 任务监控服务

```python
class TaskMonitoringService:
    """任务监控服务"""
    
    def __init__(self):
        self.redis = None
        self.metrics_collector = MetricsCollector()
        
    async def _get_redis(self):
        if not self.redis:
            self.redis = await get_redis()
        return self.redis
    
    async def collect_task_metrics(self) -> Dict:
        """收集任务指标"""
        redis = await self._get_redis()
        
        # 获取当前活跃任务数
        inspect = celery_app.control.inspect()
        active_tasks = inspect.active() or {}
        reserved_tasks = inspect.reserved() or {}
        
        total_active = sum(len(tasks) for tasks in active_tasks.values())
        total_reserved = sum(len(tasks) for tasks in reserved_tasks.values())
        
        # 获取队列长度
        queue_lengths = {}
        for queue_name in ['claude_execution', 'git_operations', 'notifications', 'high_priority']:
            try:
                queue_length = await redis.llen(f"celery:{queue_name}")
                queue_lengths[queue_name] = queue_length
            except:
                queue_lengths[queue_name] = 0
        
        # 获取今日任务统计
        today = datetime.utcnow().strftime('%Y-%m-%d')
        daily_stats = await redis.hgetall(f"task_stats:{today}")
        
        return {
            'active_tasks': total_active,
            'reserved_tasks': total_reserved,
            'queue_lengths': queue_lengths,
            'daily_stats': {
                'completed': int(daily_stats.get(b'completed', 0)),
                'failed': int(daily_stats.get(b'failed', 0)),
                'cancelled': int(daily_stats.get(b'cancelled', 0)),
                'total': int(daily_stats.get(b'total', 0))
            },
            'timestamp': datetime.utcnow().isoformat()
        }
    
    async def get_task_performance_stats(self, task_type: str = None) -> Dict:
        """获取任务性能统计"""
        redis = await self._get_redis()
        
        # 获取最近7天的性能数据
        stats = {}
        for i in range(7):
            date = (datetime.utcnow() - timedelta(days=i)).strftime('%Y-%m-%d')
            date_key = f"task_perf_stats:{date}"
            
            if task_type:
                date_key += f":{task_type}"
            
            date_stats = await redis.hgetall(date_key)
            if date_stats:
                stats[date] = {
                    'avg_duration': float(date_stats.get(b'avg_duration', 0)),
                    'max_duration': float(date_stats.get(b'max_duration', 0)),
                    'min_duration': float(date_stats.get(b'min_duration', 0)),
                    'total_tasks': int(date_stats.get(b'total_tasks', 0)),
                    'success_rate': float(date_stats.get(b'success_rate', 0))
                }
        
        return stats
    
    async def update_task_performance(
        self,
        task_type: str,
        duration: float,
        status: TaskStatus
    ):
        """更新任务性能指标"""
        redis = await self._get_redis()
        
        date = datetime.utcnow().strftime('%Y-%m-%d')
        perf_key = f"task_perf_stats:{date}:{task_type}"
        
        # 更新平均执行时间
        current_avg = float(await redis.hget(perf_key, 'avg_duration') or 0)
        current_count = int(await redis.hget(perf_key, 'total_tasks') or 0)
        
        new_count = current_count + 1
        new_avg = (current_avg * current_count + duration) / new_count
        
        # 更新统计数据
        pipe = redis.pipeline()
        pipe.hset(perf_key, 'avg_duration', new_avg)
        pipe.hset(perf_key, 'total_tasks', new_count)
        
        # 更新最大最小值
        current_max = float(await redis.hget(perf_key, 'max_duration') or 0)
        current_min = float(await redis.hget(perf_key, 'min_duration') or float('inf'))
        
        if duration > current_max:
            pipe.hset(perf_key, 'max_duration', duration)
        if duration < current_min:
            pipe.hset(perf_key, 'min_duration', duration)
        
        # 更新成功率
        if status == TaskStatus.SUCCESS:
            pipe.hincrby(perf_key, 'success_count', 1)
        
        success_count = int(await redis.hget(perf_key, 'success_count') or 0)
        if status == TaskStatus.SUCCESS:
            success_count += 1
        
        success_rate = success_count / new_count if new_count > 0 else 0
        pipe.hset(perf_key, 'success_rate', success_rate)
        
        # 设置过期时间
        pipe.expire(perf_key, 86400 * 30)  # 保留30天
        
        await pipe.execute()
```

## 8. API接口设计

### 8.1 任务管理接口

```yaml
# 创建任务
POST /api/v1/tasks:
  summary: 创建新任务
  security:
    - BearerAuth: []
  requestBody:
    required: true
    content:
      application/json:
        schema:
          type: object
          properties:
            name:
              type: string
            command:
              type: string
            args:
              type: array
              items:
                type: string
            project_id:
              type: string
            priority:
              type: integer
              minimum: 1
              maximum: 10
              default: 5
            timeout:
              type: integer
              default: 3600
            max_retries:
              type: integer
              default: 3
            scheduled_at:
              type: string
              format: date-time
            depends_on:
              type: array
              items:
                type: string
          required:
            - name
            - command
            - project_id

# 获取任务列表
GET /api/v1/tasks:
  summary: 获取任务列表
  security:
    - BearerAuth: []
  parameters:
    - name: status
      in: query
      schema:
        type: array
        items:
          type: string
          enum: [pending, running, success, failure, cancelled]
    - name: project_id
      in: query
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

# 获取任务详情
GET /api/v1/tasks/{task_id}:
  summary: 获取任务详细信息
  security:
    - BearerAuth: []
  parameters:
    - name: task_id
      in: path
      required: true
      schema:
        type: string

# 取消任务
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

# 重试任务
POST /api/v1/tasks/{task_id}/retry:
  summary: 重试失败的任务
  security:
    - BearerAuth: []
  parameters:
    - name: task_id
      in: path
      required: true
      schema:
        type: string

# 获取任务日志
GET /api/v1/tasks/{task_id}/logs:
  summary: 获取任务执行日志
  security:
    - BearerAuth: []
  parameters:
    - name: task_id
      in: path
      required: true
      schema:
        type: string
    - name: follow
      in: query
      schema:
        type: boolean
        default: false

# 获取任务统计
GET /api/v1/tasks/statistics:
  summary: 获取任务统计信息
  security:
    - BearerAuth: []
  parameters:
    - name: period
      in: query
      schema:
        type: string
        enum: [hour, day, week, month]
        default: day
    - name: project_id
      in: query
      schema:
        type: string
```

这个任务队列和状态管理系统设计提供了完整的异步任务处理框架，支持优先级调度、错误重试、状态监控和性能统计，确保Claude CLI命令能够可靠高效地执行。