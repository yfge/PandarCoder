"""
用户相关的 Pydantic 模式
"""
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr, validator, Field


# 基础用户模式
class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    is_active: bool = True
    is_verified: bool = False


# 用户创建模式
class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=100)
    
    @validator('password')
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('密码长度至少8位')
        if not any(c.isupper() for c in v):
            raise ValueError('密码必须包含至少一个大写字母')
        if not any(c.islower() for c in v):
            raise ValueError('密码必须包含至少一个小写字母')
        if not any(c.isdigit() for c in v):
            raise ValueError('密码必须包含至少一个数字')
        return v


# 用户更新模式
class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    is_active: Optional[bool] = None
    is_verified: Optional[bool] = None
    avatar_url: Optional[str] = None


# 密码更新模式
class UserPasswordUpdate(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=100)
    
    @validator('new_password')
    def validate_new_password(cls, v):
        if len(v) < 8:
            raise ValueError('密码长度至少8位')
        if not any(c.isupper() for c in v):
            raise ValueError('密码必须包含至少一个大写字母')
        if not any(c.islower() for c in v):
            raise ValueError('密码必须包含至少一个小写字母')
        if not any(c.isdigit() for c in v):
            raise ValueError('密码必须包含至少一个数字')
        return v


# 用户响应模式（不包含密码）
class User(UserBase):
    id: int
    is_superuser: bool
    avatar_url: Optional[str] = None
    last_login: Optional[datetime] = None
    login_count: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# 用户详细信息（包含角色）
class UserDetail(User):
    roles: List['RoleBase'] = []


# 角色基础模式
class RoleBase(BaseModel):
    name: str
    display_name: str
    description: Optional[str] = None
    is_active: bool = True


# 角色创建模式
class RoleCreate(RoleBase):
    pass


# 角色更新模式
class RoleUpdate(BaseModel):
    name: Optional[str] = None
    display_name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


# 角色响应模式
class Role(RoleBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# 角色详细信息（包含权限）
class RoleDetail(Role):
    permissions: List['PermissionBase'] = []


# 权限基础模式
class PermissionBase(BaseModel):
    name: str
    display_name: str
    description: Optional[str] = None
    resource: str
    action: str
    is_active: bool = True


# 权限创建模式
class PermissionCreate(PermissionBase):
    pass


# 权限响应模式
class Permission(PermissionBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True


# 登录模式
class UserLogin(BaseModel):
    email: EmailStr
    password: str


# 令牌模式
class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


# 令牌负载
class TokenPayload(BaseModel):
    user_id: int
    email: str
    exp: datetime
    iat: datetime
    type: str  # "access" 或 "refresh"


# 刷新令牌请求
class RefreshTokenRequest(BaseModel):
    refresh_token: str


# 用户注册模式
class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=100)
    full_name: str = Field(..., min_length=1, max_length=100)
    
    @validator('password')
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('密码长度至少8位')
        if not any(c.isupper() for c in v):
            raise ValueError('密码必须包含至少一个大写字母')
        if not any(c.islower() for c in v):
            raise ValueError('密码必须包含至少一个小写字母')
        if not any(c.isdigit() for c in v):
            raise ValueError('密码必须包含至少一个数字')
        return v


# 用户列表查询参数
class UserListQuery(BaseModel):
    page: int = Field(1, ge=1)
    limit: int = Field(10, ge=1, le=100)
    search: Optional[str] = None
    is_active: Optional[bool] = None
    is_verified: Optional[bool] = None
    role_id: Optional[int] = None


# 用户列表响应
class UserListResponse(BaseModel):
    items: List[User]
    total: int
    page: int
    limit: int
    pages: int


# 角色分配模式
class RoleAssignment(BaseModel):
    user_id: int
    role_id: int


# 权限检查响应
class PermissionCheck(BaseModel):
    has_permission: bool
    user_id: int
    permission: str


# 用户统计
class UserStats(BaseModel):
    total_users: int
    active_users: int
    verified_users: int
    new_users_today: int
    new_users_this_week: int
    new_users_this_month: int


# 用户设置更新模式
class UserSettingsUpdate(BaseModel):
    ssh_private_key: Optional[str] = None
    
    @validator('ssh_private_key')
    def validate_ssh_key(cls, v):
        if v is None:
            return v
        # 简单的SSH私钥格式验证
        if v and not (v.startswith('-----BEGIN') and '-----END' in v):
            raise ValueError('SSH私钥格式无效')
        return v


# 用户设置响应模式
class UserSettings(BaseModel):
    has_ssh_key: bool = False
    ssh_key_fingerprint: Optional[str] = None
    
    class Config:
        from_attributes = True


# 更新前向引用
UserDetail.model_rebuild()
RoleDetail.model_rebuild()