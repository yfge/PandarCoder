"""
认证相关服务
"""
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select, update, and_, or_
from fastapi import HTTPException, status
from app.models.user import User, Role, Permission, UserRole, RefreshToken
from app.schemas.user import (
    UserCreate, UserUpdate, UserLogin, UserRegister,
    Token, RefreshTokenRequest
)
from app.core.security import (
    verify_password, get_password_hash, create_token_pair,
    verify_token, generate_secure_token
)
from app.core.config import settings


class AuthService:
    """认证服务类"""
    
    @staticmethod
    async def create_user(db: AsyncSession, user_create: UserCreate) -> User:
        """
        创建用户
        
        Args:
            db: 数据库会话
            user_create: 用户创建数据
            
        Returns:
            创建的用户对象
            
        Raises:
            HTTPException: 邮箱已存在时抛出
        """
        # 检查邮箱是否已存在
        stmt = select(User).where(User.email == user_create.email)
        result = await db.execute(stmt)
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="邮箱已被使用"
            )
        
        # 创建用户
        hashed_password = get_password_hash(user_create.password)
        db_user = User(
            email=user_create.email,
            full_name=user_create.full_name,
            hashed_password=hashed_password,
            is_active=user_create.is_active,
            is_verified=user_create.is_verified
        )
        
        db.add(db_user)
        await db.commit()
        await db.refresh(db_user)
        
        # 为新用户分配默认角色
        await AuthService._assign_default_role(db, db_user)
        
        return db_user
    
    @staticmethod
    async def register_user(db: AsyncSession, user_register: UserRegister) -> User:
        """
        用户注册
        
        Args:
            db: 数据库会话
            user_register: 用户注册数据
            
        Returns:
            创建的用户对象
        """
        user_create = UserCreate(
            email=user_register.email,
            full_name=user_register.full_name,
            password=user_register.password,
            is_active=True,
            is_verified=False  # 注册时默认未验证
        )
        
        return await AuthService.create_user(db, user_create)
    
    @staticmethod
    async def authenticate_user(db: AsyncSession, email: str, password: str) -> Optional[User]:
        """
        用户认证
        
        Args:
            db: 数据库会话
            email: 用户邮箱
            password: 密码
            
        Returns:
            认证成功返回用户对象，失败返回 None
        """
        stmt = select(User).where(User.email == email)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()
        
        if not user:
            return None
        
        if not verify_password(password, user.hashed_password):
            return None
        
        # 更新登录信息
        user.last_login = datetime.utcnow()
        user.login_count += 1
        await db.commit()
        
        return user
    
    @staticmethod
    async def login_user(db: AsyncSession, user_login: UserLogin, 
                        user_agent: Optional[str] = None, 
                        ip_address: Optional[str] = None) -> Dict[str, Any]:
        """
        用户登录
        
        Args:
            db: 数据库会话
            user_login: 登录数据
            user_agent: 用户代理
            ip_address: IP地址
            
        Returns:
            包含令牌的字典
            
        Raises:
            HTTPException: 认证失败时抛出
        """
        # 认证用户
        user = await AuthService.authenticate_user(
            db, user_login.email, user_login.password
        )
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="邮箱或密码错误"
            )
        
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="用户账户已被禁用"
            )
        
        # 创建令牌
        token_data = create_token_pair(user.id, user.email)
        
        # 保存刷新令牌
        await AuthService._save_refresh_token(
            db, user.id, token_data["refresh_token"], user_agent, ip_address
        )
        
        # 加载用户详细信息
        stmt = select(User).options(
            selectinload(User.user_roles).selectinload(UserRole.role)
        ).where(User.id == user.id)
        result = await db.execute(stmt)
        user_with_roles = result.scalar_one()
        
        # 转换为 Pydantic 模型进行序列化
        from app.schemas.user import User as UserSchema
        user_schema = UserSchema.model_validate(user_with_roles)
        
        return {
            **token_data,
            "user": user_schema.model_dump()
        }
    
    @staticmethod
    async def refresh_token(db: AsyncSession, refresh_request: RefreshTokenRequest) -> Dict[str, Any]:
        """
        刷新令牌
        
        Args:
            db: 数据库会话
            refresh_request: 刷新令牌请求
            
        Returns:
            新的令牌对
            
        Raises:
            HTTPException: 刷新令牌无效时抛出
        """
        # 验证刷新令牌
        token_payload = verify_token(refresh_request.refresh_token)
        if not token_payload or token_payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="无效的刷新令牌"
            )
        
        # 检查数据库中的刷新令牌
        stmt = select(RefreshToken).where(
            and_(
                RefreshToken.token == refresh_request.refresh_token,
                RefreshToken.is_active == True,
                RefreshToken.expires_at > datetime.utcnow()
            )
        )
        result = await db.execute(stmt)
        db_refresh_token = result.scalar_one_or_none()
        
        if not db_refresh_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="刷新令牌已过期或无效"
            )
        
        # 获取用户
        user_id = token_payload.get("user_id")
        stmt = select(User).where(User.id == user_id)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()
        
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="用户不存在或已被禁用"
            )
        
        # 生成新令牌
        token_data = create_token_pair(user.id, user.email)
        
        # 更新数据库中的刷新令牌
        await db.execute(
            update(RefreshToken)
            .where(RefreshToken.id == db_refresh_token.id)
            .values(
                token=token_data["refresh_token"],
                expires_at=datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
            )
        )
        await db.commit()
        
        return token_data
    
    @staticmethod
    async def logout_user(db: AsyncSession, refresh_token: str) -> bool:
        """
        用户登出
        
        Args:
            db: 数据库会话
            refresh_token: 刷新令牌
            
        Returns:
            是否成功登出
        """
        stmt = update(RefreshToken).where(
            RefreshToken.token == refresh_token
        ).values(is_active=False)
        
        result = await db.execute(stmt)
        await db.commit()
        
        return result.rowcount > 0
    
    @staticmethod
    async def get_user_by_id(db: AsyncSession, user_id: int) -> Optional[User]:
        """
        根据ID获取用户
        
        Args:
            db: 数据库会话
            user_id: 用户ID
            
        Returns:
            用户对象或None
        """
        stmt = select(User).options(
            selectinload(User.user_roles).selectinload(UserRole.role)
        ).where(User.id == user_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
        """
        根据邮箱获取用户
        
        Args:
            db: 数据库会话
            email: 用户邮箱
            
        Returns:
            用户对象或None
        """
        stmt = select(User).where(User.email == email)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()
    
    @staticmethod
    async def update_user(db: AsyncSession, user_id: int, user_update: UserUpdate) -> Optional[User]:
        """
        更新用户信息
        
        Args:
            db: 数据库会话
            user_id: 用户ID
            user_update: 更新数据
            
        Returns:
            更新后的用户对象
        """
        stmt = select(User).where(User.id == user_id)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()
        
        if not user:
            return None
        
        # 更新字段
        update_data = user_update.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(user, field, value)
        
        user.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(user)
        
        return user
    
    @staticmethod
    async def change_password(db: AsyncSession, user_id: int, 
                            current_password: str, new_password: str) -> bool:
        """
        修改密码
        
        Args:
            db: 数据库会话
            user_id: 用户ID
            current_password: 当前密码
            new_password: 新密码
            
        Returns:
            是否修改成功
            
        Raises:
            HTTPException: 当前密码错误时抛出
        """
        stmt = select(User).where(User.id == user_id)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()
        
        if not user:
            return False
        
        # 验证当前密码
        if not verify_password(current_password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="当前密码错误"
            )
        
        # 更新密码
        user.hashed_password = get_password_hash(new_password)
        user.updated_at = datetime.utcnow()
        await db.commit()
        
        # 使所有刷新令牌失效
        await db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id)
            .values(is_active=False)
        )
        await db.commit()
        
        return True
    
    @staticmethod
    async def _assign_default_role(db: AsyncSession, user: User) -> None:
        """
        为用户分配默认角色
        
        Args:
            db: 数据库会话
            user: 用户对象
        """
        # 查找默认角色（user）
        stmt = select(Role).where(Role.name == "user")
        result = await db.execute(stmt)
        default_role = result.scalar_one_or_none()
        
        if default_role:
            user_role = UserRole(
                user_id=user.id,
                role_id=default_role.id,
                assigned_at=datetime.utcnow()
            )
            db.add(user_role)
            await db.commit()
    
    @staticmethod
    async def _save_refresh_token(db: AsyncSession, user_id: int, token: str,
                                 user_agent: Optional[str] = None,
                                 ip_address: Optional[str] = None) -> None:
        """
        保存刷新令牌到数据库
        
        Args:
            db: 数据库会话
            user_id: 用户ID
            token: 刷新令牌
            user_agent: 用户代理
            ip_address: IP地址
        """
        expires_at = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        
        refresh_token = RefreshToken(
            user_id=user_id,
            token=token,
            expires_at=expires_at,
            user_agent=user_agent,
            ip_address=ip_address
        )
        
        db.add(refresh_token)
        await db.commit()
    
    @staticmethod
    async def cleanup_expired_tokens(db: AsyncSession) -> int:
        """
        清理过期的刷新令牌
        
        Args:
            db: 数据库会话
            
        Returns:
            清理的令牌数量
        """
        stmt = update(RefreshToken).where(
            RefreshToken.expires_at < datetime.utcnow()
        ).values(is_active=False)
        
        result = await db.execute(stmt)
        await db.commit()
        
        return result.rowcount