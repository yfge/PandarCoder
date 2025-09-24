"""
任务服务层
"""
from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, desc, asc, case
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status
from datetime import datetime, timedelta
import asyncio
import logging

from app.models.task import Task, TaskStatus
from app.models.project import Project
from app.models.user import User
from app.schemas.task import (
    CreateTaskRequest, UpdateTaskRequest, TaskListParams,
    TaskResponse, TaskListResponse, TaskStats, TaskAction,
    BulkTaskAction, BulkTaskResponse, TaskPriority
)
from app.services.sandbox import SandboxManager, SandboxError

logger = logging.getLogger(__name__)


class TaskService:
    """任务服务类"""

    _sandbox_manager = SandboxManager()

    @staticmethod
    async def create_task(
        db: AsyncSession,
        task_data: CreateTaskRequest,
        user_id: int
    ) -> Task:
        """创建任务"""
        # 验证项目存在且用户有权限
        project = await db.execute(
            select(Project).where(
                and_(
                    Project.id == task_data.project_id,
                    Project.user_id == user_id
                )
            )
        )
        project = project.scalar_one_or_none()
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="项目不存在或无权限访问"
            )

        # 处理沙箱元数据
        try:
            sandboxed_metadata = TaskService._sandbox_manager.ensure_sandbox_metadata(
                task_data.command,
                task_data.metadata,
            )
        except SandboxError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc)
            ) from exc

        # 创建任务
        task = Task(
            name=task_data.name,
            description=task_data.description,
            command=task_data.command,
            priority=task_data.priority.value,
            project_id=task_data.project_id,
            created_by=user_id,
            status=TaskStatus.PENDING,
            scheduled_at=task_data.scheduled_at,
            task_metadata=sandboxed_metadata
        )

        db.add(task)
        await db.commit()
        await db.refresh(task)
        
        logger.info(f"Created task {task.id} for project {project.id} by user {user_id}")
        return task

    @staticmethod
    async def get_task(
        db: AsyncSession,
        task_id: int,
        user_id: int
    ) -> Task:
        """获取单个任务"""
        result = await db.execute(
            select(Task)
            .options(
                selectinload(Task.project),
                selectinload(Task.created_by_user)
            )
            .where(Task.id == task_id)
        )
        task = result.scalar_one_or_none()
        
        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="任务不存在"
            )

        # 检查权限 - 用户必须是项目所有者或任务创建者
        if task.project.user_id != user_id and task.created_by != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="无权限访问此任务"
            )

        return task

    @staticmethod
    async def get_tasks(
        db: AsyncSession,
        user_id: int,
        params: TaskListParams
    ) -> TaskListResponse:
        """获取任务列表"""
        # 构建基础查询 - 只返回用户有权限的任务
        base_query = select(Task).join(Project).where(
            or_(
                Project.user_id == user_id,  # 项目所有者
                Task.created_by == user_id   # 任务创建者
            )
        )

        # 添加筛选条件
        conditions = []

        if params.project_id:
            conditions.append(Task.project_id == params.project_id)
        
        if params.status:
            conditions.append(Task.status == params.status.value)
        
        if params.priority:
            conditions.append(Task.priority == params.priority.value)
        
        if params.search:
            search_condition = or_(
                Task.name.ilike(f"%{params.search}%"),
                Task.description.ilike(f"%{params.search}%"),
                Task.command.ilike(f"%{params.search}%")
            )
            conditions.append(search_condition)
        
        if params.created_by:
            conditions.append(Task.created_by == params.created_by)
        
        if params.date_from:
            conditions.append(Task.created_at >= params.date_from)
        
        if params.date_to:
            conditions.append(Task.created_at <= params.date_to)

        if conditions:
            base_query = base_query.where(and_(*conditions))

        # 添加排序
        if params.sort_by == "name":
            order_column = Task.name
        elif params.sort_by == "updated_at":
            order_column = Task.updated_at
        elif params.sort_by == "priority":
            order_column = Task.priority
        elif params.sort_by == "status":
            order_column = Task.status
        else:  # created_at
            order_column = Task.created_at

        if params.sort_order == "asc":
            base_query = base_query.order_by(asc(order_column))
        else:
            base_query = base_query.order_by(desc(order_column))

        # 获取总数
        count_query = select(func.count()).select_from(base_query.subquery())
        total_result = await db.execute(count_query)
        total = total_result.scalar()

        # 添加分页
        offset = (params.page - 1) * params.limit
        query = base_query.offset(offset).limit(params.limit)

        # 执行查询
        result = await db.execute(query)
        tasks = result.scalars().all()

        # 计算页数
        pages = (total + params.limit - 1) // params.limit

        return TaskListResponse(
            items=[TaskResponse.from_orm(task) for task in tasks],
            total=total,
            page=params.page,
            limit=params.limit,
            pages=pages
        )

    @staticmethod
    async def update_task(
        db: AsyncSession,
        task_id: int,
        user_id: int,
        update_data: UpdateTaskRequest
    ) -> Task:
        """更新任务"""
        task = await TaskService.get_task(db, task_id, user_id)

        # 检查任务状态 - 运行中的任务不能修改
        if task.status == TaskStatus.RUNNING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="运行中的任务无法修改"
            )

        # 更新字段
        update_dict = update_data.dict(exclude_unset=True)
        for field, value in update_dict.items():
            if field == "priority" and value:
                setattr(task, field, value.value)
            elif field != "metadata":
                setattr(task, field, value)

        # 处理元数据更新
        if update_data.metadata is not None:
            if task.task_metadata:
                task.task_metadata.update(update_data.metadata)
            else:
                task.task_metadata = update_data.metadata

        task.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(task)
        
        logger.info(f"Updated task {task.id} by user {user_id}")
        return task

    @staticmethod
    async def delete_task(
        db: AsyncSession,
        task_id: int,
        user_id: int
    ) -> None:
        """删除任务"""
        task = await TaskService.get_task(db, task_id, user_id)

        # 检查任务状态 - 运行中的任务不能删除
        if task.status == TaskStatus.RUNNING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="运行中的任务无法删除"
            )

        await db.delete(task)
        await db.commit()
        
        logger.info(f"Deleted task {task_id} by user {user_id}")

    @staticmethod
    async def execute_task_action(
        db: AsyncSession,
        task_id: int,
        user_id: int,
        action: TaskAction
    ) -> Task:
        """执行任务操作"""
        task = await TaskService.get_task(db, task_id, user_id)

        if action.action == "start":
            if task.status not in [TaskStatus.PENDING, TaskStatus.FAILED]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="只有待执行或失败的任务可以启动"
                )
            
            task.status = TaskStatus.RUNNING
            task.started_at = datetime.utcnow()
            
            # TODO: 在这里触发实际的任务执行
            logger.info(f"Starting task {task_id}")

        elif action.action == "cancel":
            if task.status not in [TaskStatus.PENDING, TaskStatus.RUNNING]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="只有待执行或运行中的任务可以取消"
                )
            
            task.status = TaskStatus.CANCELLED
            task.completed_at = datetime.utcnow()
            if action.reason:
                task.error = f"任务被取消: {action.reason}"

        elif action.action == "confirm":
            if task.status != TaskStatus.WAITING_CONFIRMATION:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="只有等待确认的任务可以确认"
                )
            
            task.status = TaskStatus.RUNNING
            # TODO: 继续执行任务

        elif action.action == "retry":
            if task.status not in [TaskStatus.FAILED, TaskStatus.CANCELLED]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="只有失败或取消的任务可以重试"
                )
            
            task.status = TaskStatus.PENDING
            task.started_at = None
            task.completed_at = None
            task.output = None
            task.error = None
            task.exit_code = None
            task.progress = None

        task.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(task)
        
        logger.info(f"Executed action '{action.action}' on task {task_id} by user {user_id}")
        return task

    @staticmethod
    async def get_task_stats(
        db: AsyncSession,
        user_id: int,
        project_id: Optional[int] = None
    ) -> TaskStats:
        """获取任务统计数据"""
        # 构建基础条件
        base_conditions = [
            or_(
                Project.user_id == user_id,
                Task.created_by == user_id
            )
        ]

        if project_id:
            base_conditions.append(Task.project_id == project_id)

        base_query = select(Task).join(Project).where(and_(*base_conditions))

        # 获取各状态的任务数量
        stats_query = select(
            func.count().label('total'),
            func.sum(case((Task.status == TaskStatus.PENDING, 1), else_=0)).label('pending'),
            func.sum(case((Task.status == TaskStatus.RUNNING, 1), else_=0)).label('running'),
            func.sum(case((Task.status == TaskStatus.COMPLETED, 1), else_=0)).label('completed'),
            func.sum(case((Task.status == TaskStatus.FAILED, 1), else_=0)).label('failed'),
            func.sum(case((Task.status == TaskStatus.CANCELLED, 1), else_=0)).label('cancelled'),
            func.avg(Task.duration).label('avg_duration')
        ).select_from(base_query.subquery())

        result = await db.execute(stats_query)
        stats = result.first()

        total_tasks = stats.total or 0
        completed_tasks = stats.completed or 0
        success_rate = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0.0

        return TaskStats(
            total_tasks=total_tasks,
            pending_tasks=stats.pending or 0,
            running_tasks=stats.running or 0,
            completed_tasks=completed_tasks,
            failed_tasks=stats.failed or 0,
            cancelled_tasks=stats.cancelled or 0,
            success_rate=round(success_rate, 2),
            average_duration=stats.avg_duration
        )

    @staticmethod
    async def bulk_task_action(
        db: AsyncSession,
        user_id: int,
        bulk_action: BulkTaskAction
    ) -> BulkTaskResponse:
        """批量任务操作"""
        successful = []
        failed = []

        for task_id in bulk_action.task_ids:
            try:
                if bulk_action.action == "delete":
                    await TaskService.delete_task(db, task_id, user_id)
                else:
                    action = TaskAction(action=bulk_action.action, reason=bulk_action.reason)
                    await TaskService.execute_task_action(db, task_id, user_id, action)
                
                successful.append(task_id)
            except Exception as e:
                failed.append({
                    "task_id": task_id,
                    "error": str(e)
                })

        return BulkTaskResponse(
            successful=successful,
            failed=failed,
            total_processed=len(bulk_action.task_ids)
        )

    @staticmethod
    async def get_running_tasks(
        db: AsyncSession,
        user_id: int
    ) -> List[Task]:
        """获取运行中的任务"""
        result = await db.execute(
            select(Task)
            .join(Project)
            .where(
                and_(
                    Task.status == TaskStatus.RUNNING,
                    or_(
                        Project.user_id == user_id,
                        Task.created_by == user_id
                    )
                )
            )
            .order_by(Task.started_at.desc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def get_recent_tasks(
        db: AsyncSession,
        user_id: int,
        limit: int = 10
    ) -> List[Task]:
        """获取最近的任务"""
        result = await db.execute(
            select(Task)
            .join(Project)
            .where(
                or_(
                    Project.user_id == user_id,
                    Task.created_by == user_id
                )
            )
            .order_by(Task.updated_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    @staticmethod
    async def cleanup_old_tasks(
        db: AsyncSession,
        days_old: int = 30
    ) -> int:
        """清理旧任务"""
        cutoff_date = datetime.utcnow() - timedelta(days=days_old)
        
        # 只清理已完成、失败或取消的任务
        result = await db.execute(
            select(Task).where(
                and_(
                    Task.created_at < cutoff_date,
                    Task.status.in_([
                        TaskStatus.COMPLETED,
                        TaskStatus.FAILED,
                        TaskStatus.CANCELLED
                    ])
                )
            )
        )
        old_tasks = result.scalars().all()
        
        count = len(old_tasks)
        for task in old_tasks:
            await db.delete(task)
        
        await db.commit()
        logger.info(f"Cleaned up {count} old tasks")
        return count

    @staticmethod
    async def update_task_progress(
        db: AsyncSession,
        task_id: int,
        progress: int,
        output: Optional[str] = None
    ) -> None:
        """更新任务进度"""
        result = await db.execute(select(Task).where(Task.id == task_id))
        task = result.scalar_one_or_none()
        
        if task and task.status == TaskStatus.RUNNING:
            task.progress = max(0, min(100, progress))
            if output:
                task.output = (task.output or "") + output
            task.updated_at = datetime.utcnow()
            await db.commit()

    @staticmethod
    async def complete_task(
        db: AsyncSession,
        task_id: int,
        success: bool,
        output: Optional[str] = None,
        error: Optional[str] = None,
        exit_code: Optional[int] = None,
        duration: Optional[int] = None
    ) -> None:
        """完成任务"""
        result = await db.execute(select(Task).where(Task.id == task_id))
        task = result.scalar_one_or_none()
        
        if task and task.status == TaskStatus.RUNNING:
            task.status = TaskStatus.COMPLETED if success else TaskStatus.FAILED
            task.completed_at = datetime.utcnow()
            task.progress = 100 if success else None
            
            if output:
                task.output = output
            if error:
                task.error = error
            if exit_code is not None:
                task.exit_code = exit_code
            if duration is not None:
                task.duration = duration
            elif task.started_at:
                # 计算执行时间
                task.duration = int((task.completed_at - task.started_at).total_seconds())
            
            await db.commit()
            logger.info(f"Task {task_id} completed with status: {task.status}")

    @staticmethod
    async def search_tasks(
        db: AsyncSession,
        user_id: int,
        query: str,
        limit: int = 20
    ) -> List[Task]:
        """搜索任务"""
        search_conditions = or_(
            Task.name.ilike(f"%{query}%"),
            Task.description.ilike(f"%{query}%"),
            Task.command.ilike(f"%{query}%")
        )

        result = await db.execute(
            select(Task)
            .join(Project)
            .where(
                and_(
                    search_conditions,
                    or_(
                        Project.user_id == user_id,
                        Task.created_by == user_id
                    )
                )
            )
            .order_by(Task.updated_at.desc())
            .limit(limit)
        )
        
        return list(result.scalars().all())
