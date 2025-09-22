"""
任务相关的Pydantic模型
"""
from typing import Optional, Dict, Any, List
from datetime import datetime
from pydantic import BaseModel, Field, validator
from enum import Enum


class TaskStatus(str, Enum):
    """任务状态枚举"""
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"
    waiting_confirmation = "waiting_confirmation"


class TaskPriority(str, Enum):
    """任务优先级枚举"""
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"


class TaskBase(BaseModel):
    """任务基础字段"""
    name: str = Field(..., min_length=1, max_length=200, description="任务名称")
    description: Optional[str] = Field(None, max_length=1000, description="任务描述")
    command: str = Field(..., min_length=1, max_length=10000, description="Claude CLI命令")
    priority: TaskPriority = Field(TaskPriority.medium, description="任务优先级")

    @validator('name')
    def validate_name(cls, v):
        if not v.strip():
            raise ValueError('任务名称不能为空')
        return v.strip()

    @validator('command')
    def validate_command(cls, v):
        if not v.strip():
            raise ValueError('命令不能为空')
        # 基本的命令安全检查
        dangerous_commands = ['rm -rf', 'sudo', 'su', 'chmod 777', 'dd if=', 'mkfs', 'fdisk']
        command_lower = v.lower()
        for dangerous in dangerous_commands:
            if dangerous in command_lower:
                raise ValueError(f'命令包含危险操作: {dangerous}')
        return v.strip()


class CreateTaskRequest(TaskBase):
    """创建任务请求"""
    project_id: int = Field(..., gt=0, description="项目ID")
    scheduled_at: Optional[datetime] = Field(None, description="计划执行时间")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="元数据")


class UpdateTaskRequest(BaseModel):
    """更新任务请求"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    priority: Optional[TaskPriority] = None
    scheduled_at: Optional[datetime] = None
    metadata: Optional[Dict[str, Any]] = None

    @validator('name')
    def validate_name(cls, v):
        if v is not None and not v.strip():
            raise ValueError('任务名称不能为空')
        return v.strip() if v else v


class TaskResponse(TaskBase):
    """任务响应数据"""
    id: int
    project_id: int
    status: TaskStatus
    created_at: datetime
    updated_at: Optional[datetime]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    duration: Optional[int] = Field(None, description="执行时间（秒）")
    output: Optional[str] = Field(None, description="执行输出")
    error: Optional[str] = Field(None, description="错误信息")
    exit_code: Optional[int] = Field(None, description="退出代码")
    progress: Optional[int] = Field(None, ge=0, le=100, description="进度百分比")
    scheduled_at: Optional[datetime]
    metadata: Optional[Dict[str, Any]]
    created_by: int = Field(..., description="创建者用户ID")

    class Config:
        from_attributes = True


class TaskListParams(BaseModel):
    """任务列表查询参数"""
    page: int = Field(1, ge=1, description="页码")
    limit: int = Field(10, ge=1, le=100, description="每页数量")
    project_id: Optional[int] = Field(None, gt=0, description="项目ID")
    status: Optional[TaskStatus] = Field(None, description="任务状态")
    priority: Optional[TaskPriority] = Field(None, description="任务优先级")
    search: Optional[str] = Field(None, max_length=100, description="搜索关键词")
    created_by: Optional[int] = Field(None, description="创建者ID")
    date_from: Optional[datetime] = Field(None, description="开始日期")
    date_to: Optional[datetime] = Field(None, description="结束日期")
    sort_by: Optional[str] = Field("created_at", pattern="^(created_at|updated_at|priority|status|name)$")
    sort_order: Optional[str] = Field("desc", pattern="^(asc|desc)$")


class TaskListResponse(BaseModel):
    """任务列表响应"""
    items: List[TaskResponse]
    total: int
    page: int
    limit: int
    pages: int


class TaskStats(BaseModel):
    """任务统计数据"""
    total_tasks: int
    pending_tasks: int
    running_tasks: int
    completed_tasks: int
    failed_tasks: int
    cancelled_tasks: int
    success_rate: float = Field(..., ge=0, le=100, description="成功率百分比")
    average_duration: Optional[float] = Field(None, description="平均执行时间（秒）")


class TaskExecution(BaseModel):
    """任务执行信息"""
    task_id: int
    status: TaskStatus
    started_at: Optional[datetime]
    progress: Optional[int] = Field(None, ge=0, le=100)
    current_output: Optional[str] = None
    error_message: Optional[str] = None

    class Config:
        from_attributes = True


class TaskAction(BaseModel):
    """任务操作请求"""
    action: str = Field(..., pattern="^(start|cancel|confirm|retry)$")
    reason: Optional[str] = Field(None, max_length=500, description="操作原因")


class TaskTemplate(BaseModel):
    """任务模板"""
    id: int
    name: str
    description: Optional[str]
    command_template: str
    default_priority: TaskPriority
    parameters: Optional[Dict[str, Any]] = Field(default_factory=dict)
    created_at: datetime
    created_by: int

    class Config:
        from_attributes = True


class CreateTaskTemplateRequest(BaseModel):
    """创建任务模板请求"""
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    command_template: str = Field(..., min_length=1, max_length=10000)
    default_priority: TaskPriority = TaskPriority.medium
    parameters: Optional[Dict[str, Any]] = Field(default_factory=dict)


class TaskLog(BaseModel):
    """任务日志"""
    id: int
    task_id: int
    level: str = Field(..., pattern="^(DEBUG|INFO|WARNING|ERROR|CRITICAL)$")
    message: str
    timestamp: datetime
    metadata: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


class TaskLogResponse(BaseModel):
    """任务日志响应"""
    logs: List[TaskLog]
    total: int
    has_more: bool


class BulkTaskAction(BaseModel):
    """批量任务操作"""
    task_ids: List[int] = Field(..., min_items=1, max_items=50)
    action: str = Field(..., pattern="^(cancel|retry|delete)$")
    reason: Optional[str] = Field(None, max_length=500)


class BulkTaskResponse(BaseModel):
    """批量操作响应"""
    successful: List[int]
    failed: List[Dict[str, Any]]
    total_processed: int


class TaskMetrics(BaseModel):
    """任务性能指标"""
    task_id: int
    cpu_usage: Optional[float] = Field(None, ge=0, le=100)
    memory_usage: Optional[float] = Field(None, ge=0)  # MB
    disk_usage: Optional[float] = Field(None, ge=0)  # MB
    network_usage: Optional[float] = Field(None, ge=0)  # MB
    recorded_at: datetime

    class Config:
        from_attributes = True


class ScheduledTaskRequest(BaseModel):
    """定时任务请求"""
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    command: str = Field(..., min_length=1, max_length=10000)
    project_id: int = Field(..., gt=0)
    cron_expression: str = Field(..., description="Cron表达式")
    timezone: str = Field("UTC", description="时区")
    is_active: bool = True
    max_retries: int = Field(3, ge=0, le=10)
    retry_interval: int = Field(300, ge=60, description="重试间隔（秒）")

    @validator('cron_expression')
    def validate_cron(cls, v):
        # 简单的cron表达式验证
        parts = v.strip().split()
        if len(parts) != 5:
            raise ValueError('Cron表达式必须包含5个字段: 分 时 日 月 周')
        return v.strip()


class ScheduledTaskResponse(ScheduledTaskRequest):
    """定时任务响应"""
    id: int
    next_run: Optional[datetime]
    last_run: Optional[datetime]
    run_count: int = 0
    created_at: datetime
    created_by: int

    class Config:
        from_attributes = True