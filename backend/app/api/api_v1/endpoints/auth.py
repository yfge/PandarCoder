"""
认证相关API端点
"""
from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.database import get_db
from app.schemas.user import (
    UserRegister, UserLogin, User, Token, RefreshTokenRequest,
    UserPasswordUpdate
)
from app.services.auth import AuthService
from app.core.deps import get_current_active_user, get_client_info
from app.models.user import User as UserModel

router = APIRouter()


@router.post("/register", response_model=User, status_code=status.HTTP_201_CREATED)
async def register_user(
    user_register: UserRegister,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    用户注册
    
    注册新用户账户。注册成功后用户需要验证邮箱才能完全激活账户。
    """
    try:
        user = await AuthService.register_user(db, user_register)
        return user
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="注册失败，请稍后重试"
        )


@router.post("/login", response_model=Dict[str, Any])
async def login_user(
    user_login: UserLogin,
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    用户登录
    
    使用邮箱和密码登录，返回访问令牌和刷新令牌。
    """
    try:
        # 获取客户端信息
        user_agent = request.headers.get("user-agent")
        ip_address = request.client.host if request.client else None
        
        # 登录用户
        token_data = await AuthService.login_user(
            db, user_login, user_agent, ip_address
        )
        
        return {
            "access_token": token_data["access_token"],
            "refresh_token": token_data["refresh_token"],
            "token_type": token_data["token_type"],
            "expires_in": token_data["expires_in"],
            "user": token_data["user"]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="登录失败，请稍后重试"
        )


@router.post("/refresh", response_model=Token)
async def refresh_access_token(
    refresh_request: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    刷新访问令牌
    
    使用刷新令牌获取新的访问令牌和刷新令牌。
    """
    try:
        token_data = await AuthService.refresh_token(db, refresh_request)
        return Token(**token_data)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="刷新令牌失败，请重新登录"
        )


@router.post("/logout")
async def logout_user(
    refresh_request: RefreshTokenRequest,
    current_user: UserModel = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    用户登出
    
    使刷新令牌失效，用户需要重新登录。
    """
    try:
        success = await AuthService.logout_user(db, refresh_request.refresh_token)
        
        if success:
            return {"message": "已成功登出"}
        else:
            return {"message": "登出完成"}
    except Exception as e:
        # 即使登出失败，也返回成功，因为这是幂等操作
        return {"message": "登出完成"}


@router.get("/me", response_model=User)
async def get_current_user_info(
    current_user: UserModel = Depends(get_current_active_user)
) -> Any:
    """
    获取当前用户信息
    
    返回当前认证用户的详细信息。
    """
    return current_user


@router.put("/me", response_model=User)
async def update_current_user(
    user_update: Dict[str, Any],
    current_user: UserModel = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    更新当前用户信息
    
    更新当前认证用户的基本信息。
    """
    try:
        from app.schemas.user import UserUpdate
        
        # 过滤掉不能更新的字段
        allowed_fields = {"full_name", "avatar_url"}
        filtered_update = {k: v for k, v in user_update.items() if k in allowed_fields}
        
        user_update_obj = UserUpdate(**filtered_update)
        updated_user = await AuthService.update_user(db, current_user.id, user_update_obj)
        
        if not updated_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="用户不存在"
            )
        
        return updated_user
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="更新用户信息失败"
        )


@router.post("/change-password")
async def change_user_password(
    password_update: UserPasswordUpdate,
    current_user: UserModel = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    修改用户密码
    
    修改当前认证用户的密码。修改后所有已登录的会话都将失效。
    """
    try:
        success = await AuthService.change_password(
            db, current_user.id, 
            password_update.current_password, 
            password_update.new_password
        )
        
        if success:
            return {"message": "密码修改成功，请重新登录"}
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="用户不存在"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="密码修改失败"
        )


@router.get("/check-status")
async def check_auth_status(
    current_user: UserModel = Depends(get_current_active_user)
) -> Any:
    """
    检查认证状态
    
    检查当前用户的认证状态和基本信息。
    """
    return {
        "authenticated": True,
        "user": {
            "id": current_user.id,
            "email": current_user.email,
            "full_name": current_user.full_name,
            "is_active": current_user.is_active,
            "is_verified": current_user.is_verified
        }
    }