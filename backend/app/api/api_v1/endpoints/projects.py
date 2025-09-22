"""
项目管理API端点
"""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.db.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User
from app.models.project import Project
from app.services.project import ProjectService
from app.schemas.project import (
    CreateProjectRequest, UpdateProjectRequest, ProjectResponse,
    ProjectListParams, ProjectListResponse, ProjectStats,
    NameAvailabilityResponse, SearchProjectResponse, TaskResponse,
    ProjectEnvironmentVariablesUpdate, ProjectEnvDetectionResponse
)

router = APIRouter()


@router.get("/", response_model=ProjectListResponse)
async def get_projects(
    page: int = Query(1, ge=1, description="页码"),
    limit: int = Query(10, ge=1, le=100, description="每页数量"),
    search: Optional[str] = Query(None, max_length=100, description="搜索关键词"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取项目列表
    
    支持分页、搜索、筛选和排序功能。
    """
    # 构建基础查询 - 只返回用户的项目
    query = select(Project).where(Project.user_id == current_user.id)
    
    # 添加搜索条件
    if search:
        search_condition = or_(
            Project.name.ilike(f"%{search}%"),
            Project.description.ilike(f"%{search}%"),
            Project.git_url.ilike(f"%{search}%")
        )
        query = query.where(search_condition)
    
    # 获取总数
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # 添加分页和排序
    offset = (page - 1) * limit
    query = query.order_by(Project.updated_at.desc()).offset(offset).limit(limit)
    
    # 执行查询
    result = await db.execute(query)
    projects = result.scalars().all()
    
    # 计算页数
    pages = (total + limit - 1) // limit
    
    return ProjectListResponse(
        items=[ProjectResponse.model_validate(project) for project in projects],
        total=total,
        page=page,
        limit=limit,
        pages=pages
    )


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: CreateProjectRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    创建新项目
    
    创建一个新的项目，用户必须已登录。
    """
    project = await ProjectService.create_project(db, project_data, current_user.id)
    return ProjectResponse.from_orm(project)


@router.get("/stats", response_model=ProjectStats)
async def get_project_stats(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取项目统计数据
    
    返回用户的项目和任务统计信息。
    """
    return await ProjectService.get_project_stats(db, current_user.id)


@router.get("/recent", response_model=List[ProjectResponse])
async def get_recent_projects(
    limit: int = Query(10, ge=1, le=50, description="返回数量限制"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取最近使用的项目
    
    返回用户最近活跃的项目列表。
    """
    projects = await ProjectService.get_recent_projects(db, current_user.id, limit)
    return [ProjectResponse.from_orm(project) for project in projects]


@router.get("/search", response_model=SearchProjectResponse)
async def search_projects(
    q: str = Query(..., min_length=1, max_length=100, description="搜索关键词"),
    limit: int = Query(10, ge=1, le=50, description="返回数量限制"),
    filter_status: Optional[str] = Query(None, description="状态筛选"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    搜索项目
    
    根据项目名称和描述进行模糊搜索。
    """
    filters = {}
    if filter_status:
        filters["status"] = filter_status
    
    projects, total = await ProjectService.search_projects(
        db, current_user.id, q, limit, filters
    )
    
    return SearchProjectResponse(
        items=[ProjectResponse.from_orm(project) for project in projects],
        total=total,
        query=q
    )


@router.get("/check-name", response_model=NameAvailabilityResponse)
async def check_project_name(
    name: str = Query(..., min_length=1, max_length=100, description="项目名称"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    检查项目名称是否可用
    
    返回名称可用性和建议的替代名称。
    """
    available, suggestions = await ProjectService.check_name_availability(
        db, name, current_user.id
    )
    
    return NameAvailabilityResponse(
        available=available,
        suggestions=suggestions
    )


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取单个项目详情
    
    返回指定项目的详细信息。用户只能访问自己的项目。
    """
    project = await ProjectService.get_project(db, project_id, current_user.id)
    return ProjectResponse.from_orm(project)


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    project_data: UpdateProjectRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    更新项目
    
    更新指定项目的信息。用户只能更新自己的项目。
    """
    project = await ProjectService.update_project(
        db, project_id, current_user.id, project_data
    )
    return ProjectResponse.from_orm(project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    删除项目
    
    永久删除指定项目及其相关数据。此操作不可逆。
    """
    await ProjectService.delete_project(db, project_id, current_user.id)


@router.get("/{project_id}/stats", response_model=ProjectStats)
async def get_single_project_stats(
    project_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取单个项目的统计数据
    
    返回指定项目的任务统计信息。
    """
    return await ProjectService.get_project_stats(db, current_user.id, project_id)


@router.post("/{project_id}/clone", response_model=TaskResponse)
async def clone_repository(
    project_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    克隆Git仓库
    
    为指定项目克隆Git仓库。返回异步任务ID。
    """
    # TODO: 实现Git克隆功能
    return TaskResponse(
        task_id=f"clone-{project_id}-{current_user.id}",
        status="pending"
    )


@router.post("/{project_id}/pull", response_model=TaskResponse)
async def pull_repository(
    project_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    拉取最新代码
    
    为指定项目拉取Git仓库的最新代码。返回异步任务ID。
    """
    # TODO: 实现Git拉取功能
    return TaskResponse(
        task_id=f"pull-{project_id}-{current_user.id}",
        status="pending"
    )


@router.post("/{project_id}/commands")
async def execute_command(
    project_id: int,
    command: Dict[str, Any],
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    执行Claude CLI命令
    
    在指定项目中执行Claude CLI命令。
    """
    # TODO: 实现命令执行功能
    return {
        "message": f"Execute command for project {project_id}",
        "project_id": project_id,
        "user_id": current_user.id,
        "command": command
    }


@router.get("/check-name", response_model=NameAvailabilityResponse)
async def check_project_name_availability(
    name: str = Query(..., min_length=1, max_length=100, description="项目名称"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    检查项目名称是否可用
    
    检查指定名称是否已被当前用户使用，如果不可用，提供替代建议。
    """
    return await ProjectService.check_name_availability(db, current_user.id, name)


@router.get("/{project_id}/environment", response_model=dict)
async def get_project_environment_variables(
    project_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """获取项目环境变量"""
    project = await ProjectService.get_project(db, project_id, current_user.id)
    return {
        "environment_variables": project.environment_variables or {},
        "detected_env_vars": project.detected_env_vars or {}
    }


@router.put("/{project_id}/environment", response_model=dict)
async def update_project_environment_variables(
    project_id: int,
    env_update: ProjectEnvironmentVariablesUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """更新项目环境变量"""
    project = await ProjectService.get_project(db, project_id, current_user.id)
    project.environment_variables = env_update.environment_variables
    
    await db.commit()
    await db.refresh(project)
    
    return {
        "environment_variables": project.environment_variables or {},
        "message": "环境变量更新成功"
    }


@router.post("/{project_id}/detect-env", response_model=ProjectEnvDetectionResponse)
async def detect_project_environment_variables(
    project_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """AI自动检测项目环境变量"""
    # TODO: 实现AI环境变量检测功能
    # 这里先返回模拟数据
    from app.schemas.project import DetectedEnvVar
    
    mock_detected_vars = [
        DetectedEnvVar(
            name="DATABASE_URL",
            description="数据库连接URL",
            default_value="postgresql://localhost:5432/mydb",
            source_file="config/database.py",
            line_number=15,
            required=True,
            category="database"
        ),
        DetectedEnvVar(
            name="SECRET_KEY",
            description="应用密钥",
            source_file="app/settings.py",
            line_number=8,
            required=True,
            category="security"
        ),
        DetectedEnvVar(
            name="DEBUG",
            description="调试模式开关",
            default_value="False",
            source_file="app/settings.py",
            line_number=12,
            required=False,
            category="general"
        )
    ]
    
    return ProjectEnvDetectionResponse(
        detected_vars=mock_detected_vars,
        total_found=len(mock_detected_vars),
        source_files=["config/database.py", "app/settings.py"],
        suggestions=[
            "建议为所有数据库相关的环境变量设置默认值",
            "SECRET_KEY应该使用强随机字符串",
            "生产环境中请确保DEBUG设置为False"
        ]
    )