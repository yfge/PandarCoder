"""
项目相关的Pydantic模型
"""
from typing import Optional, Dict, Any, List
from datetime import datetime
from pydantic import BaseModel, Field, validator
from enum import Enum


class ProjectStatus(str, Enum):
    """项目状态枚举"""
    active = "active"
    inactive = "inactive"
    archived = "archived"


class ProjectSettings(BaseModel):
    """项目设置"""
    auto_deploy: bool = False
    notification_enabled: bool = True
    environment_variables: Dict[str, str] = Field(default_factory=dict)
    build_command: Optional[str] = None
    test_command: Optional[str] = None

    class Config:
        from_attributes = True


class ProjectBase(BaseModel):
    """项目基础字段"""
    name: str = Field(..., min_length=1, max_length=100, description="项目名称")
    description: Optional[str] = Field(None, max_length=1000, description="项目描述")
    git_url: Optional[str] = Field(None, max_length=255, description="Git仓库URL")
    branch: Optional[str] = Field("main", max_length=100, description="Git分支")

    @validator('name')
    def validate_name(cls, v):
        if not v.strip():
            raise ValueError('项目名称不能为空')
        # 检查项目名称只包含字母、数字、中文、连字符和下划线
        import re
        if not re.match(r'^[\w\u4e00-\u9fa5\-\.]+$', v):
            raise ValueError('项目名称只能包含字母、数字、中文、连字符、下划线和点号')
        return v.strip()

    @validator('git_url')
    def validate_git_url(cls, v):
        if v is None:
            return v
        # 简单的URL验证
        if not v.startswith(('http://', 'https://', 'git@', 'ssh://')):
            raise ValueError('Git URL格式不正确')
        return v


class CreateProjectRequest(ProjectBase):
    """创建项目请求"""
    settings: Optional[ProjectSettings] = Field(default_factory=ProjectSettings)


class UpdateProjectRequest(BaseModel):
    """更新项目请求"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=1000)
    git_url: Optional[str] = Field(None, max_length=255)
    branch: Optional[str] = Field(None, max_length=100)
    status: Optional[ProjectStatus] = None
    settings: Optional[ProjectSettings] = None

    @validator('name')
    def validate_name(cls, v):
        if v is not None:
            if not v.strip():
                raise ValueError('项目名称不能为空')
            import re
            if not re.match(r'^[\w\u4e00-\u9fa5\-\.]+$', v):
                raise ValueError('项目名称只能包含字母、数字、中文、连字符、下划线和点号')
            return v.strip()
        return v


class ProjectResponse(BaseModel):
    """项目响应数据"""
    id: int
    name: str
    git_url: str
    description: Optional[str]
    user_id: int
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class ProjectResponseFull(ProjectBase):
    """完整项目响应数据（包含扩展字段）"""
    id: int
    status: ProjectStatus
    owner_id: int
    environment_variables: Dict[str, str] = Field(default_factory=dict)
    detected_env_vars: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: Optional[datetime]
    last_activity: Optional[datetime]
    settings: Optional[ProjectSettings]

    class Config:
        from_attributes = True


class ProjectListParams(BaseModel):
    """项目列表查询参数"""
    page: int = Field(1, ge=1, description="页码")
    limit: int = Field(10, ge=1, le=100, description="每页数量")
    search: Optional[str] = Field(None, max_length=100, description="搜索关键词")
    status: Optional[ProjectStatus] = Field(None, description="项目状态")
    owner_id: Optional[str] = Field(None, description="所有者ID，'me'表示当前用户")
    sort_by: Optional[str] = Field("created_at", pattern="^(name|created_at|updated_at|last_activity)$")
    sort_order: Optional[str] = Field("desc", pattern="^(asc|desc)$")


class ProjectListResponse(BaseModel):
    """项目列表响应"""
    items: List[ProjectResponse]
    total: int
    page: int
    limit: int
    pages: int


class ProjectStats(BaseModel):
    """项目统计数据"""
    total_projects: int
    active_projects: int
    total_tasks: int
    successful_tasks: int
    failed_tasks: int
    success_rate: float = Field(..., ge=0, le=100, description="成功率百分比")


class ProjectActivity(BaseModel):
    """项目活动记录"""
    id: int
    type: str
    description: str
    created_at: datetime
    metadata: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


class ProjectActivityResponse(BaseModel):
    """项目活动响应"""
    items: List[ProjectActivity]
    total: int
    page: int
    limit: int


class ProjectFile(BaseModel):
    """项目文件信息"""
    name: str
    path: str
    type: str = Field(..., pattern="^(file|directory)$")
    size: Optional[int] = None
    modified_at: datetime


class ProjectFilesResponse(BaseModel):
    """项目文件列表响应"""
    files: List[ProjectFile]
    current_path: str


class FileContentResponse(BaseModel):
    """文件内容响应"""
    content: str
    encoding: str
    size: int
    modified_at: datetime


class TaskResponse(BaseModel):
    """任务响应（用于Git操作等）"""
    task_id: str
    status: str


class NameAvailabilityResponse(BaseModel):
    """项目名称可用性检查响应"""
    available: bool
    suggestions: Optional[List[str]] = None


class SearchProjectResponse(BaseModel):
    """项目搜索响应"""
    items: List[ProjectResponse]
    total: int
    query: str


class ProjectEnvironmentVariablesUpdate(BaseModel):
    """项目环境变量更新"""
    environment_variables: Dict[str, str] = Field(default_factory=dict)
    
    @validator('environment_variables')
    def validate_env_vars(cls, v):
        # 验证环境变量名称格式
        for key, value in v.items():
            if not key.replace('_', '').replace('-', '').isalnum():
                raise ValueError(f'环境变量名称 {key} 格式无效')
            if len(key) > 100:
                raise ValueError(f'环境变量名称 {key} 过长')
            if len(value) > 1000:
                raise ValueError(f'环境变量值过长')
        return v


class DetectedEnvVar(BaseModel):
    """检测到的环境变量"""
    name: str
    description: Optional[str] = None
    default_value: Optional[str] = None
    source_file: str
    line_number: int
    required: bool = True
    category: str = "general"  # database, api, auth, etc.


class ProjectEnvDetectionResponse(BaseModel):
    """项目环境变量检测响应"""
    detected_vars: List[DetectedEnvVar]
    total_found: int
    source_files: List[str]
    suggestions: List[str] = []