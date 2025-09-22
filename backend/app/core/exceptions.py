"""
自定义异常模块
"""
from typing import Any, Dict, Optional
from fastapi import HTTPException, status


class CustomHTTPException(HTTPException):
    """自定义HTTP异常基类"""
    
    def __init__(
        self,
        status_code: int,
        detail: str,
        error_code: str = "UNKNOWN_ERROR",
        details: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
    ):
        super().__init__(status_code=status_code, detail=detail, headers=headers)
        self.error_code = error_code
        self.details = details or {}


class ValidationError(CustomHTTPException):
    """验证错误"""
    
    def __init__(self, detail: str, field: str = None):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=detail,
            error_code="VALIDATION_ERROR",
            details={"field": field} if field else None,
        )


class AuthenticationError(CustomHTTPException):
    """认证错误"""
    
    def __init__(self, detail: str = "Authentication failed"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            error_code="AUTHENTICATION_ERROR",
            headers={"WWW-Authenticate": "Bearer"},
        )


class AuthorizationError(CustomHTTPException):
    """授权错误"""
    
    def __init__(self, detail: str = "Permission denied"):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail,
            error_code="AUTHORIZATION_ERROR",
        )


class NotFoundError(CustomHTTPException):
    """资源未找到错误"""
    
    def __init__(self, detail: str = "Resource not found", resource_type: str = None):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=detail,
            error_code="NOT_FOUND",
            details={"resource_type": resource_type} if resource_type else None,
        )


class ConflictError(CustomHTTPException):
    """冲突错误"""
    
    def __init__(self, detail: str = "Resource conflict", resource_id: str = None):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail=detail,
            error_code="CONFLICT_ERROR",
            details={"resource_id": resource_id} if resource_id else None,
        )


class RateLimitError(CustomHTTPException):
    """频率限制错误"""
    
    def __init__(self, detail: str = "Rate limit exceeded", retry_after: int = 60):
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detail,
            error_code="RATE_LIMIT_ERROR",
            headers={"Retry-After": str(retry_after)},
            details={"retry_after": retry_after},
        )


class InternalServerError(CustomHTTPException):
    """内部服务器错误"""
    
    def __init__(self, detail: str = "Internal server error"):
        super().__init__(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=detail,
            error_code="INTERNAL_SERVER_ERROR",
        )


class DatabaseConnectionError(CustomHTTPException):
    """数据库连接错误"""
    
    def __init__(self, detail: str = "Database connection failed"):
        super().__init__(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=detail,
            error_code="DATABASE_CONNECTION_ERROR",
        )


class ExternalServiceError(CustomHTTPException):
    """外部服务错误"""
    
    def __init__(self, detail: str = "External service unavailable", service_name: str = None):
        super().__init__(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=detail,
            error_code="EXTERNAL_SERVICE_ERROR",
            details={"service_name": service_name} if service_name else None,
        )


# 业务逻辑异常
class UserNotFoundError(NotFoundError):
    """用户未找到"""
    
    def __init__(self, user_id: str = None):
        detail = f"User not found: {user_id}" if user_id else "User not found"
        super().__init__(detail=detail, resource_type="user")


class ProjectNotFoundError(NotFoundError):
    """项目未找到"""
    
    def __init__(self, project_id: str = None):
        detail = f"Project not found: {project_id}" if project_id else "Project not found"
        super().__init__(detail=detail, resource_type="project")


class TaskNotFoundError(NotFoundError):
    """任务未找到"""
    
    def __init__(self, task_id: str = None):
        detail = f"Task not found: {task_id}" if task_id else "Task not found"
        super().__init__(detail=detail, resource_type="task")


class InvalidCredentialsError(AuthenticationError):
    """无效凭据"""
    
    def __init__(self):
        super().__init__(detail="Invalid credentials provided")


class ExpiredTokenError(AuthenticationError):
    """令牌过期"""
    
    def __init__(self):
        super().__init__(detail="Token has expired")


class InsufficientPermissionsError(AuthorizationError):
    """权限不足"""
    
    def __init__(self, required_permission: str = None):
        detail = f"Insufficient permissions. Required: {required_permission}" if required_permission else "Insufficient permissions"
        super().__init__(detail=detail)


class EmailAlreadyExistsError(ConflictError):
    """邮箱已存在"""
    
    def __init__(self, email: str):
        super().__init__(
            detail=f"Email already exists: {email}",
            resource_id=email
        )


class ProjectNameConflictError(ConflictError):
    """项目名称冲突"""
    
    def __init__(self, project_name: str):
        super().__init__(
            detail=f"Project name already exists: {project_name}",
            resource_id=project_name
        )