#!/usr/bin/env python3
"""
简单的后端测试脚本
不依赖数据库，测试基本API功能
"""
import asyncio
import sys
import os

# 添加项目路径
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

from fastapi.testclient import TestClient

def test_basic_endpoints():
    """测试基础端点（不需要数据库）"""
    try:
        # 设置测试环境变量
        os.environ["ENVIRONMENT"] = "testing"
        os.environ["DATABASE_URL"] = "sqlite:///./test.db"  # 使用SQLite避免MySQL连接问题
        
        from app.main import app
        
        with TestClient(app) as client:
            # 测试根端点
            print("Testing root endpoint...")
            response = client.get("/")
            print(f"Root endpoint status: {response.status_code}")
            if response.status_code == 200:
                print("✓ Root endpoint works")
                data = response.json()
                print(f"  Message: {data.get('message')}")
                print(f"  Version: {data.get('version')}")
            else:
                print("✗ Root endpoint failed")
                print(f"  Response: {response.text}")
            
            # 测试OpenAPI文档
            print("\nTesting OpenAPI spec...")
            response = client.get("/api/v1/openapi.json")
            print(f"OpenAPI spec status: {response.status_code}")
            if response.status_code == 200:
                print("✓ OpenAPI spec accessible")
                spec = response.json()
                print(f"  API Title: {spec.get('info', {}).get('title')}")
                print(f"  API Version: {spec.get('info', {}).get('version')}")
            else:
                print("✗ OpenAPI spec failed")
            
            # 测试文档页面
            print("\nTesting docs page...")
            response = client.get("/docs")
            print(f"Docs page status: {response.status_code}")
            if response.status_code == 200:
                print("✓ Swagger docs accessible")
            else:
                print("✗ Swagger docs failed")
            
            print("\n" + "="*50)
            print("Basic API tests completed!")
            
    except Exception as e:
        print(f"Error running tests: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_basic_endpoints()