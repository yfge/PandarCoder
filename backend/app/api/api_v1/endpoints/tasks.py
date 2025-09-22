from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from app.db.database import get_db
from app.services.task import TaskService
from app.schemas.task import (
    CreateTaskRequest, 
    UpdateTaskRequest, 
    TaskResponse, 
    TaskListParams, 
    TaskListResponse,
    TaskStats,
    TaskAction,
    BulkTaskAction,
    BulkTaskResponse,
    CreateTaskTemplateRequest,
    TaskTemplate,
    ScheduledTaskRequest,
    ScheduledTaskResponse
)
from app.core.deps import get_current_active_user as get_current_user
from app.models.user import User

router = APIRouter()


@router.get("/", response_model=TaskListResponse)
async def get_tasks(
    params: TaskListParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取任务列表"""
    return await TaskService.get_tasks(db, current_user.id, params)


@router.post("/", response_model=TaskResponse)
async def create_task(
    task_data: CreateTaskRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """创建新任务"""
    return await TaskService.create_task(db, task_data, current_user.id)


@router.get("/stats", response_model=TaskStats)
async def get_task_stats(
    project_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取任务统计数据"""
    return await TaskService.get_task_stats(db, current_user.id, project_id)


@router.get("/recent")
async def get_recent_tasks(
    limit: int = Query(10, ge=1, le=50),
    project_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取最近任务"""
    params = TaskListParams(
        limit=limit,
        project_id=project_id,
        sort_by="created_at",
        sort_order="desc"
    )
    result = await TaskService.get_tasks(db, current_user.id, params)
    return result.items


@router.get("/running")
async def get_running_tasks(
    project_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取运行中的任务"""
    from app.schemas.task import TaskStatus
    params = TaskListParams(
        status=TaskStatus.running,
        project_id=project_id,
        sort_by="started_at",
        sort_order="desc"
    )
    result = await TaskService.get_tasks(db, current_user.id, params)
    return result.items


@router.get("/templates", response_model=list[TaskTemplate])
async def get_task_templates(
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取任务模板"""
    # TODO: Implement task templates
    raise HTTPException(status_code=501, detail="Task templates not implemented yet")


@router.post("/templates", response_model=TaskTemplate)
async def create_task_template(
    template_data: CreateTaskTemplateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """创建任务模板"""
    # TODO: Implement task template creation
    raise HTTPException(status_code=501, detail="Task template creation not implemented yet")


@router.post("/templates/{template_id}/create", response_model=TaskResponse)
async def create_task_from_template(
    template_id: int,
    project_id: int,
    name: str,
    description: Optional[str] = None,
    parameters: dict = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """从模板创建任务"""
    # TODO: Implement task creation from template
    raise HTTPException(status_code=501, detail="Task creation from template not implemented yet")


@router.post("/bulk", response_model=BulkTaskResponse)
async def bulk_task_action(
    action_data: BulkTaskAction,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """批量任务操作"""
    return await TaskService.bulk_task_action(db, current_user.id, action_data)


@router.get("/search")
async def search_tasks(
    q: str = Query(..., description="搜索关键词"),
    project_id: Optional[int] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """搜索任务"""
    return await TaskService.search_tasks(db, current_user.id, q, limit)


@router.post("/scheduled", response_model=ScheduledTaskResponse)
async def create_scheduled_task(
    task_data: ScheduledTaskRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """创建定时任务"""
    # TODO: Implement scheduled task creation
    raise HTTPException(status_code=501, detail="Scheduled task creation not implemented yet")


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取单个任务详情"""
    task = await TaskService.get_task(db, task_id, current_user.id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: int,
    task_data: UpdateTaskRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """更新任务"""
    task = await TaskService.update_task(db, task_id, current_user.id, task_data)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.delete("/{task_id}")
async def delete_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """删除任务"""
    try:
        await TaskService.delete_task(db, task_id, current_user.id)
    except HTTPException:
        raise
    return {"message": "Task deleted successfully"}


@router.post("/{task_id}/execute")
async def execute_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """执行任务（触发运行，交由Runner处理）"""
    from app.schemas.task import TaskAction
    action = TaskAction(action="start")
    result = await TaskService.execute_task_action(db, task_id, current_user.id, action)
    if not result:
        raise HTTPException(status_code=404, detail="Task not found or cannot be started")
    return {"status": result.status.value}


@router.post("/{task_id}/action")
async def task_action(
    task_id: int,
    action_data: TaskAction,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """任务操作（启动/取消/确认/重试）"""
    result = await TaskService.execute_task_action(db, task_id, current_user.id, action_data)
    if not result:
        raise HTTPException(status_code=404, detail="Task not found or action not allowed")
    return result


@router.post("/{task_id}/cancel", response_model=TaskResponse)
async def cancel_task(
    task_id: int,
    reason: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """取消任务"""
    from app.schemas.task import TaskAction
    action = TaskAction(action="cancel", reason=reason)
    result = await TaskService.execute_task_action(db, task_id, current_user.id, action)
    if not result:
        raise HTTPException(status_code=404, detail="Task not found or cannot be cancelled")
    return result


@router.post("/{task_id}/retry")
async def retry_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """重试任务"""
    from app.schemas.task import TaskAction
    action = TaskAction(action="retry")
    result = await TaskService.execute_task_action(db, task_id, current_user.id, action)
    if not result:
        raise HTTPException(status_code=404, detail="Task not found or cannot be retried")
    return {"execution_id": result.get("execution_id"), "status": "restarted"}


@router.post("/{task_id}/confirm", response_model=TaskResponse)
async def confirm_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """确认任务（用于需要确认的任务）"""
    from app.schemas.task import TaskAction
    action = TaskAction(action="confirm")
    result = await TaskService.execute_task_action(db, task_id, current_user.id, action)
    if not result:
        raise HTTPException(status_code=404, detail="Task not found or confirmation not needed")
    return result


@router.get("/{task_id}/output")
async def get_task_output(
    task_id: int,
    follow: bool = Query(False),
    tail: int = Query(100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取任务输出"""
    # TODO: Implement task output retrieval
    raise HTTPException(status_code=501, detail="Task output not implemented yet")


@router.get("/{task_id}/logs")
async def get_task_logs(
    task_id: int,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    level: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取任务日志"""
    # TODO: Implement task logs retrieval
    raise HTTPException(status_code=501, detail="Task logs not implemented yet")


@router.get("/{task_id}/executions")
async def get_task_executions(
    task_id: int,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取任务执行历史"""
    # TODO: Implement task execution history
    raise HTTPException(status_code=501, detail="Task execution history not implemented yet")
