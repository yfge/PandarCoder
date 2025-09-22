import pytest
import time
from httpx import AsyncClient
from unittest.mock import patch, AsyncMock

from app.main import app
from app.core.config import settings


class TestBasicEndpoints:
    """基础端点测试"""
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_root_endpoint(self, test_client: AsyncClient, test_assertions):
        """测试根端点"""
        response = await test_client.get("/")
        
        test_assertions.assert_response_success(response, 200)
        
        data = response.json()
        assert data["message"] == "Pandar Coder API"
        assert data["version"] == settings.VERSION
        assert data["environment"] == "testing"
        assert data["docs"] == "/docs"
        assert data["openapi"] == f"{settings.API_V1_STR}/openapi.json"
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_health_check_success(self, test_client: AsyncClient, test_assertions):
        """测试健康检查 - 成功情况"""
        response = await test_client.get("/health")
        
        test_assertions.assert_response_success(response, 200)
        
        data = response.json()
        assert data["status"] == "healthy"
        assert data["version"] == settings.VERSION
        test_assertions.assert_valid_timestamp(data["timestamp"])
        
        # 检查健康检查项
        assert "checks" in data
        assert "database" in data["checks"]
        assert "api" in data["checks"]
        assert data["checks"]["api"] == "healthy"
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_health_check_database_failure(self, test_client: AsyncClient):
        """测试健康检查 - 数据库故障情况"""
        # Mock数据库连接失败
        with patch("app.main.check_db_connection", new_callable=AsyncMock) as mock_check:
            mock_check.return_value = False
            response = await test_client.get("/health")
            assert response.status_code == 503
            data = response.json()
            assert data["status"] == "degraded"
            assert data["checks"]["database"] == "unhealthy"
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_readiness_check(self, test_client: AsyncClient, test_assertions):
        """测试就绪检查"""
        response = await test_client.get("/health/ready")
        
        test_assertions.assert_response_success(response, 200)
        
        data = response.json()
        assert data["status"] == "ready"
        test_assertions.assert_valid_timestamp(data["timestamp"])
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_liveness_check(self, test_client: AsyncClient, test_assertions):
        """测试存活检查"""
        response = await test_client.get("/health/live")
        
        test_assertions.assert_response_success(response, 200)
        
        data = response.json()
        assert data["status"] == "alive"
        test_assertions.assert_valid_timestamp(data["timestamp"])


class TestMiddleware:
    """中间件测试"""
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_cors_headers(self, test_client: AsyncClient):
        """测试CORS头"""
        response = await test_client.options(
            "/",
            headers={
                "Origin": "http://localhost:3100",
                "Access-Control-Request-Method": "GET"
            }
        )
        
        assert response.status_code == 200
        assert "Access-Control-Allow-Origin" in response.headers
        assert "Access-Control-Allow-Methods" in response.headers
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_security_headers(self, test_client: AsyncClient):
        """测试安全头"""
        response = await test_client.get("/")
        
        # 检查安全头
        assert response.headers.get("X-Content-Type-Options") == "nosniff"
        assert response.headers.get("X-Frame-Options") == "DENY"
        assert response.headers.get("X-XSS-Protection") == "1; mode=block"
        assert "Referrer-Policy" in response.headers
        assert "Content-Security-Policy" in response.headers
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_request_id_header(self, test_client: AsyncClient):
        """测试请求ID头"""
        response = await test_client.get("/")
        
        assert "X-Request-ID" in response.headers
        assert "X-Process-Time" in response.headers
        
        # 验证请求ID格式（UUID）
        import uuid
        request_id = response.headers["X-Request-ID"]
        uuid.UUID(request_id)  # 如果不是有效UUID会抛出异常
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_rate_limiting(self, test_client: AsyncClient):
        """测试限流"""
        # 发送多个请求
        responses = []
        for i in range(5):
            response = await test_client.get("/")
            responses.append(response)
        
        # 检查限流头
        last_response = responses[-1]
        assert "X-RateLimit-Limit" in last_response.headers
        assert "X-RateLimit-Remaining" in last_response.headers
        assert "X-RateLimit-Reset" in last_response.headers


class TestErrorHandling:
    """错误处理测试"""
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_404_not_found(self, test_client: AsyncClient, test_assertions):
        """测试404错误"""
        response = await test_client.get("/non-existent-endpoint")
        
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_method_not_allowed(self, test_client: AsyncClient):
        """测试405错误"""
        response = await test_client.delete("/")
        
        assert response.status_code == 405
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_validation_error_format(self, test_client: AsyncClient):
        """测试验证错误格式"""
        # 发送无效JSON
        response = await test_client.post(
            "/api/v1/auth/register",  # 这个端点还不存在，但用于测试
            json={"invalid": "data"}
        )
        
        # 应该返回验证错误或404（端点不存在）
        assert response.status_code in [422, 404]


class TestPerformance:
    """性能测试"""
    
    @pytest.mark.performance
    @pytest.mark.asyncio
    async def test_root_endpoint_performance(self, test_client: AsyncClient):
        """测试根端点性能"""
        import time
        
        start_time = time.time()
        response = await test_client.get("/")
        end_time = time.time()
        
        assert response.status_code == 200
        assert (end_time - start_time) < 0.1  # 应该在100ms内响应
    
    @pytest.mark.performance
    @pytest.mark.asyncio
    async def test_health_check_performance(self, test_client: AsyncClient):
        """测试健康检查性能"""
        import time
        
        start_time = time.time()
        response = await test_client.get("/health")
        end_time = time.time()
        
        assert response.status_code in [200, 503]
        assert (end_time - start_time) < 0.5  # 应该在500ms内响应
    
    @pytest.mark.performance
    @pytest.mark.asyncio
    async def test_concurrent_requests(self, test_client: AsyncClient):
        """测试并发请求"""
        import asyncio
        
        async def make_request():
            response = await test_client.get("/")
            return response.status_code
        
        # 并发发送10个请求
        tasks = [make_request() for _ in range(10)]
        results = await asyncio.gather(*tasks)
        
        # 所有请求都应该成功
        assert all(status == 200 for status in results)


class TestDocumentation:
    """文档测试"""
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_openapi_spec(self, test_client: AsyncClient):
        """测试OpenAPI规范"""
        response = await test_client.get(f"{settings.API_V1_STR}/openapi.json")
        
        assert response.status_code == 200
        
        spec = response.json()
        assert "openapi" in spec
        assert "info" in spec
        assert spec["info"]["title"] == settings.PROJECT_NAME
        assert spec["info"]["version"] == settings.VERSION
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_swagger_docs(self, test_client: AsyncClient):
        """测试Swagger文档页面"""
        response = await test_client.get("/docs")
        
        assert response.status_code == 200
        assert "text/html" in response.headers.get("content-type", "")
