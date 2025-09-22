"""
安全相关功能：密码哈希、JWT 令牌生成与验证
"""
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import JWTError, jwt
from passlib.context import CryptContext
from passlib.hash import bcrypt
from app.core.config import settings

# 密码哈希上下文
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT 配置
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES
REFRESH_TOKEN_EXPIRE_DAYS = settings.REFRESH_TOKEN_EXPIRE_DAYS


def create_access_token(data: Dict[Any, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    创建访问令牌
    
    Args:
        data: 令牌负载数据
        expires_delta: 过期时间增量
    
    Returns:
        JWT 访问令牌
    """
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({
        "exp": expire,
        "iat": datetime.utcnow(),
        "type": "access"
    })
    
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: Dict[Any, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    创建刷新令牌
    
    Args:
        data: 令牌负载数据
        expires_delta: 过期时间增量
    
    Returns:
        JWT 刷新令牌
    """
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    
    to_encode.update({
        "exp": expire,
        "iat": datetime.utcnow(),
        "type": "refresh"
    })
    
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_token(token: str) -> Optional[Dict[str, Any]]:
    """
    验证 JWT 令牌
    
    Args:
        token: JWT 令牌
    
    Returns:
        解码后的令牌负载，失败返回 None
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    验证密码
    
    Args:
        plain_password: 明文密码
        hashed_password: 哈希密码
    
    Returns:
        密码是否正确
    """
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """
    生成密码哈希
    
    Args:
        password: 明文密码
    
    Returns:
        哈希密码
    """
    return pwd_context.hash(password)


def generate_password_reset_token(email: str) -> str:
    """
    生成密码重置令牌
    
    Args:
        email: 用户邮箱
    
    Returns:
        密码重置令牌
    """
    delta = timedelta(hours=settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS)
    now = datetime.utcnow()
    expires = now + delta
    exp = expires.timestamp()
    encoded_jwt = jwt.encode(
        {"exp": exp, "nbf": now, "sub": email, "type": "password_reset"},
        settings.SECRET_KEY,
        algorithm=ALGORITHM,
    )
    return encoded_jwt


def verify_password_reset_token(token: str) -> Optional[str]:
    """
    验证密码重置令牌
    
    Args:
        token: 密码重置令牌
    
    Returns:
        用户邮箱，失败返回 None
    """
    try:
        decoded_token = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        if decoded_token.get("type") != "password_reset":
            return None
        return decoded_token["sub"]
    except JWTError:
        return None


def generate_email_verification_token(email: str) -> str:
    """
    生成邮箱验证令牌
    
    Args:
        email: 用户邮箱
    
    Returns:
        邮箱验证令牌
    """
    delta = timedelta(days=settings.EMAIL_VERIFICATION_TOKEN_EXPIRE_DAYS)
    now = datetime.utcnow()
    expires = now + delta
    exp = expires.timestamp()
    encoded_jwt = jwt.encode(
        {"exp": exp, "nbf": now, "sub": email, "type": "email_verification"},
        settings.SECRET_KEY,
        algorithm=ALGORITHM,
    )
    return encoded_jwt


def verify_email_verification_token(token: str) -> Optional[str]:
    """
    验证邮箱验证令牌
    
    Args:
        token: 邮箱验证令牌
    
    Returns:
        用户邮箱，失败返回 None
    """
    try:
        decoded_token = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        if decoded_token.get("type") != "email_verification":
            return None
        return decoded_token["sub"]
    except JWTError:
        return None


def generate_api_key() -> str:
    """
    生成 API 密钥
    
    Returns:
        随机 API 密钥
    """
    return secrets.token_urlsafe(32)


def generate_secure_token() -> str:
    """
    生成安全令牌
    
    Returns:
        安全随机令牌
    """
    return secrets.token_urlsafe(64)


def is_token_expired(token_payload: Dict[str, Any]) -> bool:
    """
    检查令牌是否过期
    
    Args:
        token_payload: 令牌负载
    
    Returns:
        是否过期
    """
    if "exp" not in token_payload:
        return True
    
    exp_timestamp = token_payload["exp"]
    current_timestamp = datetime.utcnow().timestamp()
    
    return current_timestamp > exp_timestamp


def get_token_remaining_time(token_payload: Dict[str, Any]) -> Optional[timedelta]:
    """
    获取令牌剩余有效时间
    
    Args:
        token_payload: 令牌负载
    
    Returns:
        剩余时间，已过期返回 None
    """
    if "exp" not in token_payload:
        return None
    
    exp_timestamp = token_payload["exp"]
    current_timestamp = datetime.utcnow().timestamp()
    
    if current_timestamp > exp_timestamp:
        return None
    
    remaining_seconds = exp_timestamp - current_timestamp
    return timedelta(seconds=remaining_seconds)


def create_token_pair(user_id: int, email: str) -> Dict[str, Any]:
    """
    创建访问令牌和刷新令牌对
    
    Args:
        user_id: 用户ID
        email: 用户邮箱
    
    Returns:
        包含访问令牌和刷新令牌的字典
    """
    token_data = {"user_id": user_id, "email": email}
    
    access_token = create_access_token(data=token_data)
    refresh_token = create_refresh_token(data=token_data)
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60
    }