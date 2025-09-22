import asyncio
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool
from typing import AsyncGenerator
import logging
import os
from unittest.mock import patch

from app.main import app
from app.db.database import Base, get_db
from app.core.config import settings


# 设置测试环境
os.environ["ENVIRONMENT"] = "testing"
os.environ["DEBUG"] = "false"
os.environ["LOG_LEVEL"] = "WARNING"

# 测试数据库URL
TEST_DATABASE_URL = "mysql+aiomysql://root:Pa88word@127.0.0.1:13307/claude_web_test"


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    """Create test database engine."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,  # 测试时关闭SQL日志
        poolclass=NullPool,  # 避免连接池问题
        future=True,
    )
    
    # 创建测试数据库（如果不存在）
    try:
        # 创建所有表
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logging.info("Test database tables created successfully")
    except Exception as e:
        logging.error(f"Failed to create test database: {e}")
        raise
    
    yield engine
    
    # 清理测试数据库
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        logging.info("Test database tables dropped successfully")
    except Exception as e:
        logging.error(f"Failed to cleanup test database: {e}")
    finally:
        await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def test_db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create test database session with transaction rollback."""
    async_session_maker = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=True,
        autocommit=False,
    )
    
    async with async_session_maker() as session:
        # 开始事务
        transaction = await session.begin()
        
        try:
            yield session
        finally:
            # 回滚事务，确保测试之间互不影响
            await transaction.rollback()
            await session.close()


@pytest_asyncio.fixture(scope="function")
async def test_client(test_db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Create test HTTP client with database session override."""
    
    async def override_get_db():
        yield test_db_session
    
    # 覆盖数据库依赖
    app.dependency_overrides[get_db] = override_get_db
    
    async with AsyncClient(
        app=app,
        base_url="http://testserver",
        timeout=30.0  # 增加超时时间
    ) as client:
        yield client
    
    # 清理依赖覆盖
    app.dependency_overrides.clear()


@pytest.fixture
def mock_settings():
    """Mock settings for testing."""
    with patch.object(settings, "SECRET_KEY", "test-secret-key"):
        with patch.object(settings, "ACCESS_TOKEN_EXPIRE_MINUTES", 30):
            with patch.object(settings, "ENVIRONMENT", "testing"):
                yield settings


@pytest_asyncio.fixture
async def authenticated_client(test_client: AsyncClient) -> AsyncGenerator[tuple[AsyncClient, dict], None]:
    """Create authenticated test client with user token."""
    # 这里会在后续实现用户认证后完善
    # 现在只返回基础客户端
    user_data = {
        "id": "test-user-id",
        "email": "test@example.com",
        "is_active": True
    }
    yield test_client, user_data


class TestDatabase:
    """测试数据库辅助工具类"""
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def create_test_user(self, **kwargs):
        """创建测试用户 - 将在实现用户模型后完善"""
        pass
    
    async def create_test_project(self, **kwargs):
        """创建测试项目 - 将在实现项目模型后完善"""
        pass
    
    async def cleanup_test_data(self):
        """清理测试数据"""
        # 这里会在后续实现具体的清理逻辑
        pass


@pytest_asyncio.fixture
async def test_db(test_db_session: AsyncSession) -> TestDatabase:
    """Create test database helper."""
    return TestDatabase(test_db_session)


# 性能测试装饰器
def performance_test(max_time: float = 1.0):
    """性能测试装饰器"""
    def decorator(func):
        @pytest.mark.asyncio
        async def wrapper(*args, **kwargs):
            import time
            start_time = time.time()
            result = await func(*args, **kwargs)
            end_time = time.time()
            execution_time = end_time - start_time
            
            assert execution_time <= max_time, f"Test took {execution_time:.3f}s, expected <= {max_time}s"
            return result
        
        return wrapper
    return decorator


# 跳过条件
@pytest.fixture
def skip_if_no_database():
    """如果没有数据库连接则跳过测试"""
    try:
        import aiomysql
        # 这里可以添加数据库连接检查逻辑
        return False
    except ImportError:
        return True


# 标记定义
pytest.mark.unit = pytest.mark.unit  # 单元测试
pytest.mark.integration = pytest.mark.integration  # 集成测试
pytest.mark.e2e = pytest.mark.e2e  # 端到端测试
pytest.mark.performance = pytest.mark.performance  # 性能测试
pytest.mark.slow = pytest.mark.slow  # 慢速测试

# 自定义断言辅助函数
class TestAssertions:
    """测试断言辅助类"""
    
    @staticmethod
    def assert_response_success(response, expected_status=200):
        """断言响应成功"""
        assert response.status_code == expected_status, f"Expected {expected_status}, got {response.status_code}: {response.text}"
    
    @staticmethod  
    def assert_response_error(response, expected_status, expected_error_code=None):
        """断言响应错误"""
        assert response.status_code == expected_status
        if expected_error_code:
            error_data = response.json()
            assert "error" in error_data
            assert error_data["error"]["code"] == expected_error_code
    
    @staticmethod
    def assert_valid_timestamp(timestamp):
        """断言有效的时间戳"""
        import time
        current_time = time.time()
        # 允许5分钟的时差
        assert abs(timestamp - current_time) <= 300
    
    @staticmethod
    def assert_valid_uuid(uuid_str):
        """断言有效的UUID"""
        import uuid
        try:
            uuid.UUID(uuid_str)
        except ValueError:
            assert False, f"Invalid UUID: {uuid_str}"


@pytest.fixture
def test_assertions():
    """提供测试断言辅助"""
    return TestAssertions()