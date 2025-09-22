# WebSocket实时通信架构设计文档

## 1. 实时通信概览

### 1.1 设计目标
- **实时性**: Claude CLI执行过程的实时输出和状态同步
- **可靠性**: 消息投递保证，支持断线重连和消息缓存
- **扩展性**: 支持多实例部署，水平扩展能力
- **安全性**: 连接认证，消息加密，防止信息泄露

### 1.2 架构概览
```
┌─────────────────────────────────────────────────────────────────┐
│                    WebSocket通信架构                             │
├─────────────────┬─────────────────┬─────────────────┬─────────────┤
│   连接管理层    │   消息路由层    │   频道管理层    │   持久化层   │
│                 │                 │                 │             │
│ ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────┐ │
│ │连接池       │ │ │消息分发     │ │ │房间管理     │ │ │消息存储 │ │
│ │心跳监控     │ │ │事件路由     │ │ │频道订阅     │ │ │离线消息 │ │
│ │状态同步     │ │ │负载均衡     │ │ │权限控制     │ │ │历史记录 │ │
│ └─────────────┘ │ └─────────────┘ │ └─────────────┘ │ └─────────┘ │
└─────────────────┴─────────────────┴─────────────────┴─────────────┘
                               │
┌─────────────────────────────────────────────────────────────────┐
│                      业务集成层                                  │
├─────────────────┬─────────────────┬─────────────────┬─────────────┤
│   任务事件      │   项目事件      │   系统事件      │   用户事件   │
│                 │                 │                 │             │
│ ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────┐ │
│ │执行状态     │ │ │Git更新      │ │ │系统告警     │ │ │用户操作 │ │
│ │进度更新     │ │ │成员变更     │ │ │资源监控     │ │ │在线状态 │ │
│ │输出流       │ │ │配置变更     │ │ │服务状态     │ │ │消息通知 │ │
│ └─────────────┘ │ └─────────────┘ │ └─────────────┘ │ └─────────┘ │
└─────────────────┴─────────────────┴─────────────────┴─────────────┘
```

## 2. WebSocket服务实现

### 2.1 FastAPI WebSocket集成

```python
# app/websocket/manager.py
from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, List, Set, Optional, Any, Callable
import asyncio
import json
import uuid
import time
import logging
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)

@dataclass
class ConnectionInfo:
    """连接信息"""
    connection_id: str
    user_id: str
    project_id: Optional[str]
    websocket: WebSocket
    connected_at: datetime
    last_ping: datetime
    subscriptions: Set[str]  # 订阅的频道
    metadata: Dict[str, Any]

@dataclass
class Message:
    """WebSocket消息"""
    id: str
    type: str
    channel: str
    data: Any
    timestamp: datetime
    sender_id: Optional[str] = None
    target_user_id: Optional[str] = None
    priority: int = 5
    ttl: int = 3600  # 消息存活时间(秒)

class WebSocketManager:
    """WebSocket连接管理器"""
    
    def __init__(self):
        # 活跃连接池
        self.active_connections: Dict[str, ConnectionInfo] = {}
        
        # 用户连接映射 (user_id -> [connection_ids])
        self.user_connections: Dict[str, Set[str]] = {}
        
        # 频道订阅映射 (channel -> [connection_ids])
        self.channel_subscriptions: Dict[str, Set[str]] = {}
        
        # 消息处理器
        self.message_handlers: Dict[str, Callable] = {}
        
        # Redis连接
        self.redis = None
        
        # 心跳任务
        self.heartbeat_task: Optional[asyncio.Task] = None
        
    async def connect(
        self, 
        websocket: WebSocket, 
        user_id: str,
        project_id: str = None,
        metadata: Dict = None
    ) -> str:
        """建立WebSocket连接"""
        await websocket.accept()
        
        connection_id = str(uuid.uuid4())
        now = datetime.utcnow()
        
        # 创建连接信息
        connection_info = ConnectionInfo(
            connection_id=connection_id,
            user_id=user_id,
            project_id=project_id,
            websocket=websocket,
            connected_at=now,
            last_ping=now,
            subscriptions=set(),
            metadata=metadata or {}
        )
        
        # 存储连接信息
        self.active_connections[connection_id] = connection_info
        
        # 更新用户连接映射
        if user_id not in self.user_connections:
            self.user_connections[user_id] = set()
        self.user_connections[user_id].add(connection_id)
        
        # 启动心跳监控（如果尚未启动）
        if not self.heartbeat_task:
            self.heartbeat_task = asyncio.create_task(self._heartbeat_monitor())
        
        # 发送连接成功消息
        await self._send_to_connection(connection_id, {
            'type': 'connection_established',
            'connection_id': connection_id,
            'timestamp': now.isoformat()
        })
        
        # 自动订阅用户频道
        await self._subscribe_channel(connection_id, f"user:{user_id}")
        
        # 如果有项目，订阅项目频道
        if project_id:
            await self._subscribe_channel(connection_id, f"project:{project_id}")
        
        # 发送离线消息
        await self._send_offline_messages(connection_id, user_id)
        
        logger.info(f"WebSocket connected: {connection_id} (user: {user_id})")
        return connection_id
    
    async def disconnect(self, connection_id: str):
        """断开WebSocket连接"""
        if connection_id not in self.active_connections:
            return
        
        connection_info = self.active_connections[connection_id]
        user_id = connection_info.user_id
        
        # 从频道订阅中移除
        for channel in list(connection_info.subscriptions):
            await self._unsubscribe_channel(connection_id, channel)
        
        # 从用户连接映射中移除
        if user_id in self.user_connections:
            self.user_connections[user_id].discard(connection_id)
            if not self.user_connections[user_id]:
                del self.user_connections[user_id]
        
        # 移除连接
        del self.active_connections[connection_id]
        
        logger.info(f"WebSocket disconnected: {connection_id}")
    
    async def send_to_user(
        self, 
        user_id: str, 
        message: Dict,
        exclude_connection: str = None
    ):
        """发送消息到用户的所有连接"""
        if user_id not in self.user_connections:
            # 用户不在线，存储为离线消息
            await self._store_offline_message(user_id, message)
            return False
        
        sent_count = 0
        connection_ids = list(self.user_connections[user_id])
        
        for connection_id in connection_ids:
            if connection_id == exclude_connection:
                continue
                
            try:
                await self._send_to_connection(connection_id, message)
                sent_count += 1
            except Exception as e:
                logger.error(f"Failed to send message to connection {connection_id}: {e}")
                await self.disconnect(connection_id)
        
        return sent_count > 0
    
    async def send_to_channel(self, channel: str, message: Dict):
        """发送消息到频道的所有订阅者"""
        if channel not in self.channel_subscriptions:
            return 0
        
        sent_count = 0
        connection_ids = list(self.channel_subscriptions[channel])
        
        for connection_id in connection_ids:
            try:
                await self._send_to_connection(connection_id, message)
                sent_count += 1
            except Exception as e:
                logger.error(f"Failed to send message to connection {connection_id}: {e}")
                await self.disconnect(connection_id)
        
        return sent_count
    
    async def send_to_project(self, project_id: str, message: Dict):
        """发送消息到项目的所有成员"""
        channel = f"project:{project_id}"
        return await self.send_to_channel(channel, message)
    
    async def subscribe_channel(self, connection_id: str, channel: str) -> bool:
        """订阅频道"""
        if connection_id not in self.active_connections:
            return False
        
        return await self._subscribe_channel(connection_id, channel)
    
    async def unsubscribe_channel(self, connection_id: str, channel: str) -> bool:
        """取消订阅频道"""
        if connection_id not in self.active_connections:
            return False
        
        return await self._unsubscribe_channel(connection_id, channel)
    
    async def handle_message(self, connection_id: str, message: Dict):
        """处理接收到的消息"""
        try:
            message_type = message.get('type')
            if not message_type:
                await self._send_error(connection_id, "Missing message type")
                return
            
            # 获取消息处理器
            handler = self.message_handlers.get(message_type)
            if not handler:
                await self._send_error(connection_id, f"Unknown message type: {message_type}")
                return
            
            # 执行处理器
            await handler(connection_id, message)
            
        except Exception as e:
            logger.error(f"Error handling message from {connection_id}: {e}")
            await self._send_error(connection_id, "Internal server error")
    
    async def register_message_handler(self, message_type: str, handler: Callable):
        """注册消息处理器"""
        self.message_handlers[message_type] = handler
    
    async def _send_to_connection(self, connection_id: str, message: Dict):
        """发送消息到指定连接"""
        if connection_id not in self.active_connections:
            raise ValueError(f"Connection {connection_id} not found")
        
        connection_info = self.active_connections[connection_id]
        
        # 添加时间戳
        if 'timestamp' not in message:
            message['timestamp'] = datetime.utcnow().isoformat()
        
        try:
            await connection_info.websocket.send_text(json.dumps(message))
        except Exception as e:
            logger.error(f"Failed to send message to {connection_id}: {e}")
            await self.disconnect(connection_id)
            raise
    
    async def _subscribe_channel(self, connection_id: str, channel: str) -> bool:
        """内部频道订阅实现"""
        if connection_id not in self.active_connections:
            return False
        
        connection_info = self.active_connections[connection_id]
        
        # 添加到连接的订阅列表
        connection_info.subscriptions.add(channel)
        
        # 添加到频道订阅映射
        if channel not in self.channel_subscriptions:
            self.channel_subscriptions[channel] = set()
        self.channel_subscriptions[channel].add(connection_id)
        
        # 通知Redis（用于多实例同步）
        await self._notify_channel_subscription(connection_id, channel, 'subscribe')
        
        return True
    
    async def _unsubscribe_channel(self, connection_id: str, channel: str) -> bool:
        """内部频道取消订阅实现"""
        if connection_id not in self.active_connections:
            return False
        
        connection_info = self.active_connections[connection_id]
        
        # 从连接的订阅列表移除
        connection_info.subscriptions.discard(channel)
        
        # 从频道订阅映射移除
        if channel in self.channel_subscriptions:
            self.channel_subscriptions[channel].discard(connection_id)
            if not self.channel_subscriptions[channel]:
                del self.channel_subscriptions[channel]
        
        # 通知Redis
        await self._notify_channel_subscription(connection_id, channel, 'unsubscribe')
        
        return True
    
    async def _heartbeat_monitor(self):
        """心跳监控任务"""
        while True:
            try:
                await asyncio.sleep(30)  # 每30秒检查一次
                
                now = datetime.utcnow()
                timeout_threshold = now - timedelta(seconds=90)  # 90秒超时
                
                # 检查超时连接
                timeout_connections = []
                for connection_id, connection_info in self.active_connections.items():
                    if connection_info.last_ping < timeout_threshold:
                        timeout_connections.append(connection_id)
                
                # 断开超时连接
                for connection_id in timeout_connections:
                    logger.warning(f"Connection {connection_id} timed out")
                    await self.disconnect(connection_id)
                
                # 发送心跳ping到所有活跃连接
                ping_message = {
                    'type': 'ping',
                    'timestamp': now.isoformat()
                }
                
                for connection_id in list(self.active_connections.keys()):
                    try:
                        await self._send_to_connection(connection_id, ping_message)
                    except:
                        # 连接已断开，将在下次循环中清理
                        pass
                
            except Exception as e:
                logger.error(f"Error in heartbeat monitor: {e}")
    
    async def _send_error(self, connection_id: str, error_message: str):
        """发送错误消息"""
        error_msg = {
            'type': 'error',
            'message': error_message,
            'timestamp': datetime.utcnow().isoformat()
        }
        try:
            await self._send_to_connection(connection_id, error_msg)
        except:
            pass  # 连接可能已断开
    
    async def _store_offline_message(self, user_id: str, message: Dict):
        """存储离线消息"""
        if not self.redis:
            from app.core.redis import get_redis
            self.redis = await get_redis()
        
        offline_message = {
            'id': str(uuid.uuid4()),
            'user_id': user_id,
            'message': message,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        # 存储到Redis列表
        await self.redis.lpush(
            f"offline_messages:{user_id}",
            json.dumps(offline_message)
        )
        
        # 设置过期时间（7天）
        await self.redis.expire(f"offline_messages:{user_id}", 86400 * 7)
    
    async def _send_offline_messages(self, connection_id: str, user_id: str):
        """发送离线消息"""
        if not self.redis:
            from app.core.redis import get_redis
            self.redis = await get_redis()
        
        # 获取离线消息
        offline_messages = await self.redis.lrange(f"offline_messages:{user_id}", 0, -1)
        
        if not offline_messages:
            return
        
        # 发送离线消息
        for msg_data in reversed(offline_messages):  # 按时间顺序发送
            try:
                offline_message = json.loads(msg_data)
                await self._send_to_connection(connection_id, offline_message['message'])
            except Exception as e:
                logger.error(f"Failed to send offline message: {e}")
        
        # 清空离线消息
        await self.redis.delete(f"offline_messages:{user_id}")
    
    async def _notify_channel_subscription(
        self, 
        connection_id: str, 
        channel: str, 
        action: str
    ):
        """通知频道订阅变更（用于多实例同步）"""
        if not self.redis:
            from app.core.redis import get_redis
            self.redis = await get_redis()
        
        notification = {
            'connection_id': connection_id,
            'channel': channel,
            'action': action,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        await self.redis.publish(
            'websocket_channel_events',
            json.dumps(notification)
        )
    
    def get_connection_count(self) -> int:
        """获取当前连接数"""
        return len(self.active_connections)
    
    def get_user_connection_count(self, user_id: str) -> int:
        """获取用户连接数"""
        return len(self.user_connections.get(user_id, set()))
    
    def get_channel_subscriber_count(self, channel: str) -> int:
        """获取频道订阅者数量"""
        return len(self.channel_subscriptions.get(channel, set()))


# 全局WebSocket管理器实例
websocket_manager = WebSocketManager()
```

### 2.2 WebSocket路由和处理器

```python
# app/websocket/routes.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from app.websocket.manager import websocket_manager
from app.core.auth import get_current_user_ws
from app.services.project_service import ProjectService
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = None,
    project_id: str = None
):
    """WebSocket连接端点"""
    try:
        # 验证用户身份
        if not token:
            await websocket.close(code=1008, reason="Authentication required")
            return
        
        user = await get_current_user_ws(token)
        if not user:
            await websocket.close(code=1008, reason="Invalid token")
            return
        
        # 验证项目权限
        if project_id:
            project_service = ProjectService()
            has_access = await project_service.check_user_access(project_id, user.id)
            if not has_access:
                await websocket.close(code=1008, reason="Project access denied")
                return
        
        # 建立连接
        connection_id = await websocket_manager.connect(
            websocket=websocket,
            user_id=user.id,
            project_id=project_id,
            metadata={
                'user_agent': websocket.headers.get('user-agent'),
                'client_ip': websocket.client.host
            }
        )
        
        try:
            # 消息循环
            while True:
                # 接收客户端消息
                data = await websocket.receive_text()
                
                try:
                    import json
                    message = json.loads(data)
                    
                    # 更新心跳时间
                    if connection_id in websocket_manager.active_connections:
                        websocket_manager.active_connections[connection_id].last_ping = datetime.utcnow()
                    
                    # 处理消息
                    await websocket_manager.handle_message(connection_id, message)
                    
                except json.JSONDecodeError:
                    await websocket_manager._send_error(connection_id, "Invalid JSON format")
                except Exception as e:
                    logger.error(f"Error processing message: {e}")
                    await websocket_manager._send_error(connection_id, "Message processing error")
        
        except WebSocketDisconnect:
            logger.info(f"WebSocket client disconnected: {connection_id}")
        
        except Exception as e:
            logger.error(f"WebSocket error: {e}")
        
        finally:
            # 清理连接
            await websocket_manager.disconnect(connection_id)
    
    except Exception as e:
        logger.error(f"WebSocket connection error: {e}")
        try:
            await websocket.close(code=1011, reason="Internal server error")
        except:
            pass


# 注册消息处理器
async def setup_message_handlers():
    """设置消息处理器"""
    
    async def handle_ping(connection_id: str, message: Dict):
        """处理ping消息"""
        await websocket_manager._send_to_connection(connection_id, {
            'type': 'pong',
            'timestamp': datetime.utcnow().isoformat()
        })
    
    async def handle_subscribe(connection_id: str, message: Dict):
        """处理频道订阅"""
        channel = message.get('channel')
        if not channel:
            await websocket_manager._send_error(connection_id, "Channel name required")
            return
        
        # 验证频道权限
        if not await _check_channel_permission(connection_id, channel):
            await websocket_manager._send_error(connection_id, "Channel access denied")
            return
        
        success = await websocket_manager.subscribe_channel(connection_id, channel)
        
        await websocket_manager._send_to_connection(connection_id, {
            'type': 'subscription_result',
            'channel': channel,
            'subscribed': success
        })
    
    async def handle_unsubscribe(connection_id: str, message: Dict):
        """处理取消订阅"""
        channel = message.get('channel')
        if not channel:
            await websocket_manager._send_error(connection_id, "Channel name required")
            return
        
        success = await websocket_manager.unsubscribe_channel(connection_id, channel)
        
        await websocket_manager._send_to_connection(connection_id, {
            'type': 'unsubscription_result',
            'channel': channel,
            'unsubscribed': success
        })
    
    async def handle_task_input(connection_id: str, message: Dict):
        """处理任务输入"""
        task_id = message.get('task_id')
        input_data = message.get('input')
        
        if not task_id or input_data is None:
            await websocket_manager._send_error(connection_id, "Task ID and input required")
            return
        
        # 验证任务权限
        connection_info = websocket_manager.active_connections.get(connection_id)
        if not connection_info:
            return
        
        from app.services.task_service import TaskService
        task_service = TaskService()
        
        has_permission = await task_service.check_task_permission(
            task_id, connection_info.user_id, 'execute'
        )
        
        if not has_permission:
            await websocket_manager._send_error(connection_id, "Task access denied")
            return
        
        # 发送输入到执行引擎
        from app.services.claude_execution import ClaudeExecutionEngine
        execution_engine = ClaudeExecutionEngine()
        
        # 创建执行上下文（简化版）
        context = ExecutionContext(
            project_id=connection_info.project_id,
            user_id=connection_info.user_id,
            task_id=task_id,
            working_directory="",  # 将在实际实现中填充
            environment_vars={},
            secrets={}
        )
        
        success = await execution_engine.send_input(context, input_data)
        
        await websocket_manager._send_to_connection(connection_id, {
            'type': 'input_result',
            'task_id': task_id,
            'success': success
        })
    
    async def handle_task_cancel(connection_id: str, message: Dict):
        """处理任务取消"""
        task_id = message.get('task_id')
        
        if not task_id:
            await websocket_manager._send_error(connection_id, "Task ID required")
            return
        
        connection_info = websocket_manager.active_connections.get(connection_id)
        if not connection_info:
            return
        
        from app.services.task_state import TaskStateManager
        state_manager = TaskStateManager()
        
        success = await state_manager.cancel_task(task_id, connection_info.user_id)
        
        await websocket_manager._send_to_connection(connection_id, {
            'type': 'cancel_result',
            'task_id': task_id,
            'success': success
        })
    
    # 注册处理器
    await websocket_manager.register_message_handler('ping', handle_ping)
    await websocket_manager.register_message_handler('subscribe', handle_subscribe)
    await websocket_manager.register_message_handler('unsubscribe', handle_unsubscribe)
    await websocket_manager.register_message_handler('task_input', handle_task_input)
    await websocket_manager.register_message_handler('task_cancel', handle_task_cancel)


async def _check_channel_permission(connection_id: str, channel: str) -> bool:
    """检查频道访问权限"""
    connection_info = websocket_manager.active_connections.get(connection_id)
    if not connection_info:
        return False
    
    user_id = connection_info.user_id
    
    # 解析频道类型
    if channel.startswith('user:'):
        # 用户频道，只能订阅自己的
        target_user_id = channel[5:]
        return target_user_id == user_id
    
    elif channel.startswith('project:'):
        # 项目频道，需要检查项目权限
        project_id = channel[8:]
        from app.services.project_service import ProjectService
        project_service = ProjectService()
        return await project_service.check_user_access(project_id, user_id)
    
    elif channel.startswith('task:'):
        # 任务频道，需要检查任务权限
        task_id = channel[5:]
        from app.services.task_service import TaskService
        task_service = TaskService()
        return await task_service.check_task_permission(task_id, user_id, 'read')
    
    elif channel == 'system':
        # 系统频道，需要管理员权限
        from app.services.user_service import UserService
        user_service = UserService()
        user = await user_service.get_user(user_id)
        return user and user.role in ['admin', 'super_admin']
    
    return False
```

## 3. 多实例支持和消息分发

### 3.1 Redis Pub/Sub集成

```python
# app/websocket/redis_pubsub.py
import asyncio
import json
import logging
from typing import Dict, Any
from app.core.redis import get_redis
from app.websocket.manager import websocket_manager

logger = logging.getLogger(__name__)

class RedisMessageBroker:
    """Redis消息代理"""
    
    def __init__(self):
        self.redis = None
        self.subscriber_task: Optional[asyncio.Task] = None
        self.channels = [
            'websocket_channel_events',  # 频道订阅事件
            'task_events:all',          # 任务事件
            'project_events:all',       # 项目事件
            'system_events:all'         # 系统事件
        ]
    
    async def start(self):
        """启动Redis消息订阅"""
        if not self.redis:
            self.redis = await get_redis()
        
        # 启动订阅任务
        if not self.subscriber_task:
            self.subscriber_task = asyncio.create_task(self._subscribe_loop())
    
    async def stop(self):
        """停止Redis消息订阅"""
        if self.subscriber_task:
            self.subscriber_task.cancel()
            try:
                await self.subscriber_task
            except asyncio.CancelledError:
                pass
            self.subscriber_task = None
    
    async def publish_message(self, channel: str, message: Dict[str, Any]):
        """发布消息到Redis"""
        if not self.redis:
            self.redis = await get_redis()
        
        message_data = {
            **message,
            'instance_id': self._get_instance_id(),
            'timestamp': datetime.utcnow().isoformat()
        }
        
        await self.redis.publish(channel, json.dumps(message_data))
    
    async def _subscribe_loop(self):
        """Redis订阅循环"""
        try:
            pubsub = self.redis.pubsub()
            await pubsub.subscribe(*self.channels)
            
            async for message in pubsub.listen():
                if message['type'] == 'message':
                    await self._handle_redis_message(
                        message['channel'].decode(),
                        message['data'].decode()
                    )
        
        except Exception as e:
            logger.error(f"Redis subscription error: {e}")
        
        finally:
            if pubsub:
                await pubsub.unsubscribe()
                await pubsub.close()
    
    async def _handle_redis_message(self, channel: str, data: str):
        """处理Redis消息"""
        try:
            message = json.loads(data)
            
            # 忽略来自当前实例的消息
            if message.get('instance_id') == self._get_instance_id():
                return
            
            # 根据频道类型处理消息
            if channel == 'websocket_channel_events':
                await self._handle_channel_event(message)
            elif channel == 'task_events:all':
                await self._handle_task_event(message)
            elif channel == 'project_events:all':
                await self._handle_project_event(message)
            elif channel == 'system_events:all':
                await self._handle_system_event(message)
        
        except Exception as e:
            logger.error(f"Error handling Redis message: {e}")
    
    async def _handle_channel_event(self, message: Dict):
        """处理频道事件"""
        # 这些事件用于多实例间同步频道订阅状态
        # 当前实现中主要用于统计和监控
        pass
    
    async def _handle_task_event(self, message: Dict):
        """处理任务事件"""
        event_type = message.get('type')
        task_id = message.get('task_id')
        
        if not task_id:
            return
        
        # 发送到任务频道
        task_channel = f"task:{task_id}"
        await websocket_manager.send_to_channel(task_channel, message)
        
        # 发送到用户频道（如果有用户信息）
        if 'user_id' in message:
            await websocket_manager.send_to_user(message['user_id'], message)
        
        # 发送到项目频道（如果有项目信息）
        if 'project_id' in message:
            await websocket_manager.send_to_project(message['project_id'], message)
    
    async def _handle_project_event(self, message: Dict):
        """处理项目事件"""
        project_id = message.get('project_id')
        
        if not project_id:
            return
        
        # 发送到项目频道
        await websocket_manager.send_to_project(project_id, message)
    
    async def _handle_system_event(self, message: Dict):
        """处理系统事件"""
        # 发送到系统频道
        await websocket_manager.send_to_channel('system', message)
        
        # 如果是紧急事件，发送给所有在线用户
        if message.get('priority', 0) >= 8:
            for user_id in websocket_manager.user_connections:
                await websocket_manager.send_to_user(user_id, message)
    
    def _get_instance_id(self) -> str:
        """获取当前实例ID"""
        import os
        return os.getenv('INSTANCE_ID', 'default')


# 全局消息代理实例
redis_broker = RedisMessageBroker()
```

### 3.2 事件系统集成

```python
# app/websocket/events.py
from typing import Dict, Any, List, Optional
import asyncio
import logging
from datetime import datetime
from app.websocket.redis_pubsub import redis_broker

logger = logging.getLogger(__name__)

class WebSocketEventEmitter:
    """WebSocket事件发射器"""
    
    @staticmethod
    async def emit_task_event(
        event_type: str,
        task_id: str,
        data: Dict[str, Any],
        user_id: str = None,
        project_id: str = None
    ):
        """发射任务事件"""
        event_data = {
            'type': event_type,
            'category': 'task',
            'task_id': task_id,
            'data': data,
            'user_id': user_id,
            'project_id': project_id,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        await redis_broker.publish_message('task_events:all', event_data)
    
    @staticmethod
    async def emit_project_event(
        event_type: str,
        project_id: str,
        data: Dict[str, Any],
        user_id: str = None
    ):
        """发射项目事件"""
        event_data = {
            'type': event_type,
            'category': 'project',
            'project_id': project_id,
            'data': data,
            'user_id': user_id,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        await redis_broker.publish_message('project_events:all', event_data)
    
    @staticmethod
    async def emit_system_event(
        event_type: str,
        data: Dict[str, Any],
        priority: int = 5
    ):
        """发射系统事件"""
        event_data = {
            'type': event_type,
            'category': 'system',
            'data': data,
            'priority': priority,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        await redis_broker.publish_message('system_events:all', event_data)
    
    @staticmethod
    async def emit_user_event(
        event_type: str,
        user_id: str,
        data: Dict[str, Any]
    ):
        """发射用户事件"""
        event_data = {
            'type': event_type,
            'category': 'user',
            'user_id': user_id,
            'data': data,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        # 直接发送给用户，不通过Redis（减少延迟）
        from app.websocket.manager import websocket_manager
        await websocket_manager.send_to_user(user_id, event_data)


# 任务事件类型
class TaskEvents:
    STARTED = "task_started"
    PROGRESS_UPDATE = "task_progress_update"
    OUTPUT = "task_output"
    CONFIRMATION_REQUIRED = "task_confirmation_required"
    PAUSED = "task_paused"
    RESUMED = "task_resumed"
    COMPLETED = "task_completed"
    FAILED = "task_failed"
    CANCELLED = "task_cancelled"
    TIMEOUT = "task_timeout"

# 项目事件类型
class ProjectEvents:
    CREATED = "project_created"
    UPDATED = "project_updated"
    DELETED = "project_deleted"
    MEMBER_ADDED = "project_member_added"
    MEMBER_REMOVED = "project_member_removed"
    GIT_SYNC = "project_git_sync"
    CONFIG_CHANGED = "project_config_changed"

# 系统事件类型
class SystemEvents:
    MAINTENANCE_START = "system_maintenance_start"
    MAINTENANCE_END = "system_maintenance_end"
    SERVICE_DISRUPTION = "system_service_disruption"
    PERFORMANCE_ALERT = "system_performance_alert"
    SECURITY_ALERT = "system_security_alert"
```

## 4. 前端WebSocket客户端

### 4.1 JavaScript WebSocket客户端

```javascript
// frontend/src/lib/websocket.js
class WebSocketClient {
    constructor(options = {}) {
        this.url = options.url || this.getWebSocketUrl();
        this.token = options.token;
        this.projectId = options.projectId;
        
        this.websocket = null;
        this.connectionId = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // 1秒
        
        this.eventHandlers = new Map();
        this.subscriptions = new Set();
        
        // 自动重连
        this.autoReconnect = options.autoReconnect !== false;
    }
    
    getWebSocketUrl() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        return `${protocol}//${host}/ws`;
    }
    
    async connect() {
        if (this.websocket && this.isConnected) {
            return;
        }
        
        try {
            const url = new URL(this.url);
            if (this.token) {
                url.searchParams.set('token', this.token);
            }
            if (this.projectId) {
                url.searchParams.set('project_id', this.projectId);
            }
            
            this.websocket = new WebSocket(url.toString());
            
            this.websocket.onopen = this.handleOpen.bind(this);
            this.websocket.onmessage = this.handleMessage.bind(this);
            this.websocket.onclose = this.handleClose.bind(this);
            this.websocket.onerror = this.handleError.bind(this);
            
        } catch (error) {
            console.error('WebSocket connection failed:', error);
            this.scheduleReconnect();
        }
    }
    
    disconnect() {
        this.autoReconnect = false;
        if (this.websocket) {
            this.websocket.close();
        }
    }
    
    send(message) {
        if (this.websocket && this.isConnected) {
            this.websocket.send(JSON.stringify(message));
            return true;
        }
        return false;
    }
    
    subscribe(channel) {
        this.subscriptions.add(channel);
        
        if (this.isConnected) {
            this.send({
                type: 'subscribe',
                channel: channel
            });
        }
    }
    
    unsubscribe(channel) {
        this.subscriptions.delete(channel);
        
        if (this.isConnected) {
            this.send({
                type: 'unsubscribe',
                channel: channel
            });
        }
    }
    
    on(eventType, handler) {
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, new Set());
        }
        this.eventHandlers.get(eventType).add(handler);
    }
    
    off(eventType, handler) {
        const handlers = this.eventHandlers.get(eventType);
        if (handlers) {
            handlers.delete(handler);
        }
    }
    
    emit(eventType, data) {
        const handlers = this.eventHandlers.get(eventType);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in event handler for ${eventType}:`, error);
                }
            });
        }
    }
    
    handleOpen(event) {
        console.log('WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        // 重新订阅频道
        this.subscriptions.forEach(channel => {
            this.send({
                type: 'subscribe',
                channel: channel
            });
        });
        
        this.emit('connected', event);
    }
    
    handleMessage(event) {
        try {
            const message = JSON.parse(event.data);
            
            // 处理特殊消息类型
            switch (message.type) {
                case 'connection_established':
                    this.connectionId = message.connection_id;
                    break;
                    
                case 'ping':
                    this.send({ type: 'pong' });
                    break;
                    
                case 'error':
                    console.error('WebSocket error:', message.message);
                    this.emit('error', message);
                    return;
            }
            
            this.emit('message', message);
            this.emit(message.type, message);
            
        } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
        }
    }
    
    handleClose(event) {
        console.log('WebSocket disconnected:', event.code, event.reason);
        this.isConnected = false;
        this.connectionId = null;
        
        this.emit('disconnected', event);
        
        if (this.autoReconnect && event.code !== 1000) {
            this.scheduleReconnect();
        }
    }
    
    handleError(event) {
        console.error('WebSocket error:', event);
        this.emit('error', event);
    }
    
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnect attempts reached');
            this.emit('reconnect_failed');
            return;
        }
        
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
        this.reconnectAttempts++;
        
        console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
        
        setTimeout(() => {
            if (this.autoReconnect) {
                this.connect();
            }
        }, delay);
    }
    
    // 任务相关方法
    sendTaskInput(taskId, input) {
        return this.send({
            type: 'task_input',
            task_id: taskId,
            input: input
        });
    }
    
    cancelTask(taskId) {
        return this.send({
            type: 'task_cancel',
            task_id: taskId
        });
    }
    
    subscribeToTask(taskId) {
        this.subscribe(`task:${taskId}`);
    }
    
    subscribeToProject(projectId) {
        this.subscribe(`project:${projectId}`);
    }
}

export default WebSocketClient;
```

### 4.2 React WebSocket Hook

```javascript
// frontend/src/hooks/useWebSocket.js
import { useEffect, useRef, useState, useCallback } from 'react';
import WebSocketClient from '@/lib/websocket';
import { useAuth } from '@/contexts/AuthContext';

export function useWebSocket(options = {}) {
    const { token } = useAuth();
    const wsRef = useRef(null);
    const [isConnected, setIsConnected] = useState(false);
    const [connectionError, setConnectionError] = useState(null);
    const [lastMessage, setLastMessage] = useState(null);
    
    // 创建WebSocket连接
    const connect = useCallback(() => {
        if (!token) return;
        
        if (wsRef.current) {
            wsRef.current.disconnect();
        }
        
        wsRef.current = new WebSocketClient({
            ...options,
            token: token
        });
        
        // 设置事件监听器
        wsRef.current.on('connected', () => {
            setIsConnected(true);
            setConnectionError(null);
        });
        
        wsRef.current.on('disconnected', () => {
            setIsConnected(false);
        });
        
        wsRef.current.on('error', (error) => {
            setConnectionError(error);
        });
        
        wsRef.current.on('message', (message) => {
            setLastMessage(message);
        });
        
        wsRef.current.connect();
    }, [token, options]);
    
    // 发送消息
    const sendMessage = useCallback((message) => {
        if (wsRef.current) {
            return wsRef.current.send(message);
        }
        return false;
    }, []);
    
    // 订阅频道
    const subscribe = useCallback((channel) => {
        if (wsRef.current) {
            wsRef.current.subscribe(channel);
        }
    }, []);
    
    // 取消订阅
    const unsubscribe = useCallback((channel) => {
        if (wsRef.current) {
            wsRef.current.unsubscribe(channel);
        }
    }, []);
    
    // 监听事件
    const on = useCallback((eventType, handler) => {
        if (wsRef.current) {
            wsRef.current.on(eventType, handler);
        }
    }, []);
    
    // 取消监听
    const off = useCallback((eventType, handler) => {
        if (wsRef.current) {
            wsRef.current.off(eventType, handler);
        }
    }, []);
    
    // 组件挂载时连接
    useEffect(() => {
        connect();
        
        return () => {
            if (wsRef.current) {
                wsRef.current.disconnect();
            }
        };
    }, [connect]);
    
    return {
        isConnected,
        connectionError,
        lastMessage,
        sendMessage,
        subscribe,
        unsubscribe,
        on,
        off,
        connect
    };
}

// 任务专用WebSocket Hook
export function useTaskWebSocket(taskId, projectId) {
    const webSocket = useWebSocket({ projectId });
    const [taskEvents, setTaskEvents] = useState([]);
    const [taskStatus, setTaskStatus] = useState(null);
    
    // 监听任务事件
    useEffect(() => {
        if (!webSocket.isConnected || !taskId) return;
        
        // 订阅任务频道
        webSocket.subscribe(`task:${taskId}`);
        
        const handleTaskEvent = (message) => {
            if (message.task_id === taskId) {
                setTaskEvents(prev => [...prev, message]);
                
                if (message.type === 'task_status_change') {
                    setTaskStatus(message.data.status);
                }
            }
        };
        
        webSocket.on('task_status_change', handleTaskEvent);
        webSocket.on('task_progress_update', handleTaskEvent);
        webSocket.on('task_output', handleTaskEvent);
        webSocket.on('task_confirmation_required', handleTaskEvent);
        
        return () => {
            webSocket.off('task_status_change', handleTaskEvent);
            webSocket.off('task_progress_update', handleTaskEvent);
            webSocket.off('task_output', handleTaskEvent);
            webSocket.off('task_confirmation_required', handleTaskEvent);
            webSocket.unsubscribe(`task:${taskId}`);
        };
    }, [webSocket.isConnected, taskId, webSocket]);
    
    // 发送任务输入
    const sendTaskInput = useCallback((input) => {
        return webSocket.sendMessage({
            type: 'task_input',
            task_id: taskId,
            input: input
        });
    }, [webSocket, taskId]);
    
    // 取消任务
    const cancelTask = useCallback(() => {
        return webSocket.sendMessage({
            type: 'task_cancel',
            task_id: taskId
        });
    }, [webSocket, taskId]);
    
    return {
        ...webSocket,
        taskEvents,
        taskStatus,
        sendTaskInput,
        cancelTask
    };
}
```

## 5. API接口设计

### 5.1 WebSocket管理接口

```yaml
# 获取WebSocket连接信息
GET /api/v1/websocket/info:
  summary: 获取WebSocket连接信息
  security:
    - BearerAuth: []
  responses:
    200:
      description: 连接信息
      content:
        application/json:
          schema:
            type: object
            properties:
              endpoint:
                type: string
              protocols:
                type: array
                items:
                  type: string
              max_connections:
                type: integer

# 获取在线用户统计
GET /api/v1/websocket/stats:
  summary: 获取WebSocket统计信息
  security:
    - BearerAuth: []
  responses:
    200:
      description: 统计信息
      content:
        application/json:
          schema:
            type: object
            properties:
              total_connections:
                type: integer
              online_users:
                type: integer
              active_channels:
                type: integer

# 向用户发送消息
POST /api/v1/websocket/send-to-user:
  summary: 向指定用户发送消息
  security:
    - BearerAuth: []
  requestBody:
    required: true
    content:
      application/json:
        schema:
          type: object
          properties:
            user_id:
              type: string
            message:
              type: object
          required:
            - user_id
            - message

# 向频道发送消息
POST /api/v1/websocket/send-to-channel:
  summary: 向指定频道发送消息
  security:
    - BearerAuth: []
  requestBody:
    required: true
    content:
      application/json:
        schema:
          type: object
          properties:
            channel:
              type: string
            message:
              type: object
          required:
            - channel
            - message
```

这个WebSocket实时通信架构设计提供了完整的双向通信框架，支持多实例部署、消息路由、频道管理和事件分发，确保Claude Web应用能够实现真正的实时交互体验。