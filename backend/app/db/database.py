from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from app.core.config import settings


class Base(DeclarativeBase):
    """数据库模型基类"""
    pass


# 创建异步引擎
def create_engine_with_config(url: str, is_test: bool = False):
    """根据数据库类型创建合适的引擎配置"""
    base_config = {
        "echo": settings.DEBUG and not is_test,
        "echo_pool": settings.DEBUG and not is_test,
        "future": True,
    }
    
    # SQLite配置（测试用）
    if url.startswith("sqlite"):
        base_config.update({
            "poolclass": NullPool,
            "connect_args": {"check_same_thread": False}
        })
    else:
        # MySQL配置（生产用）
        if is_test:
            base_config.update({"poolclass": NullPool})
        else:
            base_config.update({
                "pool_size": settings.DATABASE_POOL_SIZE,
                "max_overflow": settings.DATABASE_MAX_OVERFLOW,
                "pool_pre_ping": True,
                "pool_recycle": 3600,
            })
    
    return create_async_engine(url, **base_config)

engine = create_engine_with_config(settings.DATABASE_URL)

# 测试数据库引擎
test_engine = None
if settings.ENVIRONMENT == "testing":
    test_engine = create_engine_with_config(settings.TEST_DATABASE_URL, is_test=True)

# 创建会话工厂
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=True,
    autocommit=False,
)

# 测试会话工厂
test_session_maker = None
if test_engine:
    test_session_maker = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=True,
        autocommit=False,
    )


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """获取数据库会话依赖"""
    session_maker = test_session_maker if settings.ENVIRONMENT == "testing" else async_session_maker
    
    async with session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@asynccontextmanager
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """获取数据库会话上下文管理器"""
    session_maker = test_session_maker if settings.ENVIRONMENT == "testing" else async_session_maker
    
    async with session_maker() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """初始化数据库（创建表）"""
    current_engine = test_engine if settings.ENVIRONMENT == "testing" else engine
    
    async with current_engine.begin() as conn:
        # 创建所有表
        await conn.run_sync(Base.metadata.create_all)
        logging.info("Database tables created successfully")


async def drop_db() -> None:
    """删除所有表（主要用于测试）"""
    current_engine = test_engine if settings.ENVIRONMENT == "testing" else engine
    
    async with current_engine.begin() as conn:
        # 删除所有表
        await conn.run_sync(Base.metadata.drop_all)
        logging.info("Database tables dropped successfully")


async def check_db_connection() -> bool:
    """检查数据库连接"""
    try:
        from sqlalchemy import text
        current_engine = test_engine if settings.ENVIRONMENT == "testing" else engine
        async with current_engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        logging.error(f"Database connection failed: {e}")
        return False


async def close_db_connections() -> None:
    """关闭数据库连接"""
    await engine.dispose()
    if test_engine:
        await test_engine.dispose()
    logging.info("Database connections closed")