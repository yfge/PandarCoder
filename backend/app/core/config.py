from typing import Any, Dict, List, Optional, Union
from pydantic_settings import BaseSettings
import secrets


class Settings(BaseSettings):
    PROJECT_NAME: str = "Pandar Coder"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"
    
    # Server Configuration
    HOST: str = "0.0.0.0"
    PORT: int = 8100  # 使用非常用端口避免冲突
    
    # Security
    SECRET_KEY: str = secrets.token_urlsafe(32)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30  # 30 minutes
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30  # 30 days
    
    # Email token expiration
    EMAIL_RESET_TOKEN_EXPIRE_HOURS: int = 48  # 48 hours
    EMAIL_VERIFICATION_TOKEN_EXPIRE_DAYS: int = 7  # 7 days
    
    # Password requirements
    PASSWORD_MIN_LENGTH: int = 8
    PASSWORD_REQUIRE_UPPERCASE: bool = True
    PASSWORD_REQUIRE_LOWERCASE: bool = True
    PASSWORD_REQUIRE_NUMBERS: bool = True
    PASSWORD_REQUIRE_SPECIAL_CHARS: bool = False
    
    # Rate limiting
    RATE_LIMIT_LOGIN_ATTEMPTS: int = 5
    RATE_LIMIT_LOGIN_WINDOW_MINUTES: int = 15
    
    # Session settings
    SESSION_COOKIE_NAME: str = "claude_web_session"
    SESSION_EXPIRE_HOURS: int = 24
    
    # Database Configuration
    DATABASE_URL: str = "mysql+aiomysql://root:Pa88word@127.0.0.1:13306/claude_web"
    TEST_DATABASE_URL: str = "mysql+aiomysql://root:Pa88word@127.0.0.1:13307/claude_web_test"
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20
    
    # Redis Configuration
    REDIS_URL: str = "redis://127.0.0.1:16379/0"
    TEST_REDIS_URL: str = "redis://127.0.0.1:16380/0"
    
    # CORS Origins
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3100",  # 前端开发服务器新端口
        "http://localhost:3000",  # 保持兼容
        "http://127.0.0.1:3100",
        "http://127.0.0.1:3000",
    ]
    
    # Environment
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    
    # Logging
    LOG_LEVEL: str = "INFO"
    
    # Claude API
    CLAUDE_API_KEY: str = ""
    CLAUDE_API_BASE_URL: str = "https://api.anthropic.com"
    
    
    model_config = {
        "env_file": ".env",
        "case_sensitive": True,
        "extra": "ignore"
    }


settings = Settings()
