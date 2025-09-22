from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
import time
import logging
from contextlib import asynccontextmanager

from app.core.config import settings
from app.core.exceptions import (
    CustomHTTPException,
    InternalServerError,
    DatabaseConnectionError
)
from app.core.middleware import (
    LoggingMiddleware,
    SecurityHeadersMiddleware,
    RateLimitMiddleware
)
from app.api.api_v1.api import api_router
from app.db.database import engine, check_db_connection

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时的初始化
    logging.info("Starting up Claude Web API...")
    
    # 测试数据库连接
    try:
        if await check_db_connection():
            logging.info("Database connection successful")
        else:
            raise DatabaseConnectionError("Failed to connect to database")
    except Exception as e:
        logging.error(f"Database connection failed: {e}")
        raise DatabaseConnectionError("Failed to connect to database")
    
    yield
    
    # 关闭时的清理
    logging.info("Shutting down Claude Web API...")
    from app.db.database import close_db_connections
    await close_db_connections()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Claude Web API - Remote Claude CLI Control Platform",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
    debug=settings.DEBUG,
)

# 添加中间件 (注意顺序)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(LoggingMiddleware)

# CORS中间件
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "X-Requested-With",
            "Accept",
            "Origin",
            "User-Agent",
            "X-CSRF-Token",
            "X-Request-ID"
        ],
        expose_headers=["X-Total-Count", "X-Rate-Limit-*"],
    )

# 全局异常处理
@app.exception_handler(CustomHTTPException)
async def custom_http_exception_handler(request: Request, exc: CustomHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.error_code,
                "message": exc.detail,
                "details": exc.details
            },
            "timestamp": time.time(),
            "path": request.url.path
        }
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # Convert errors to JSON-serializable format
    errors = []
    for error in exc.errors():
        errors.append({
            "loc": error.get("loc", []),
            "msg": str(error.get("msg", "")),
            "type": str(error.get("type", ""))
        })
    
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Request validation failed",
                "details": errors
            },
            "timestamp": time.time(),
            "path": request.url.path
        }
    )

@app.exception_handler(500)
async def internal_server_error_handler(request: Request, exc: Exception):
    logging.error(f"Internal server error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "Internal server error occurred",
                "details": str(exc) if settings.DEBUG else None
            },
            "timestamp": time.time(),
            "path": request.url.path
        }
    )

# 路由注册
app.include_router(api_router, prefix=settings.API_V1_STR)

# 基础端点
@app.get("/", tags=["Root"])
async def root():
    """API根端点"""
    return {
        "message": "Claude Web API",
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "docs": "/docs",
        "openapi": f"{settings.API_V1_STR}/openapi.json"
    }

@app.get("/health", tags=["Health"])
async def health_check():
    """健康检查端点"""
    try:
        # 检查数据库连接
        if await check_db_connection():
            db_status = "healthy"
        else:
            db_status = "unhealthy"
    except Exception as e:
        logging.error(f"Database health check failed: {e}")
        db_status = "unhealthy"
    
    health_status = {
        "status": "healthy" if db_status == "healthy" else "degraded",
        "version": settings.VERSION,
        "timestamp": time.time(),
        "checks": {
            "database": db_status,
            "api": "healthy"
        }
    }
    
    status_code = 200 if health_status["status"] == "healthy" else 503
    return JSONResponse(content=health_status, status_code=status_code)

@app.get("/health/ready", tags=["Health"])
async def readiness_check():
    """就绪检查端点"""
    return {"status": "ready", "timestamp": time.time()}

@app.get("/health/live", tags=["Health"])
async def liveness_check():
    """存活检查端点"""
    return {"status": "alive", "timestamp": time.time()}

# 启动配置
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower()
    )