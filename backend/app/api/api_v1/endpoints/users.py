from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User
from app.schemas.user import User as UserSchema, UserUpdate, UserSettingsUpdate, UserSettings
import hashlib

router = APIRouter()


@router.get("/me", response_model=UserSchema)
async def get_current_user_info(
    current_user: User = Depends(get_current_active_user)
):
    """获取当前用户信息"""
    return current_user


@router.put("/me", response_model=UserSchema)
async def update_current_user(
    user_update: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """更新当前用户信息"""
    from app.services.auth import AuthService
    
    updated_user = await AuthService.update_user(db, current_user.id, user_update)
    if not updated_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return updated_user


@router.get("/settings", response_model=UserSettings)
async def get_user_settings(
    current_user: User = Depends(get_current_active_user)
):
    """获取用户设置"""
    has_ssh_key = bool(current_user.ssh_private_key)
    ssh_key_fingerprint = None
    
    if has_ssh_key and current_user.ssh_private_key:
        # 生成SSH密钥指纹（取前16字符作为简短指纹）
        ssh_key_fingerprint = hashlib.md5(
            current_user.ssh_private_key.encode()
        ).hexdigest()[:16]
    
    return UserSettings(
        has_ssh_key=has_ssh_key,
        ssh_key_fingerprint=ssh_key_fingerprint
    )


@router.put("/settings", response_model=UserSettings)
async def update_user_settings(
    settings: UserSettingsUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """更新用户设置"""
    if settings.ssh_private_key is not None:
        # 如果提供了空字符串，删除SSH密钥
        if settings.ssh_private_key.strip() == "":
            current_user.ssh_private_key = None
        else:
            # 存储SSH私钥（实际生产中应该使用专门的密钥管理服务）
            current_user.ssh_private_key = settings.ssh_private_key
    
    await db.commit()
    await db.refresh(current_user)
    
    # 返回更新后的设置
    return await get_user_settings(current_user)