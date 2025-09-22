# 通知系统和第三方集成设计文档

## 1. 通知系统概览

### 1.1 设计目标
- **多渠道支持**: 飞书、邮件、短信、WebSocket等多种通知方式
- **智能分发**: 根据用户偏好和紧急程度自动选择通知渠道
- **模板化**: 支持自定义通知模板，多语言本地化
- **高可用**: 支持失败重试、降级方案，保证通知送达

### 1.2 架构概览
```
┌─────────────────────────────────────────────────────────────────┐
│                      通知系统架构                                │
├─────────────────┬─────────────────┬─────────────────┬─────────────┤
│   消息分发器    │   渠道适配器    │   模板引擎      │   配置中心   │
│                 │                 │                 │             │
│ ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────┐ │
│ │路由规则     │ │ │飞书Bot      │ │ │Jinja2模板   │ │ │用户偏好 │ │
│ │优先级队列   │ │ │SMTP邮件     │ │ │多语言       │ │ │渠道配置 │ │
│ │批量处理     │ │ │短信服务     │ │ │变量替换     │ │ │限流规则 │ │
│ └─────────────┘ │ └─────────────┘ │ └─────────────┘ │ └─────────┘ │
└─────────────────┴─────────────────┴─────────────────┴─────────────┘
                               │
┌─────────────────────────────────────────────────────────────────┐
│                      业务集成层                                  │
├─────────────────┬─────────────────┬─────────────────┬─────────────┤
│   事件监听      │   Webhook接收   │   统计分析      │   监控告警   │
│                 │                 │                 │             │
│ ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────┐ │
│ │任务事件     │ │ │GitHub       │ │ │送达率       │ │ │失败告警 │ │
│ │系统事件     │ │ │GitLab       │ │ │打开率       │ │ │性能监控 │ │
│ │用户事件     │ │ │自定义Hook   │ │ │点击率       │ │ │容量告警 │ │
│ └─────────────┘ │ └─────────────┘ │ └─────────────┘ │ └─────────┘ │
└─────────────────┴─────────────────┴─────────────────┴─────────────┘
```

## 2. 核心通知服务

### 2.1 通知数据模型

```python
# app/models/notification.py
from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, Enum, JSON
from sqlalchemy.sql import func
from app.db.database import Base
import enum

class NotificationType(str, enum.Enum):
    """通知类型"""
    TASK_STARTED = "task_started"
    TASK_COMPLETED = "task_completed"
    TASK_FAILED = "task_failed"
    TASK_CONFIRMATION = "task_confirmation_required"
    
    PROJECT_INVITATION = "project_invitation"
    PROJECT_MEMBER_JOINED = "project_member_joined"
    PROJECT_MEMBER_LEFT = "project_member_left"
    
    SYSTEM_MAINTENANCE = "system_maintenance"
    SYSTEM_ALERT = "system_alert"
    SECURITY_ALERT = "security_alert"
    
    CUSTOM = "custom"

class NotificationChannel(str, enum.Enum):
    """通知渠道"""
    WEBSOCKET = "websocket"
    EMAIL = "email"
    FEISHU = "feishu"
    SMS = "sms"
    WEBHOOK = "webhook"

class NotificationPriority(str, enum.Enum):
    """通知优先级"""
    LOW = "low"        # 1-3
    NORMAL = "normal"  # 4-6  
    HIGH = "high"      # 7-8
    URGENT = "urgent"  # 9-10

class NotificationStatus(str, enum.Enum):
    """通知状态"""
    PENDING = "pending"
    SENT = "sent"
    DELIVERED = "delivered"
    FAILED = "failed"
    CANCELLED = "cancelled"

class Notification(Base):
    """通知记录表"""
    __tablename__ = "notifications"
    
    id = Column(String(36), primary_key=True)
    
    # 基本信息
    type = Column(Enum(NotificationType), nullable=False)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    priority = Column(Enum(NotificationPriority), default=NotificationPriority.NORMAL)
    
    # 接收者信息
    recipient_id = Column(String(36), nullable=False)
    recipient_type = Column(String(50), default="user")  # user, group, role
    
    # 渠道信息
    channels = Column(JSON)  # 支持的通知渠道列表
    preferred_channel = Column(Enum(NotificationChannel))
    
    # 状态信息
    status = Column(Enum(NotificationStatus), default=NotificationStatus.PENDING)
    sent_at = Column(DateTime(timezone=True))
    delivered_at = Column(DateTime(timezone=True))
    read_at = Column(DateTime(timezone=True))
    
    # 关联信息
    related_type = Column(String(50))  # task, project, system
    related_id = Column(String(36))
    
    # 模板和数据
    template_id = Column(String(100))
    template_data = Column(JSON)
    
    # 发送结果
    delivery_results = Column(JSON)  # 各渠道发送结果
    error_message = Column(Text)
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)
    
    # 时间信息
    scheduled_at = Column(DateTime(timezone=True))  # 计划发送时间
    expires_at = Column(DateTime(timezone=True))    # 过期时间
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class NotificationTemplate(Base):
    """通知模板表"""
    __tablename__ = "notification_templates"
    
    id = Column(String(100), primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    
    # 模板内容（支持多渠道）
    websocket_template = Column(JSON)
    email_template = Column(JSON)
    feishu_template = Column(JSON)
    sms_template = Column(JSON)
    
    # 配置信息
    default_priority = Column(Enum(NotificationPriority), default=NotificationPriority.NORMAL)
    supported_channels = Column(JSON)
    
    # 国际化支持
    locale = Column(String(10), default="zh_CN")
    
    # 状态
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class UserNotificationSettings(Base):
    """用户通知设置表"""
    __tablename__ = "user_notification_settings"
    
    id = Column(String(36), primary_key=True)
    user_id = Column(String(36), nullable=False, unique=True)
    
    # 全局设置
    enabled = Column(Boolean, default=True)
    quiet_hours_start = Column(String(5))  # "22:00"
    quiet_hours_end = Column(String(5))    # "08:00"
    timezone = Column(String(50), default="Asia/Shanghai")
    
    # 渠道偏好
    preferred_channels = Column(JSON)  # 按通知类型配置首选渠道
    
    # 具体渠道配置
    email_address = Column(String(255))
    email_enabled = Column(Boolean, default=True)
    
    feishu_user_id = Column(String(100))
    feishu_enabled = Column(Boolean, default=False)
    
    sms_phone = Column(String(20))
    sms_enabled = Column(Boolean, default=False)
    
    websocket_enabled = Column(Boolean, default=True)
    
    # 订阅设置（按通知类型）
    subscriptions = Column(JSON)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
```

### 2.2 核心通知服务

```python
# app/services/notification.py
from typing import Dict, List, Optional, Any, Union
import asyncio
import uuid
import logging
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.db.database import get_db
from app.models.notification import *
from app.services.template_engine import NotificationTemplateEngine
from app.core.config import settings

logger = logging.getLogger(__name__)

class NotificationService:
    """核心通知服务"""
    
    def __init__(self):
        self.template_engine = NotificationTemplateEngine()
        self.channel_adapters = {}
        self.delivery_queue = asyncio.Queue()
        self._register_adapters()
        
        # 启动后台任务
        asyncio.create_task(self._delivery_worker())
    
    async def send_notification(
        self,
        notification_type: NotificationType,
        recipient_id: str,
        title: str,
        content: str = None,
        template_id: str = None,
        template_data: Dict = None,
        priority: NotificationPriority = NotificationPriority.NORMAL,
        channels: List[NotificationChannel] = None,
        scheduled_at: datetime = None,
        expires_at: datetime = None,
        related_type: str = None,
        related_id: str = None
    ) -> str:
        """发送通知"""
        
        notification_id = str(uuid.uuid4())
        
        # 获取用户通知设置
        user_settings = await self._get_user_settings(recipient_id)
        
        # 确定通知渠道
        if channels is None:
            channels = await self._determine_channels(
                notification_type, recipient_id, priority, user_settings
            )
        
        # 创建通知记录
        notification = Notification(
            id=notification_id,
            type=notification_type,
            title=title,
            content=content or "",
            priority=priority,
            recipient_id=recipient_id,
            channels=channels,
            template_id=template_id,
            template_data=template_data or {},
            related_type=related_type,
            related_id=related_id,
            scheduled_at=scheduled_at,
            expires_at=expires_at
        )
        
        # 保存到数据库
        async with get_db() as db:
            db.add(notification)
            await db.commit()
        
        # 立即发送或加入队列
        if scheduled_at is None or scheduled_at <= datetime.utcnow():
            await self.delivery_queue.put(notification_id)
        else:
            # 定时发送
            asyncio.create_task(self._schedule_delivery(notification_id, scheduled_at))
        
        return notification_id
    
    async def send_bulk_notification(
        self,
        notification_type: NotificationType,
        recipient_ids: List[str],
        title: str,
        content: str = None,
        template_id: str = None,
        template_data: Dict = None,
        priority: NotificationPriority = NotificationPriority.NORMAL
    ) -> List[str]:
        """批量发送通知"""
        
        notification_ids = []
        
        # 批量创建通知任务
        tasks = []
        for recipient_id in recipient_ids:
            task = self.send_notification(
                notification_type=notification_type,
                recipient_id=recipient_id,
                title=title,
                content=content,
                template_id=template_id,
                template_data=template_data,
                priority=priority
            )
            tasks.append(task)
        
        # 并发执行
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for result in results:
            if isinstance(result, str):
                notification_ids.append(result)
            else:
                logger.error(f"Failed to send notification: {result}")
        
        return notification_ids
    
    async def _deliver_notification(self, notification_id: str):
        """投递单个通知"""
        async with get_db() as db:
            # 获取通知信息
            stmt = select(Notification).where(Notification.id == notification_id)
            result = await db.execute(stmt)
            notification = result.scalar_one_or_none()
            
            if not notification:
                logger.error(f"Notification {notification_id} not found")
                return
            
            # 检查是否已过期
            if notification.expires_at and notification.expires_at < datetime.utcnow():
                await self._update_notification_status(
                    db, notification_id, NotificationStatus.CANCELLED
                )
                return
            
            # 渲染通知内容
            rendered_content = await self._render_notification(notification)
            if not rendered_content:
                logger.error(f"Failed to render notification {notification_id}")
                return
            
            # 获取用户设置
            user_settings = await self._get_user_settings(notification.recipient_id)
            
            # 检查免打扰时间
            if await self._is_quiet_hours(user_settings):
                # 延后发送
                next_send_time = await self._calculate_next_send_time(user_settings)
                asyncio.create_task(self._schedule_delivery(notification_id, next_send_time))
                return
            
            # 按优先级顺序尝试发送
            delivery_results = {}
            sent_successfully = False
            
            for channel in notification.channels:
                try:
                    adapter = self.channel_adapters.get(channel.value)
                    if not adapter:
                        continue
                    
                    # 发送通知
                    result = await adapter.send(
                        recipient_id=notification.recipient_id,
                        content=rendered_content.get(channel.value, {}),
                        user_settings=user_settings
                    )
                    
                    delivery_results[channel.value] = result
                    
                    if result.get('success'):
                        sent_successfully = True
                        break  # 成功发送，不再尝试其他渠道
                        
                except Exception as e:
                    logger.error(f"Failed to send via {channel.value}: {e}")
                    delivery_results[channel.value] = {
                        'success': False,
                        'error': str(e)
                    }
            
            # 更新通知状态
            if sent_successfully:
                await self._update_notification_status(
                    db, notification_id, NotificationStatus.SENT,
                    delivery_results=delivery_results,
                    sent_at=datetime.utcnow()
                )
            else:
                # 检查是否需要重试
                if notification.retry_count < notification.max_retries:
                    await self._schedule_retry(notification_id, notification.retry_count + 1)
                else:
                    await self._update_notification_status(
                        db, notification_id, NotificationStatus.FAILED,
                        delivery_results=delivery_results,
                        error_message="All delivery attempts failed"
                    )
    
    async def _delivery_worker(self):
        """通知投递工作线程"""
        while True:
            try:
                # 从队列获取通知ID
                notification_id = await self.delivery_queue.get()
                
                # 投递通知
                await self._deliver_notification(notification_id)
                
                # 标记任务完成
                self.delivery_queue.task_done()
                
            except Exception as e:
                logger.error(f"Error in delivery worker: {e}")
                await asyncio.sleep(1)
    
    async def _determine_channels(
        self,
        notification_type: NotificationType,
        recipient_id: str,
        priority: NotificationPriority,
        user_settings: UserNotificationSettings
    ) -> List[NotificationChannel]:
        """确定通知渠道"""
        
        # 获取用户偏好渠道
        preferred_channels = user_settings.preferred_channels or {}
        type_channels = preferred_channels.get(notification_type.value, [])
        
        if type_channels:
            return [NotificationChannel(ch) for ch in type_channels]
        
        # 根据优先级确定默认渠道
        if priority == NotificationPriority.URGENT:
            return [
                NotificationChannel.SMS,
                NotificationChannel.FEISHU,
                NotificationChannel.EMAIL,
                NotificationChannel.WEBSOCKET
            ]
        elif priority == NotificationPriority.HIGH:
            return [
                NotificationChannel.FEISHU,
                NotificationChannel.EMAIL,
                NotificationChannel.WEBSOCKET
            ]
        else:
            return [
                NotificationChannel.WEBSOCKET,
                NotificationChannel.EMAIL
            ]
    
    async def _render_notification(self, notification: Notification) -> Dict:
        """渲染通知内容"""
        try:
            return await self.template_engine.render(
                template_id=notification.template_id,
                notification_type=notification.type,
                title=notification.title,
                content=notification.content,
                data=notification.template_data,
                channels=notification.channels
            )
        except Exception as e:
            logger.error(f"Failed to render notification {notification.id}: {e}")
            return {}
    
    async def _register_adapters(self):
        """注册渠道适配器"""
        from app.services.notification_adapters import (
            WebSocketAdapter, EmailAdapter, FeishuAdapter, SMSAdapter
        )
        
        self.channel_adapters = {
            'websocket': WebSocketAdapter(),
            'email': EmailAdapter(),
            'feishu': FeishuAdapter(),
            'sms': SMSAdapter()
        }
    
    async def _get_user_settings(self, user_id: str) -> UserNotificationSettings:
        """获取用户通知设置"""
        async with get_db() as db:
            stmt = select(UserNotificationSettings).where(
                UserNotificationSettings.user_id == user_id
            )
            result = await db.execute(stmt)
            settings = result.scalar_one_or_none()
            
            # 如果没有设置，创建默认设置
            if not settings:
                settings = UserNotificationSettings(
                    id=str(uuid.uuid4()),
                    user_id=user_id
                )
                db.add(settings)
                await db.commit()
            
            return settings
    
    async def _is_quiet_hours(self, user_settings: UserNotificationSettings) -> bool:
        """检查是否在免打扰时间"""
        if not user_settings.quiet_hours_start or not user_settings.quiet_hours_end:
            return False
        
        import pytz
        from datetime import time
        
        try:
            tz = pytz.timezone(user_settings.timezone)
            now = datetime.now(tz).time()
            
            start_time = time.fromisoformat(user_settings.quiet_hours_start)
            end_time = time.fromisoformat(user_settings.quiet_hours_end)
            
            if start_time <= end_time:
                return start_time <= now <= end_time
            else:
                # 跨日情况
                return now >= start_time or now <= end_time
                
        except Exception as e:
            logger.error(f"Error checking quiet hours: {e}")
            return False
    
    async def _schedule_delivery(self, notification_id: str, send_at: datetime):
        """定时发送通知"""
        delay = (send_at - datetime.utcnow()).total_seconds()
        if delay > 0:
            await asyncio.sleep(delay)
        
        await self.delivery_queue.put(notification_id)
    
    async def _schedule_retry(self, notification_id: str, retry_count: int):
        """安排重试发送"""
        # 指数退避重试
        delay = min(60 * (2 ** retry_count), 3600)  # 最大1小时
        
        async with get_db() as db:
            stmt = (
                update(Notification)
                .where(Notification.id == notification_id)
                .values(retry_count=retry_count)
            )
            await db.execute(stmt)
            await db.commit()
        
        # 延迟重试
        asyncio.create_task(self._delayed_retry(notification_id, delay))
    
    async def _delayed_retry(self, notification_id: str, delay: int):
        """延迟重试"""
        await asyncio.sleep(delay)
        await self.delivery_queue.put(notification_id)
    
    async def _update_notification_status(
        self,
        db: AsyncSession,
        notification_id: str,
        status: NotificationStatus,
        delivery_results: Dict = None,
        sent_at: datetime = None,
        error_message: str = None
    ):
        """更新通知状态"""
        update_data = {'status': status}
        
        if delivery_results:
            update_data['delivery_results'] = delivery_results
        if sent_at:
            update_data['sent_at'] = sent_at
        if error_message:
            update_data['error_message'] = error_message
        
        stmt = (
            update(Notification)
            .where(Notification.id == notification_id)
            .values(**update_data)
        )
        
        await db.execute(stmt)
        await db.commit()


# 全局通知服务实例
notification_service = NotificationService()
```

## 3. 通知渠道适配器

### 3.1 飞书Bot适配器

```python
# app/services/notification_adapters/feishu_adapter.py
import httpx
import json
import logging
from typing import Dict, Any
from app.core.config import settings

logger = logging.getLogger(__name__)

class FeishuAdapter:
    """飞书通知适配器"""
    
    def __init__(self):
        self.app_id = settings.FEISHU_APP_ID
        self.app_secret = settings.FEISHU_APP_SECRET
        self.bot_webhook = settings.FEISHU_BOT_WEBHOOK
        self.access_token = None
        self.token_expires_at = None
    
    async def send(
        self, 
        recipient_id: str, 
        content: Dict[str, Any], 
        user_settings: Any
    ) -> Dict:
        """发送飞书通知"""
        try:
            # 获取访问令牌
            access_token = await self._get_access_token()
            if not access_token:
                return {'success': False, 'error': 'Failed to get access token'}
            
            # 构建消息
            message = await self._build_message(content, user_settings)
            
            # 发送消息
            if user_settings.feishu_user_id:
                # 发送给特定用户
                result = await self._send_direct_message(
                    user_settings.feishu_user_id, message, access_token
                )
            else:
                # 发送到群聊（通过webhook）
                result = await self._send_webhook_message(message)
            
            return result
            
        except Exception as e:
            logger.error(f"Feishu notification error: {e}")
            return {'success': False, 'error': str(e)}
    
    async def _get_access_token(self) -> str:
        """获取访问令牌"""
        from datetime import datetime, timedelta
        
        # 检查token是否有效
        if self.access_token and self.token_expires_at and \
           datetime.utcnow() < self.token_expires_at:
            return self.access_token
        
        # 获取新token
        url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"
        
        payload = {
            "app_id": self.app_id,
            "app_secret": self.app_secret
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("code") == 0:
                    self.access_token = data["tenant_access_token"]
                    # token有效期2小时，提前10分钟刷新
                    self.token_expires_at = datetime.utcnow() + timedelta(seconds=data["expire"] - 600)
                    return self.access_token
        
        return None
    
    async def _send_direct_message(
        self, 
        user_id: str, 
        message: Dict, 
        access_token: str
    ) -> Dict:
        """发送私人消息"""
        url = "https://open.feishu.cn/open-apis/im/v1/messages"
        
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "receive_id": user_id,
            "receive_id_type": "user_id",
            "msg_type": message["msg_type"],
            "content": json.dumps(message["content"])
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=headers, json=payload)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("code") == 0:
                    return {
                        'success': True,
                        'message_id': data["data"]["message_id"]
                    }
                else:
                    return {
                        'success': False,
                        'error': data.get("msg", "Unknown error")
                    }
            else:
                return {
                    'success': False,
                    'error': f"HTTP {response.status_code}: {response.text}"
                }
    
    async def _send_webhook_message(self, message: Dict) -> Dict:
        """通过webhook发送群消息"""
        if not self.bot_webhook:
            return {'success': False, 'error': 'Webhook URL not configured'}
        
        async with httpx.AsyncClient() as client:
            response = await client.post(self.bot_webhook, json=message)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("StatusCode") == 0:
                    return {'success': True}
                else:
                    return {
                        'success': False,
                        'error': data.get("StatusMessage", "Unknown error")
                    }
            else:
                return {
                    'success': False,
                    'error': f"HTTP {response.status_code}: {response.text}"
                }
    
    async def _build_message(
        self, 
        content: Dict[str, Any], 
        user_settings: Any
    ) -> Dict:
        """构建飞书消息"""
        title = content.get('title', '')
        body = content.get('body', '')
        
        # 根据内容类型构建不同格式的消息
        if content.get('type') == 'card':
            return self._build_card_message(title, body, content.get('data', {}))
        else:
            return self._build_text_message(f"{title}\n{body}")
    
    def _build_text_message(self, text: str) -> Dict:
        """构建文本消息"""
        return {
            "msg_type": "text",
            "content": {
                "text": text
            }
        }
    
    def _build_card_message(self, title: str, body: str, data: Dict) -> Dict:
        """构建卡片消息"""
        elements = [
            {
                "tag": "div",
                "text": {
                    "content": body,
                    "tag": "plain_text"
                }
            }
        ]
        
        # 添加按钮（如果有动作）
        if data.get('actions'):
            buttons = []
            for action in data['actions']:
                buttons.append({
                    "tag": "button",
                    "text": {
                        "content": action['title'],
                        "tag": "plain_text"
                    },
                    "url": action.get('url', ''),
                    "type": action.get('type', 'default')
                })
            
            elements.append({
                "tag": "action",
                "actions": buttons
            })
        
        return {
            "msg_type": "interactive",
            "content": {
                "config": {
                    "wide_screen_mode": True
                },
                "header": {
                    "title": {
                        "content": title,
                        "tag": "plain_text"
                    }
                },
                "elements": elements
            }
        }
```

### 3.2 邮件适配器

```python
# app/services/notification_adapters/email_adapter.py
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr
import logging
from typing import Dict, Any
from app.core.config import settings

logger = logging.getLogger(__name__)

class EmailAdapter:
    """邮件通知适配器"""
    
    def __init__(self):
        self.smtp_host = settings.SMTP_HOST
        self.smtp_port = settings.SMTP_PORT
        self.smtp_username = settings.SMTP_USERNAME
        self.smtp_password = settings.SMTP_PASSWORD
        self.smtp_use_tls = settings.SMTP_USE_TLS
        self.sender_email = settings.SENDER_EMAIL
        self.sender_name = settings.SENDER_NAME or "Claude Web"
    
    async def send(
        self, 
        recipient_id: str, 
        content: Dict[str, Any], 
        user_settings: Any
    ) -> Dict:
        """发送邮件通知"""
        try:
            if not user_settings.email_enabled or not user_settings.email_address:
                return {'success': False, 'error': 'Email not enabled or configured'}
            
            # 构建邮件消息
            message = await self._build_email_message(
                recipient_email=user_settings.email_address,
                content=content
            )
            
            # 发送邮件
            await self._send_email(message)
            
            return {'success': True, 'recipient': user_settings.email_address}
            
        except Exception as e:
            logger.error(f"Email notification error: {e}")
            return {'success': False, 'error': str(e)}
    
    async def _build_email_message(
        self, 
        recipient_email: str, 
        content: Dict[str, Any]
    ) -> MIMEMultipart:
        """构建邮件消息"""
        
        message = MIMEMultipart('alternative')
        message['From'] = formataddr((self.sender_name, self.sender_email))
        message['To'] = recipient_email
        message['Subject'] = content.get('subject', content.get('title', ''))
        
        # 添加纯文本内容
        text_content = content.get('text', content.get('body', ''))
        if text_content:
            text_part = MIMEText(text_content, 'plain', 'utf-8')
            message.attach(text_part)
        
        # 添加HTML内容
        html_content = content.get('html')
        if html_content:
            html_part = MIMEText(html_content, 'html', 'utf-8')
            message.attach(html_part)
        elif text_content:
            # 将纯文本转换为简单HTML
            html_content = text_content.replace('\n', '<br>')
            html_part = MIMEText(f'<html><body>{html_content}</body></html>', 'html', 'utf-8')
            message.attach(html_part)
        
        return message
    
    async def _send_email(self, message: MIMEMultipart):
        """发送邮件"""
        smtp = aiosmtplib.SMTP(hostname=self.smtp_host, port=self.smtp_port)
        
        try:
            await smtp.connect()
            
            if self.smtp_use_tls:
                await smtp.starttls()
            
            if self.smtp_username and self.smtp_password:
                await smtp.login(self.smtp_username, self.smtp_password)
            
            await smtp.send_message(message)
            
        finally:
            await smtp.quit()
```

### 3.3 短信适配器

```python
# app/services/notification_adapters/sms_adapter.py
import httpx
import logging
from typing import Dict, Any
from app.core.config import settings

logger = logging.getLogger(__name__)

class SMSAdapter:
    """短信通知适配器"""
    
    def __init__(self):
        self.provider = settings.SMS_PROVIDER  # aliyun, tencent, twilio
        self.api_key = settings.SMS_API_KEY
        self.api_secret = settings.SMS_API_SECRET
        self.sign_name = settings.SMS_SIGN_NAME
    
    async def send(
        self, 
        recipient_id: str, 
        content: Dict[str, Any], 
        user_settings: Any
    ) -> Dict:
        """发送短信通知"""
        try:
            if not user_settings.sms_enabled or not user_settings.sms_phone:
                return {'success': False, 'error': 'SMS not enabled or configured'}
            
            # 构建短信内容
            sms_content = await self._build_sms_content(content)
            
            # 根据服务商发送短信
            if self.provider == 'aliyun':
                result = await self._send_aliyun_sms(user_settings.sms_phone, sms_content)
            elif self.provider == 'tencent':
                result = await self._send_tencent_sms(user_settings.sms_phone, sms_content)
            elif self.provider == 'twilio':
                result = await self._send_twilio_sms(user_settings.sms_phone, sms_content)
            else:
                return {'success': False, 'error': 'Unsupported SMS provider'}
            
            return result
            
        except Exception as e:
            logger.error(f"SMS notification error: {e}")
            return {'success': False, 'error': str(e)}
    
    async def _build_sms_content(self, content: Dict[str, Any]) -> str:
        """构建短信内容"""
        title = content.get('title', '')
        body = content.get('body', '')
        
        # 短信内容限制（通常70个字符）
        sms_text = f"{title}: {body}"
        if len(sms_text) > 70:
            sms_text = sms_text[:67] + "..."
        
        return sms_text
    
    async def _send_aliyun_sms(self, phone: str, content: str) -> Dict:
        """发送阿里云短信"""
        # 阿里云短信API实现
        # 这里是示例实现，实际需要根据阿里云SDK文档实现
        
        import hashlib
        import hmac
        import base64
        from datetime import datetime
        from urllib.parse import quote
        
        # API参数
        params = {
            'Action': 'SendSms',
            'Version': '2017-05-25',
            'RegionId': 'cn-hangzhou',
            'PhoneNumbers': phone,
            'SignName': self.sign_name,
            'TemplateCode': 'SMS_123456789',  # 需要配置模板
            'TemplateParam': f'{{"content":"{content}"}}',
            'Format': 'JSON',
            'Timestamp': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
            'SignatureMethod': 'HMAC-SHA1',
            'SignatureVersion': '1.0',
            'SignatureNonce': str(uuid.uuid4()),
            'AccessKeyId': self.api_key
        }
        
        # 计算签名
        signature = self._calculate_aliyun_signature(params)
        params['Signature'] = signature
        
        # 发送请求
        url = "https://dysmsapi.aliyuncs.com"
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, params=params)
            
            if response.status_code == 200:
                data = response.json()
                if data.get('Code') == 'OK':
                    return {'success': True, 'message_id': data.get('BizId')}
                else:
                    return {'success': False, 'error': data.get('Message')}
            else:
                return {'success': False, 'error': f'HTTP {response.status_code}'}
    
    def _calculate_aliyun_signature(self, params: Dict) -> str:
        """计算阿里云API签名"""
        # 排序参数
        sorted_params = sorted(params.items())
        
        # 构建查询字符串
        query_string = '&'.join([f'{k}={quote(str(v))}' for k, v in sorted_params])
        
        # 构建签名字符串
        string_to_sign = f'POST&%2F&{quote(query_string)}'
        
        # 计算HMAC-SHA1签名
        signature = hmac.new(
            f'{self.api_secret}&'.encode(),
            string_to_sign.encode(),
            hashlib.sha1
        ).digest()
        
        return base64.b64encode(signature).decode()
```

## 4. 通知模板引擎

### 4.1 模板引擎实现

```python
# app/services/template_engine.py
from jinja2 import Environment, DictLoader, select_autoescape
import json
import logging
from typing import Dict, List, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.database import get_db
from app.models.notification import NotificationTemplate, NotificationChannel, NotificationType

logger = logging.getLogger(__name__)

class NotificationTemplateEngine:
    """通知模板引擎"""
    
    def __init__(self):
        self.jinja_env = Environment(
            loader=DictLoader({}),
            autoescape=select_autoescape(['html', 'xml']),
            trim_blocks=True,
            lstrip_blocks=True
        )
        self.template_cache = {}
        
        # 注册过滤器
        self.jinja_env.filters['datetime'] = self._datetime_filter
        self.jinja_env.filters['duration'] = self._duration_filter
    
    async def render(
        self,
        template_id: str = None,
        notification_type: NotificationType = None,
        title: str = "",
        content: str = "",
        data: Dict = None,
        channels: List[NotificationChannel] = None
    ) -> Dict[str, Any]:
        """渲染通知模板"""
        
        # 获取模板
        template = await self._get_template(template_id, notification_type)
        if not template:
            # 使用默认模板
            return await self._render_default_template(title, content, data, channels)
        
        # 准备渲染数据
        render_data = {
            'title': title,
            'content': content,
            'data': data or {},
            'timestamp': datetime.utcnow()
        }
        
        # 渲染各个渠道的内容
        rendered = {}
        
        for channel in channels or []:
            try:
                rendered[channel.value] = await self._render_channel_template(
                    template, channel, render_data
                )
            except Exception as e:
                logger.error(f"Failed to render template for {channel.value}: {e}")
                # 使用默认模板作为备选
                rendered[channel.value] = await self._render_default_channel_template(
                    channel, render_data
                )
        
        return rendered
    
    async def _get_template(
        self, 
        template_id: str = None, 
        notification_type: NotificationType = None
    ) -> Optional[NotificationTemplate]:
        """获取通知模板"""
        
        if template_id:
            # 从缓存获取
            if template_id in self.template_cache:
                return self.template_cache[template_id]
            
            # 从数据库获取
            async with get_db() as db:
                stmt = select(NotificationTemplate).where(
                    NotificationTemplate.id == template_id,
                    NotificationTemplate.is_active == True
                )
                result = await db.execute(stmt)
                template = result.scalar_one_or_none()
                
                if template:
                    self.template_cache[template_id] = template
                    return template
        
        # 根据通知类型获取默认模板
        if notification_type:
            default_template_id = f"default_{notification_type.value}"
            return await self._get_template(default_template_id)
        
        return None
    
    async def _render_channel_template(
        self,
        template: NotificationTemplate,
        channel: NotificationChannel,
        data: Dict
    ) -> Dict[str, Any]:
        """渲染特定渠道的模板"""
        
        # 获取渠道模板配置
        channel_template = None
        if channel == NotificationChannel.EMAIL:
            channel_template = template.email_template
        elif channel == NotificationChannel.FEISHU:
            channel_template = template.feishu_template
        elif channel == NotificationChannel.SMS:
            channel_template = template.sms_template
        elif channel == NotificationChannel.WEBSOCKET:
            channel_template = template.websocket_template
        
        if not channel_template:
            return await self._render_default_channel_template(channel, data)
        
        # 渲染模板
        rendered = {}
        for key, template_str in channel_template.items():
            if isinstance(template_str, str):
                jinja_template = self.jinja_env.from_string(template_str)
                rendered[key] = jinja_template.render(**data)
            else:
                rendered[key] = template_str
        
        return rendered
    
    async def _render_default_template(
        self,
        title: str,
        content: str,
        data: Dict,
        channels: List[NotificationChannel]
    ) -> Dict[str, Any]:
        """渲染默认模板"""
        
        render_data = {
            'title': title,
            'content': content,
            'data': data or {},
            'timestamp': datetime.utcnow()
        }
        
        rendered = {}
        for channel in channels or []:
            rendered[channel.value] = await self._render_default_channel_template(
                channel, render_data
            )
        
        return rendered
    
    async def _render_default_channel_template(
        self,
        channel: NotificationChannel,
        data: Dict
    ) -> Dict[str, Any]:
        """渲染默认渠道模板"""
        
        title = data.get('title', '')
        content = data.get('content', '')
        
        if channel == NotificationChannel.EMAIL:
            return {
                'subject': title,
                'text': content,
                'html': f'<html><body><h2>{title}</h2><p>{content}</p></body></html>'
            }
        
        elif channel == NotificationChannel.FEISHU:
            return {
                'title': title,
                'body': content,
                'type': 'text'
            }
        
        elif channel == NotificationChannel.SMS:
            # 短信内容需要简化
            sms_content = f"{title}: {content}"
            if len(sms_content) > 70:
                sms_content = sms_content[:67] + "..."
            
            return {
                'content': sms_content
            }
        
        elif channel == NotificationChannel.WEBSOCKET:
            return {
                'title': title,
                'message': content,
                'data': data.get('data', {}),
                'timestamp': data.get('timestamp').isoformat()
            }
        
        return {}
    
    def _datetime_filter(self, dt, format='%Y-%m-%d %H:%M:%S'):
        """日期时间过滤器"""
        if isinstance(dt, str):
            from datetime import datetime
            dt = datetime.fromisoformat(dt.replace('Z', '+00:00'))
        return dt.strftime(format)
    
    def _duration_filter(self, seconds):
        """时长过滤器"""
        if not isinstance(seconds, (int, float)):
            return str(seconds)
        
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        seconds = int(seconds % 60)
        
        if hours > 0:
            return f"{hours}h {minutes}m {seconds}s"
        elif minutes > 0:
            return f"{minutes}m {seconds}s"
        else:
            return f"{seconds}s"


# 预定义模板
DEFAULT_TEMPLATES = {
    "task_started": {
        "id": "default_task_started",
        "name": "任务开始通知",
        "websocket_template": {
            "title": "任务开始执行",
            "body": "任务 {{ data.task_name }} 已开始执行",
            "type": "info"
        },
        "email_template": {
            "subject": "任务执行通知 - {{ data.task_name }}",
            "text": "您的任务 {{ data.task_name }} 已开始执行。\n\n项目：{{ data.project_name }}\n开始时间：{{ timestamp|datetime }}",
            "html": """
            <html>
            <body>
                <h2>任务执行通知</h2>
                <p>您的任务 <strong>{{ data.task_name }}</strong> 已开始执行。</p>
                <ul>
                    <li>项目：{{ data.project_name }}</li>
                    <li>开始时间：{{ timestamp|datetime }}</li>
                </ul>
            </body>
            </html>
            """
        },
        "feishu_template": {
            "title": "任务执行通知",
            "body": "任务 {{ data.task_name }} 已开始执行",
            "type": "card",
            "data": {
                "actions": [
                    {
                        "title": "查看详情",
                        "url": "{{ data.task_url }}",
                        "type": "primary"
                    }
                ]
            }
        }
    },
    
    "task_completed": {
        "id": "default_task_completed", 
        "name": "任务完成通知",
        "websocket_template": {
            "title": "任务执行完成",
            "body": "任务 {{ data.task_name }} 执行完成，用时 {{ data.duration|duration }}",
            "type": "success"
        },
        "email_template": {
            "subject": "任务完成通知 - {{ data.task_name }}",
            "text": "您的任务 {{ data.task_name }} 已成功完成。\n\n项目：{{ data.project_name }}\n执行时长：{{ data.duration|duration }}\n完成时间：{{ timestamp|datetime }}",
            "html": """
            <html>
            <body>
                <h2 style="color: green;">任务完成通知</h2>
                <p>您的任务 <strong>{{ data.task_name }}</strong> 已成功完成。</p>
                <ul>
                    <li>项目：{{ data.project_name }}</li>
                    <li>执行时长：{{ data.duration|duration }}</li>
                    <li>完成时间：{{ timestamp|datetime }}</li>
                </ul>
            </body>
            </html>
            """
        }
    }
}
```

## 5. API接口设计

### 5.1 通知管理接口

```yaml
# 发送通知
POST /api/v1/notifications:
  summary: 发送通知
  security:
    - BearerAuth: []
  requestBody:
    required: true
    content:
      application/json:
        schema:
          type: object
          properties:
            type:
              type: string
              enum: [task_started, task_completed, task_failed, custom]
            recipient_id:
              type: string
            title:
              type: string
            content:
              type: string
            template_id:
              type: string
            template_data:
              type: object
            priority:
              type: string
              enum: [low, normal, high, urgent]
            channels:
              type: array
              items:
                type: string
                enum: [websocket, email, feishu, sms]
          required:
            - type
            - recipient_id
            - title

# 批量发送通知
POST /api/v1/notifications/bulk:
  summary: 批量发送通知
  security:
    - BearerAuth: []
  requestBody:
    required: true
    content:
      application/json:
        schema:
          type: object
          properties:
            type:
              type: string
            recipient_ids:
              type: array
              items:
                type: string
            title:
              type: string
            content:
              type: string
          required:
            - type
            - recipient_ids
            - title

# 获取通知列表
GET /api/v1/notifications:
  summary: 获取用户通知列表
  security:
    - BearerAuth: []
  parameters:
    - name: status
      in: query
      schema:
        type: string
        enum: [pending, sent, delivered, failed]
    - name: type
      in: query
      schema:
        type: string
    - name: limit
      in: query
      schema:
        type: integer
        default: 50

# 标记通知已读
PUT /api/v1/notifications/{notification_id}/read:
  summary: 标记通知为已读
  security:
    - BearerAuth: []
  parameters:
    - name: notification_id
      in: path
      required: true
      schema:
        type: string

# 获取/更新通知设置
GET /api/v1/notifications/settings:
  summary: 获取用户通知设置
  security:
    - BearerAuth: []

PUT /api/v1/notifications/settings:
  summary: 更新用户通知设置
  security:
    - BearerAuth: []
  requestBody:
    required: true
    content:
      application/json:
        schema:
          type: object
          properties:
            email_enabled:
              type: boolean
            feishu_enabled:
              type: boolean
            sms_enabled:
              type: boolean
            quiet_hours_start:
              type: string
            quiet_hours_end:
              type: string
            preferred_channels:
              type: object

# 测试通知发送
POST /api/v1/notifications/test:
  summary: 测试通知发送
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
              enum: [email, feishu, sms]
            message:
              type: string
          required:
            - channel
            - message
```

这个通知系统设计提供了完整的多渠道通知框架，支持模板化、个性化配置、智能路由和可靠投递，确保重要信息能够及时准确地传达给用户。