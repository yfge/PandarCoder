"""
项目服务层
"""
from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status
from datetime import datetime

from app.models.project import Project
from app.models.user import User
from app.models.task import Task
from app.schemas.project import (
    CreateProjectRequest, UpdateProjectRequest, ProjectListParams,
    ProjectResponse, ProjectListResponse, ProjectStats
)


class ProjectService:
    """项目服务类"""

    @staticmethod
    async def create_project(
        db: AsyncSession,
        project_data: CreateProjectRequest,
        user_id: int
    ) -> Project:
        """创建项目"""
        # 检查项目名称是否已存在
        existing_project = await db.execute(
            select(Project).where(
                and_(
                    Project.name == project_data.name,
                    Project.user_id == user_id
                )
            )
        )
        if existing_project.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="项目名称已存在"
            )

        # 创建新项目
        project = Project(
            name=project_data.name,
            description=project_data.description,
            git_url=project_data.git_url,
            ssh_key=None,  # TODO: 处理SSH密钥
            user_id=user_id
        )

        db.add(project)
        await db.commit()
        await db.refresh(project)
        return project

    @staticmethod
    async def get_project(db: AsyncSession, project_id: int, user_id: int) -> Project:
        """获取单个项目"""
        result = await db.execute(
            select(Project)
            .options(selectinload(Project.owner))
            .where(
                and_(
                    Project.id == project_id,
                    Project.user_id == user_id
                )
            )
        )
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="项目不存在"
            )
        return project

    @staticmethod
    async def get_projects(
        db: AsyncSession,
        user_id: int,
        params: ProjectListParams
    ) -> ProjectListResponse:
        """获取项目列表"""
        # 构建查询条件
        conditions = [Project.user_id == user_id]

        # 添加搜索条件
        if params.search:
            search_condition = or_(
                Project.name.ilike(f"%{params.search}%"),
                Project.description.ilike(f"%{params.search}%")
            )
            conditions.append(search_condition)

        # 添加状态筛选
        if params.status:
            # 注意：这里需要根据实际的状态字段来调整
            # 因为当前Project模型没有status字段，我们先假设所有项目都是active
            pass

        # 构建基础查询
        base_query = select(Project).where(and_(*conditions))

        # 添加排序
        if params.sort_by == "name":
            order_column = Project.name
        elif params.sort_by == "updated_at":
            order_column = Project.updated_at
        elif params.sort_by == "last_activity":
            order_column = Project.updated_at  # 暂时用updated_at代替
        else:  # created_at
            order_column = Project.created_at

        if params.sort_order == "asc":
            base_query = base_query.order_by(order_column.asc())
        else:
            base_query = base_query.order_by(order_column.desc())

        # 获取总数
        count_query = select(func.count()).select_from(
            select(Project).where(and_(*conditions)).subquery()
        )
        total_result = await db.execute(count_query)
        total = total_result.scalar()

        # 添加分页
        offset = (params.page - 1) * params.limit
        query = base_query.offset(offset).limit(params.limit)

        # 执行查询
        result = await db.execute(query)
        projects = result.scalars().all()

        # 计算页数
        pages = (total + params.limit - 1) // params.limit

        return ProjectListResponse(
            items=[ProjectResponse.from_orm(project) for project in projects],
            total=total,
            page=params.page,
            limit=params.limit,
            pages=pages
        )

    @staticmethod
    async def update_project(
        db: AsyncSession,
        project_id: int,
        user_id: int,
        update_data: UpdateProjectRequest
    ) -> Project:
        """更新项目"""
        project = await ProjectService.get_project(db, project_id, user_id)

        # 检查名称是否重复（如果更新了名称）
        if update_data.name and update_data.name != project.name:
            existing_project = await db.execute(
                select(Project).where(
                    and_(
                        Project.name == update_data.name,
                        Project.user_id == user_id,
                        Project.id != project_id
                    )
                )
            )
            if existing_project.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="项目名称已存在"
                )

        # 更新字段
        update_dict = update_data.dict(exclude_unset=True)
        for field, value in update_dict.items():
            if field != "settings":  # settings需要特殊处理
                setattr(project, field, value)

        project.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(project)
        return project

    @staticmethod
    async def delete_project(db: AsyncSession, project_id: int, user_id: int) -> None:
        """删除项目"""
        project = await ProjectService.get_project(db, project_id, user_id)
        
        # TODO: 删除相关的任务和文件
        await db.delete(project)
        await db.commit()

    @staticmethod
    async def get_project_stats(
        db: AsyncSession,
        user_id: int,
        project_id: Optional[int] = None
    ) -> ProjectStats:
        """获取项目统计数据"""
        # 构建基础条件
        project_conditions = [Project.user_id == user_id]
        task_conditions = []

        if project_id:
            project_conditions.append(Project.id == project_id)
            task_conditions.append(Task.project_id == project_id)
        else:
            # 获取用户所有项目的ID
            user_projects_query = select(Project.id).where(Project.user_id == user_id)
            project_ids_result = await db.execute(user_projects_query)
            project_ids = [row[0] for row in project_ids_result.fetchall()]
            if project_ids:
                task_conditions.append(Task.project_id.in_(project_ids))

        # 获取项目统计
        total_projects_query = select(func.count()).select_from(
            select(Project).where(and_(*project_conditions)).subquery()
        )
        total_projects_result = await db.execute(total_projects_query)
        total_projects = total_projects_result.scalar() or 0

        # 活跃项目数（暂时等于总数）
        active_projects = total_projects

        # 获取任务统计
        if task_conditions:
            # 总任务数
            total_tasks_query = select(func.count()).select_from(
                select(Task).where(and_(*task_conditions)).subquery()
            )
            total_tasks_result = await db.execute(total_tasks_query)
            total_tasks = total_tasks_result.scalar() or 0

            # 成功任务数
            successful_tasks_query = select(func.count()).select_from(
                select(Task).where(
                    and_(
                        *task_conditions,
                        Task.status == "completed"  # 假设completed表示成功
                    )
                ).subquery()
            )
            successful_tasks_result = await db.execute(successful_tasks_query)
            successful_tasks = successful_tasks_result.scalar() or 0

            # 失败任务数
            failed_tasks_query = select(func.count()).select_from(
                select(Task).where(
                    and_(
                        *task_conditions,
                        Task.status == "failed"
                    )
                ).subquery()
            )
            failed_tasks_result = await db.execute(failed_tasks_query)
            failed_tasks = failed_tasks_result.scalar() or 0
        else:
            total_tasks = successful_tasks = failed_tasks = 0

        # 计算成功率
        success_rate = (successful_tasks / total_tasks * 100) if total_tasks > 0 else 0.0

        return ProjectStats(
            total_projects=total_projects,
            active_projects=active_projects,
            total_tasks=total_tasks,
            successful_tasks=successful_tasks,
            failed_tasks=failed_tasks,
            success_rate=round(success_rate, 2)
        )

    @staticmethod
    async def check_name_availability(
        db: AsyncSession,
        name: str,
        user_id: int
    ) -> Tuple[bool, Optional[List[str]]]:
        """检查项目名称可用性"""
        existing_project = await db.execute(
            select(Project).where(
                and_(
                    Project.name == name,
                    Project.user_id == user_id
                )
            )
        )
        
        available = existing_project.scalar_one_or_none() is None
        suggestions = []
        
        if not available:
            # 生成建议名称
            for i in range(1, 6):
                suggestion = f"{name}-{i}"
                existing_suggestion = await db.execute(
                    select(Project).where(
                        and_(
                            Project.name == suggestion,
                            Project.user_id == user_id
                        )
                    )
                )
                if existing_suggestion.scalar_one_or_none() is None:
                    suggestions.append(suggestion)
        
        return available, suggestions if suggestions else None

    @staticmethod
    async def search_projects(
        db: AsyncSession,
        user_id: int,
        query: str,
        limit: int = 10,
        filters: Optional[Dict[str, Any]] = None
    ) -> Tuple[List[Project], int]:
        """搜索项目"""
        conditions = [Project.user_id == user_id]
        
        # 添加搜索条件
        search_condition = or_(
            Project.name.ilike(f"%{query}%"),
            Project.description.ilike(f"%{query}%")
        )
        conditions.append(search_condition)
        
        # 添加筛选条件
        if filters:
            if filters.get("status"):
                # TODO: 添加状态筛选逻辑
                pass
        
        # 执行查询
        base_query = select(Project).where(and_(*conditions))
        
        # 获取总数
        count_query = select(func.count()).select_from(base_query.subquery())
        total_result = await db.execute(count_query)
        total = total_result.scalar()
        
        # 获取结果
        query = base_query.limit(limit).order_by(Project.updated_at.desc())
        result = await db.execute(query)
        projects = result.scalars().all()
        
        return list(projects), total

    @staticmethod
    async def get_recent_projects(
        db: AsyncSession,
        user_id: int,
        limit: int = 10
    ) -> List[Project]:
        """获取最近使用的项目"""
        query = (
            select(Project)
            .where(Project.user_id == user_id)
            .order_by(Project.updated_at.desc())
            .limit(limit)
        )
        
        result = await db.execute(query)
        return list(result.scalars().all())