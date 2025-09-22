"""
自定义中间件模块
"""
import time
import logging
import uuid
from typing import Callable, Dict, Any
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response, JSONResponse
from fastapi import status

from app.core.config import settings
from app.core.exceptions import RateLimitError


class LoggingMiddleware(BaseHTTPMiddleware):
    """请求日志中间件"""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # 生成请求ID
        request_id = str(uuid.uuid4())
        
        # 添加请求ID到请求状态
        request.state.request_id = request_id
        
        # 记录请求开始
        start_time = time.time()
        logging.info(
            f"Request started - {request.method} {request.url} - ID: {request_id}"
        )
        
        try:
            # 处理请求
            response = await call_next(request)
            
            # 计算处理时间
            process_time = time.time() - start_time
            
            # 添加响应头
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Process-Time"] = str(process_time)
            
            # 记录请求完成
            logging.info(
                f"Request completed - {request.method} {request.url} - "
                f"Status: {response.status_code} - "
                f"Time: {process_time:.3f}s - "
                f"ID: {request_id}"
            )
            
            return response
            
        except Exception as e:
            # 计算处理时间
            process_time = time.time() - start_time
            
            # 记录错误
            logging.error(
                f"Request failed - {request.method} {request.url} - "
                f"Error: {str(e)} - "
                f"Time: {process_time:.3f}s - "
                f"ID: {request_id}",
                exc_info=True
            )
            
            raise


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """安全头中间件"""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        
        # 添加安全头
        security_headers = {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "X-XSS-Protection": "1; mode=block",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "Content-Security-Policy": (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: https:; "
                "connect-src 'self'; "
                "font-src 'self'; "
                "object-src 'none'; "
                "media-src 'self'; "
                "frame-src 'none'"
            ),
        }
        
        # 在生产环境添加HSTS
        if settings.ENVIRONMENT == "production":
            security_headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )
        
        for header, value in security_headers.items():
            response.headers[header] = value
        
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """简单的内存限流中间件"""
    
    def __init__(self, app, max_requests: int = 100, window_seconds: int = 60):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: Dict[str, list] = {}  # IP -> 请求时间戳列表
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # 获取客户端IP
        client_ip = self._get_client_ip(request)
        
        # 检查限流
        if self._is_rate_limited(client_ip):
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": {
                        "code": "RATE_LIMIT_ERROR",
                        "message": "Too many requests",
                        "details": {
                            "max_requests": self.max_requests,
                            "window_seconds": self.window_seconds
                        }
                    },
                    "timestamp": time.time()
                },
                headers={
                    "Retry-After": str(self.window_seconds),
                    "X-RateLimit-Limit": str(self.max_requests),
                    "X-RateLimit-Window": str(self.window_seconds)
                }
            )
        
        # 记录请求
        self._record_request(client_ip)
        
        response = await call_next(request)
        
        # 添加限流相关响应头
        remaining = self._get_remaining_requests(client_ip)
        response.headers["X-RateLimit-Limit"] = str(self.max_requests)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(int(time.time()) + self.window_seconds)
        
        return response
    
    def _get_client_ip(self, request: Request) -> str:
        """获取客户端真实IP"""
        # 检查反向代理头
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            # 取第一个IP（客户端真实IP）
            return forwarded_for.split(",")[0].strip()
        
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip.strip()
        
        # 返回客户端地址
        if hasattr(request, "client") and request.client:
            return request.client.host
        
        return "unknown"
    
    def _is_rate_limited(self, client_ip: str) -> bool:
        """检查是否达到限流阈值"""
        now = time.time()
        cutoff_time = now - self.window_seconds
        
        # 获取该IP的请求记录
        if client_ip not in self.requests:
            return False
        
        # 清理过期记录
        self.requests[client_ip] = [
            req_time for req_time in self.requests[client_ip] 
            if req_time > cutoff_time
        ]
        
        # 检查是否超过限制
        return len(self.requests[client_ip]) >= self.max_requests
    
    def _record_request(self, client_ip: str):
        """记录请求"""
        now = time.time()
        
        if client_ip not in self.requests:
            self.requests[client_ip] = []
        
        self.requests[client_ip].append(now)
    
    def _get_remaining_requests(self, client_ip: str) -> int:
        """获取剩余请求数"""
        if client_ip not in self.requests:
            return self.max_requests
        
        return max(0, self.max_requests - len(self.requests[client_ip]))


class DatabaseTransactionMiddleware(BaseHTTPMiddleware):
    """数据库事务中间件（用于自动事务管理）"""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # 对于非GET请求，可以考虑自动开启事务
        if request.method in ["POST", "PUT", "DELETE", "PATCH"]:
            # 这里可以添加事务逻辑
            pass
        
        response = await call_next(request)
        return response


class CacheControlMiddleware(BaseHTTPMiddleware):
    """缓存控制中间件"""
    
    def __init__(self, app):
        super().__init__(app)
        self.cache_rules = {
            "/health": 60,  # 健康检查缓存60秒
            "/api/v1/users/me": 300,  # 用户信息缓存5分钟
            "/api/v1/projects": 180,  # 项目列表缓存3分钟
        }
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        
        # 根据路径设置缓存头
        path = request.url.path
        cache_time = self._get_cache_time(path)
        
        if cache_time > 0 and request.method == "GET":
            response.headers["Cache-Control"] = f"public, max-age={cache_time}"
            response.headers["Expires"] = str(int(time.time()) + cache_time)
        else:
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        
        return response
    
    def _get_cache_time(self, path: str) -> int:
        """获取路径对应的缓存时间"""
        for pattern, cache_time in self.cache_rules.items():
            if path.startswith(pattern):
                return cache_time
        
        return 0  # 默认不缓存


class ResponseTimeMiddleware(BaseHTTPMiddleware):
    """响应时间中间件"""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start_time = time.time()
        response = await call_next(request)
        process_time = time.time() - start_time
        
        response.headers["X-Response-Time"] = f"{process_time:.3f}s"
        
        return response