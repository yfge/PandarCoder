# API 端点设计

## 认证相关

### POST /api/auth/register
用户注册
```json
{
  "username": "string",
  "email": "string", 
  "password": "string"
}
```

### POST /api/auth/login
用户登录
```json
{
  "username": "string",
  "password": "string"
}
```

### POST /api/auth/refresh
刷新Token

## 项目管理

### GET /api/projects
获取用户项目列表

### POST /api/projects
创建新项目
```json
{
  "name": "string",
  "git_url": "string",
  "ssh_key": "string",
  "description": "string"
}
```

### GET /api/projects/{project_id}
获取项目详情

### PUT /api/projects/{project_id}
更新项目配置

### DELETE /api/projects/{project_id}
删除项目

## 命令执行

### POST /api/projects/{project_id}/commands
执行Claude命令
```json
{
  "command": "string",
  "args": ["string"],
  "require_confirmation": true
}
```

### GET /api/projects/{project_id}/tasks
获取任务列表

### GET /api/tasks/{task_id}
获取任务详情

### GET /api/tasks/{task_id}/logs
获取任务日志

### POST /api/tasks/{task_id}/confirm
确认任务继续执行

### POST /api/tasks/{task_id}/cancel
取消任务执行

## 通知管理

### GET /api/notifications
获取通知列表

### POST /api/notifications/settings
配置通知设置
```json
{
  "feishu_webhook": "string",
  "email": "string",
  "enabled_types": ["task_complete", "confirmation_required"]
}
```

## WebSocket 事件

### 连接 /ws/projects/{project_id}
实时任务状态更新

#### 事件类型
- `task_started`: 任务开始
- `task_progress`: 任务进度更新  
- `task_completed`: 任务完成
- `task_failed`: 任务失败
- `confirmation_required`: 需要用户确认