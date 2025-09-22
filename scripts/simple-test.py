#!/usr/bin/env python3
"""
简单的后端测试脚本 - 不连接数据库
"""
import sys
import os
from unittest.mock import patch, AsyncMock

# 添加项目路径
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

def test_without_database():
    """测试不需要数据库的功能"""
    print("Testing FastAPI configuration...")
    
    # 设置测试环境变量
    os.environ["ENVIRONMENT"] = "testing"
    os.environ["DEBUG"] = "false"
    
    try:
        # Mock数据库连接函数
        with patch('app.db.database.check_db_connection', new_callable=AsyncMock) as mock_db_check:
            mock_db_check.return_value = True
            
            with patch('app.db.database.close_db_connections', new_callable=AsyncMock):
                from app.core.config import settings
                from app.core.exceptions import CustomHTTPException, ValidationError
                from app.core.middleware import LoggingMiddleware, SecurityHeadersMiddleware
                
                print("✓ Settings loaded successfully")
                print(f"  Project: {settings.PROJECT_NAME}")
                print(f"  Version: {settings.VERSION}")
                print(f"  Environment: {settings.ENVIRONMENT}")
                print(f"  Port: {settings.PORT}")
                
                print("✓ Exception classes imported successfully")
                print("✓ Middleware classes imported successfully")
                
                # 测试FastAPI应用创建（不启动生命周期）
                from fastapi import FastAPI
                from app.api.api_v1.api import api_router
                
                test_app = FastAPI(
                    title=settings.PROJECT_NAME,
                    version=settings.VERSION,
                    description="Test API",
                )
                
                # 添加路由
                test_app.include_router(api_router, prefix=settings.API_V1_STR)
                
                print("✓ FastAPI app created successfully")
                print(f"  Routes count: {len(test_app.routes)}")
                
                # 测试基础功能
                from fastapi.testclient import TestClient
                
                @test_app.get("/test")
                async def test_endpoint():
                    return {"message": "test", "version": settings.VERSION}
                
                with TestClient(test_app) as client:
                    response = client.get("/test")
                    assert response.status_code == 200
                    data = response.json()
                    assert data["message"] == "test"
                    assert data["version"] == settings.VERSION
                    
                print("✓ Test endpoint works correctly")
                
                print("\n" + "="*50)
                print("✓ All basic tests passed!")
                print("Backend configuration is working correctly")
                
    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    return True

if __name__ == "__main__":
    success = test_without_database()
    sys.exit(0 if success else 1)