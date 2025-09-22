# API连接错误排查指南

## 问题描述

前端调用后端API时出现网络错误，常见的错误信息包括：

- `AxiosError: Network Error`
- `API health check failed`  
- `Preflight response is not successful. Status code: 400`
- `XMLHttpRequest cannot load http://localhost:8100/health due to access control checks`

## 问题分析

### 1. CORS预检请求失败

**错误特征**：
- 浏览器控制台显示"Preflight response is not successful. Status code: 400"
- 网络面板显示OPTIONS请求返回400状态码
- 错误信息包含"access control checks"

**根本原因**：
前端发送的自定义请求头（如`X-Request-ID`）未在后端CORS配置的允许列表中。

### 2. 端口不匹配

**错误特征**：
- 连接被拒绝（Connection refused）
- 后端服务未在预期端口运行

**根本原因**：
前端配置的API_BASE_URL与后端实际运行端口不匹配。

## 解决方案

### 方案1：修复CORS配置

1. **检查CORS预检请求**：
   ```bash
   curl -X OPTIONS \
     -H "Origin: http://localhost:3100" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: X-Request-ID" \
     http://localhost:8100/health -v
   ```

2. **修改后端CORS配置**：
   在 `backend/app/main.py` 中添加缺失的请求头：
   ```python
   allow_headers=[
       "Authorization",
       "Content-Type", 
       "X-Requested-With",
       "Accept",
       "Origin",
       "User-Agent",
       "X-CSRF-Token",
       "X-Request-ID"  # 添加这一行
   ],
   ```

3. **重启后端服务**：
   ```bash
   cd backend
   python -m uvicorn app.main:app --reload --port 8100
   ```

### 方案2：验证端口配置

1. **检查后端运行状态**：
   ```bash
   ps aux | grep "uvicorn.*app.main" | grep -v grep
   lsof -i :8100
   ```

2. **验证API端点**：
   ```bash
   curl -v http://localhost:8100/health
   ```

3. **检查前端配置**：
   在 `frontend/src/lib/config.ts` 中确认：
   ```javascript
   API_BASE_URL: 'http://localhost:8100'
   ```

### 方案3：改进错误处理

1. **增强前端错误日志**：
   ```javascript
   catch (error: any) {
     console.error('API health check failed:', {
       message: error?.message || 'Unknown error',
       code: error?.code || 'UNKNOWN_ERROR',
       response: error?.response?.data,
       status: error?.response?.status,
       url: error?.config?.url,
       fullError: error
     })
   }
   ```

## 验证步骤

### 1. 测试CORS配置
```bash
# 测试预检请求
curl -X OPTIONS \
  -H "Origin: http://localhost:3100" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: X-Request-ID" \
  http://localhost:8100/health

# 应该返回200 OK和正确的CORS头部
```

### 2. 测试实际API调用
```bash
# 模拟前端请求
curl 'http://localhost:8100/health' \
  -H 'Origin: http://localhost:3100' \
  -H 'X-Request-ID: web-test-123'

# 应该返回健康检查结果
```

### 3. 验证前端连接
1. 打开浏览器开发者工具
2. 访问 http://localhost:3100
3. 查看Network面板，确认API请求成功
4. 查看Console面板，确认无CORS错误

## 常见问题

### Q: 为什么curl可以成功但浏览器失败？
A: 浏览器会执行CORS预检请求，而curl不会。需要确保OPTIONS请求也能成功。

### Q: 添加了X-Request-ID后还是报错？
A: 检查前端是否发送了其他自定义头部，确保所有头部都在CORS允许列表中。

### Q: 后端重启后配置没有生效？
A: 确保使用`--reload`参数启动后端，或者完全重启进程。

## 预防措施

1. **开发环境配置检查清单**：
   - [ ] 后端在正确端口运行
   - [ ] CORS配置包含所有必需头部  
   - [ ] 前端API配置指向正确地址
   - [ ] 浏览器控制台无CORS错误

2. **定期验证**：
   - 每次添加新的请求头时，更新CORS配置
   - 定期测试API连接健康状况
   - 监控浏览器控制台错误

3. **调试工具**：
   - 使用浏览器开发者工具检查网络请求
   - 使用curl测试API端点
   - 启用前端详细错误日志

## 相关文件

- `backend/app/main.py` - CORS中间件配置
- `backend/app/core/config.py` - CORS源配置
- `frontend/src/lib/config.ts` - API基础URL配置
- `frontend/src/lib/api.ts` - API客户端和错误处理
- `frontend/src/store/app-store.ts` - 应用状态和健康检查