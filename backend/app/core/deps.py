"""
依赖注入和认证中间件
"""
from typing import Generator, Optional, Any, Dict
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select
from app.db.database import get_db
from app.models.user import User, UserRole
from app.core.security import verify_token
from app.core.config import settings

# JWT认证scheme
security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> Optional[User]:
    """
    获取当前认证用户
    
    Args:
        credentials: JWT认证凭据
        db: 数据库会话
        
    Returns:
        当前用户对象或None
    """
    if not credentials:
        return None
    
    # 验证令牌
    token_payload = verify_token(credentials.credentials)
    if not token_payload or token_payload.get("type") != "access":
        return None
    
    # 获取用户
    user_id = token_payload.get("user_id")
    if not user_id:
        return None
    
    stmt = select(User).options(
        selectinload(User.user_roles).selectinload(UserRole.role)
    ).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if not user or not user.is_active:
        return None
    
    return user


async def get_current_active_user(
    current_user: Optional[User] = Depends(get_current_user)
) -> User:
    """
    获取当前活跃用户（必须认证）
    
    Args:
        current_user: 当前用户
        
    Returns:
        当前用户对象
        
    Raises:
        HTTPException: 未认证时抛出401错误
    """
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未认证的访问",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return current_user


async def get_current_superuser(
    current_user: User = Depends(get_current_active_user)
) -> User:
    """
    获取当前超级用户
    
    Args:
        current_user: 当前用户
        
    Returns:
        当前超级用户对象
        
    Raises:
        HTTPException: 非超级用户时抛出403错误
    """
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足，需要超级用户权限"
        )
    return current_user


def require_permission(permission_name: str):
    """
    权限检查装饰器工厂
    
    Args:
        permission_name: 权限名称
        
    Returns:
        权限检查依赖函数
    """
    async def permission_checker(
        current_user: User = Depends(get_current_active_user)
    ) -> User:
        """检查用户是否有指定权限"""
        if not current_user.has_permission(permission_name):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"权限不足，需要权限：{permission_name}"
            )
        return current_user
    
    return permission_checker


def require_role(role_name: str):
    """
    角色检查装饰器工厂
    
    Args:
        role_name: 角色名称
        
    Returns:
        角色检查依赖函数
    """
    async def role_checker(
        current_user: User = Depends(get_current_active_user)
    ) -> User:
        """检查用户是否有指定角色"""
        if not current_user.has_role(role_name):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"权限不足，需要角色：{role_name}"
            )
        return current_user
    
    return role_checker


class PermissionChecker:
    """权限检查器类"""
    
    def __init__(self, permission: str):
        self.permission = permission
    
    def __call__(self, current_user: User = Depends(get_current_active_user)) -> User:
        """检查权限"""
        if not current_user.has_permission(self.permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"权限不足，需要权限：{self.permission}"
            )
        return current_user


class RoleChecker:
    """角色检查器类"""
    
    def __init__(self, role: str):
        self.role = role
    
    def __call__(self, current_user: User = Depends(get_current_active_user)) -> User:
        """检查角色"""
        if not current_user.has_role(self.role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"权限不足，需要角色：{self.role}"
            )
        return current_user


# 常用权限检查器实例
require_admin = RoleChecker("admin")
require_user = RoleChecker("user")

# 常用权限检查器
require_user_read = PermissionChecker("user:read")
require_user_write = PermissionChecker("user:write")
require_project_read = PermissionChecker("project:read")
require_project_write = PermissionChecker("project:write")
require_task_read = PermissionChecker("task:read")
require_task_write = PermissionChecker("task:write")
require_task_execute = PermissionChecker("task:execute")


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> Optional[User]:
    """
    获取可选的当前用户（不强制认证）
    
    Args:
        credentials: JWT认证凭据
        db: 数据库会话
        
    Returns:
        当前用户对象或None
    """
    try:
        return await get_current_user(credentials, db)
    except Exception:
        return None


def get_client_info() -> Dict[str, Any]:
    """
    获取客户端信息的依赖
    
    Returns:
        包含客户端信息的字典
    """
    from fastapi import Request
    
    def _get_client_info(request: Request) -> Dict[str, Any]:
        return {
            "user_agent": request.headers.get("user-agent"),
            "ip_address": request.client.host if request.client else None,
            "referer": request.headers.get("referer"),
            "origin": request.headers.get("origin")
        }
    
    return _get_client_info