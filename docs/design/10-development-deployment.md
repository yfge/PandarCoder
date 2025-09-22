# 设计文档 10: 开发和部署策略

## 概述

本文档制定了Claude Web应用的完整开发流程、部署策略和运维方案，确保项目从开发到生产的全生命周期管理。

## 目录
1. [开发环境配置](#开发环境配置)
2. [开发流程和规范](#开发流程和规范)
3. [CI/CD管道设计](#cicd管道设计)
4. [容器化部署](#容器化部署)
5. [云原生架构](#云原生架构)
6. [监控和日志](#监控和日志)
7. [备份和恢复](#备份和恢复)
8. [扩容和负载均衡](#扩容和负载均衡)
9. [安全和合规](#安全和合规)

## 开发环境配置

### 本地开发环境

```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  # 后端API服务
  api:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    ports:
      - "8000:8000"
    volumes:
      - ./backend:/app
      - /app/__pycache__
      - /app/.pytest_cache
    environment:
      - DEBUG=true
      - DATABASE_URL=mysql+aiomysql://root:Pa88word@db:3306/claude_web
      - REDIS_URL=redis://redis:6379/0
      - CLAUDE_API_KEY=${CLAUDE_API_KEY}
    depends_on:
      - db
      - redis
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  # 前端开发服务器
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    volumes:
      - ./frontend:/app
      - /app/node_modules
      - /app/.next
    environment:
      - NODE_ENV=development
      - NEXT_PUBLIC_API_URL=http://localhost:8000
    command: npm run dev

  # 数据库
  db:
    image: mysql:8.0
    ports:
      - "13306:3306"
    environment:
      - MYSQL_ROOT_PASSWORD=Pa88word
      - MYSQL_DATABASE=claude_web
      - MYSQL_USER=claude
      - MYSQL_PASSWORD=claude123
    volumes:
      - mysql_data:/var/lib/mysql
      - ./database/init:/docker-entrypoint-initdb.d
    command: --default-authentication-plugin=mysql_native_password

  # Redis缓存
  redis:
    image: redis:7-alpine
    ports:
      - "16379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

  # Celery任务队列
  celery:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    volumes:
      - ./backend:/app
    environment:
      - DATABASE_URL=mysql+aiomysql://root:Pa88word@db:3306/claude_web
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      - db
      - redis
    command: celery -A app.tasks.celery worker --loglevel=info

  # Flower监控
  flower:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    ports:
      - "5555:5555"
    volumes:
      - ./backend:/app
    environment:
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      - redis
    command: celery -A app.tasks.celery flower --port=5555

volumes:
  mysql_data:
  redis_data:
```

### IDE和开发工具配置

```json
// .vscode/settings.json
{
  "python.defaultInterpreterPath": "./backend/venv/bin/python",
  "python.linting.enabled": true,
  "python.linting.pylintEnabled": false,
  "python.linting.flake8Enabled": true,
  "python.formatting.provider": "black",
  "python.sortImports.args": ["--profile", "black"],
  
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true,
    "source.organizeImports": true
  },
  
  "files.associations": {
    "*.css": "tailwindcss"
  },
  
  "tailwindCSS.includeLanguages": {
    "typescript": "javascript",
    "typescriptreact": "javascript"
  }
}

// .vscode/extensions.json
{
  "recommendations": [
    "ms-python.python",
    "ms-python.black-formatter",
    "ms-python.flake8",
    "bradlc.vscode-tailwindcss",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-typescript-next",
    "ms-vscode-remote.remote-containers"
  ]
}
```

### 环境变量管理

```bash
# scripts/env-setup.sh
#!/bin/bash

# 创建环境变量文件
create_env_file() {
    local env_file=$1
    local template_file="${env_file}.template"
    
    if [ ! -f "$env_file" ] && [ -f "$template_file" ]; then
        echo "Creating $env_file from template..."
        cp "$template_file" "$env_file"
        echo "Please update the values in $env_file"
    fi
}

# 验证必需的环境变量
validate_env() {
    local required_vars=(
        "DATABASE_URL"
        "REDIS_URL"
        "SECRET_KEY"
        "CLAUDE_API_KEY"
    )
    
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            echo "Error: $var is not set"
            exit 1
        fi
    done
    
    echo "All required environment variables are set"
}

# 生成开发环境配置
generate_dev_config() {
    cat > .env.development << EOF
# Database
DATABASE_URL=mysql+aiomysql://root:Pa88word@localhost:13306/claude_web
REDIS_URL=redis://localhost:16379/0

# API Keys
CLAUDE_API_KEY=your_claude_api_key_here
SECRET_KEY=$(openssl rand -hex 32)

# Development Settings
DEBUG=true
LOG_LEVEL=DEBUG
ALLOWED_HOSTS=localhost,127.0.0.1

# External Services
FEISHU_APP_ID=your_feishu_app_id
FEISHU_APP_SECRET=your_feishu_app_secret
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password
EOF
}

main() {
    echo "Setting up development environment..."
    
    # 创建环境变量文件
    create_env_file ".env.development"
    create_env_file ".env.testing" 
    create_env_file ".env.production"
    
    # 生成默认配置
    if [ "$1" == "--generate" ]; then
        generate_dev_config
        echo "Generated .env.development with default values"
        echo "Please update the API keys and secrets"
    fi
    
    # 验证环境变量
    if [ "$1" == "--validate" ]; then
        source .env.development
        validate_env
    fi
}

main "$@"
```

## 开发流程和规范

### Git工作流

```yaml
# .github/workflows/branch-protection.yml
name: Branch Protection

on:
  pull_request:
    branches: [ main, develop ]

jobs:
  enforce-workflow:
    runs-on: ubuntu-latest
    steps:
      - name: Check PR title
        uses: amannn/action-semantic-pull-request@v4
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          types: |
            feat
            fix
            docs
            style
            refactor
            test
            chore
          
      - name: Check branch naming
        run: |
          branch_name="${{ github.head_ref }}"
          if [[ ! $branch_name =~ ^(feature|bugfix|hotfix|release)\/[a-z0-9-]+$ ]]; then
            echo "Branch name '$branch_name' does not follow naming convention"
            echo "Expected: feature/description, bugfix/description, hotfix/description, or release/version"
            exit 1
          fi
```

### 代码质量检查

```yaml
# .github/workflows/code-quality.yml
name: Code Quality

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  backend-quality:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./backend
        
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.11'
        
    - name: Install dependencies
      run: |
        python -m pip install --upgrade pip
        pip install -r requirements.txt
        pip install -r requirements-dev.txt
        
    - name: Run type checking
      run: mypy app/
      
    - name: Run linting
      run: |
        flake8 app/
        black --check app/
        isort --check-only app/
        
    - name: Run security checks
      run: |
        bandit -r app/
        safety check
        
    - name: Run tests
      run: |
        pytest --cov=app --cov-report=xml --cov-report=html
        
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        file: ./backend/coverage.xml
        flags: backend

  frontend-quality:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./frontend
        
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
        cache-dependency-path: './frontend/package-lock.json'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run type checking
      run: npm run type-check
      
    - name: Run linting
      run: |
        npm run lint
        npm run lint:styles
        
    - name: Run tests
      run: npm run test:coverage
      
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        file: ./frontend/coverage/lcov.info
        flags: frontend
        
    - name: Build application
      run: npm run build
```

### 自动化测试策略

```python
# backend/tests/conftest.py
import asyncio
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from testcontainers.mysql import MySqlContainer
from testcontainers.redis import RedisContainer

from app.main import app
from app.core.config import settings
from app.db.database import get_db
from app.models.base import Base

# 测试容器
mysql_container = None
redis_container = None

@pytest.fixture(scope="session", autouse=True)
def setup_test_containers():
    """设置测试容器"""
    global mysql_container, redis_container
    
    # 启动MySQL容器
    mysql_container = MySqlContainer("mysql:8.0")
    mysql_container.start()
    
    # 启动Redis容器  
    redis_container = RedisContainer("redis:7-alpine")
    redis_container.start()
    
    # 更新测试配置
    settings.DATABASE_URL = mysql_container.get_connection_url().replace(
        "pymysql", "aiomysql"
    )
    settings.REDIS_URL = redis_container.get_connection_url()
    
    yield
    
    # 清理容器
    mysql_container.stop()
    redis_container.stop()

@pytest_asyncio.fixture
async def async_client():
    """异步HTTP客户端"""
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client

@pytest_asyncio.fixture
async def db_session():
    """数据库会话"""
    engine = create_engine(settings.DATABASE_URL_SYNC)
    Base.metadata.create_all(engine)
    
    SessionLocal = sessionmaker(engine)
    session = SessionLocal()
    
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)

# backend/tests/test_integration.py
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_full_project_workflow(async_client: AsyncClient):
    """测试完整的项目工作流"""
    
    # 1. 用户注册
    register_response = await async_client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "testpass123",
        "full_name": "Test User"
    })
    assert register_response.status_code == 201
    
    # 2. 用户登录
    login_response = await async_client.post("/api/v1/auth/login", json={
        "email": "test@example.com",
        "password": "testpass123"
    })
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]
    
    # 3. 创建项目
    headers = {"Authorization": f"Bearer {token}"}
    project_response = await async_client.post("/api/v1/projects/", 
        headers=headers,
        json={
            "name": "Test Project",
            "description": "A test project",
            "git_url": "https://github.com/test/repo.git"
        }
    )
    assert project_response.status_code == 201
    project_id = project_response.json()["id"]
    
    # 4. 执行任务
    task_response = await async_client.post(f"/api/v1/projects/{project_id}/tasks/",
        headers=headers,
        json={
            "command": "ls -la",
            "description": "List files"
        }
    )
    assert task_response.status_code == 201
    
    # 5. 检查任务状态
    task_id = task_response.json()["id"]
    status_response = await async_client.get(f"/api/v1/tasks/{task_id}/status",
        headers=headers
    )
    assert status_response.status_code == 200
```

## CI/CD管道设计

### GitHub Actions工作流

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    tags:
      - 'v*'

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  test:
    uses: ./.github/workflows/code-quality.yml

  build:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    outputs:
      image-tag: ${{ steps.meta.outputs.tags }}
      image-digest: ${{ steps.build.outputs.digest }}

    steps:
    - name: Checkout
      uses: actions/checkout@v3

    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v2

    - name: Login to Container Registry
      uses: docker/login-action@v2
      with:
        registry: ${{ env.REGISTRY }}
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}

    - name: Extract metadata
      id: meta
      uses: docker/metadata-action@v4
      with:
        images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
        tags: |
          type=ref,event=branch
          type=ref,event=pr
          type=semver,pattern={{version}}
          type=semver,pattern={{major}}.{{minor}}

    - name: Build and push backend
      id: build-backend
      uses: docker/build-push-action@v4
      with:
        context: ./backend
        file: ./backend/Dockerfile.prod
        push: true
        tags: ${{ steps.meta.outputs.tags }}-backend
        labels: ${{ steps.meta.outputs.labels }}
        cache-from: type=gha
        cache-to: type=gha,mode=max

    - name: Build and push frontend
      id: build-frontend
      uses: docker/build-push-action@v4
      with:
        context: ./frontend
        file: ./frontend/Dockerfile.prod
        push: true
        tags: ${{ steps.meta.outputs.tags }}-frontend
        labels: ${{ steps.meta.outputs.labels }}
        cache-from: type=gha
        cache-to: type=gha,mode=max

  security-scan:
    needs: build
    runs-on: ubuntu-latest
    steps:
    - name: Run Trivy vulnerability scanner
      uses: aquasecurity/trivy-action@master
      with:
        image-ref: ${{ needs.build.outputs.image-tag }}-backend
        format: 'sarif'
        output: 'trivy-results.sarif'

    - name: Upload Trivy scan results
      uses: github/codeql-action/upload-sarif@v2
      with:
        sarif_file: 'trivy-results.sarif'

  deploy:
    needs: [build, security-scan]
    runs-on: ubuntu-latest
    environment: production
    
    steps:
    - name: Checkout
      uses: actions/checkout@v3

    - name: Configure kubectl
      run: |
        mkdir -p $HOME/.kube
        echo "${{ secrets.KUBE_CONFIG }}" | base64 -d > $HOME/.kube/config

    - name: Deploy to Kubernetes
      run: |
        # 更新镜像标签
        sed -i "s|IMAGE_TAG|${{ needs.build.outputs.image-tag }}|g" k8s/production/*.yaml
        
        # 应用配置
        kubectl apply -f k8s/production/
        
        # 等待部署完成
        kubectl rollout status deployment/claude-web-backend -n claude-web
        kubectl rollout status deployment/claude-web-frontend -n claude-web

    - name: Run smoke tests
      run: |
        kubectl run smoke-test --image=curlimages/curl:latest --rm -i --restart=Never -- \
          curl -f http://claude-web-frontend.claude-web.svc.cluster.local/health
```

### 多环境部署流程

```bash
# scripts/deploy.sh
#!/bin/bash

set -e

ENVIRONMENT=${1:-development}
VERSION=${2:-latest}
NAMESPACE="claude-web-${ENVIRONMENT}"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 验证环境
validate_environment() {
    log_info "Validating environment: $ENVIRONMENT"
    
    if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
        log_error "Invalid environment. Must be: development, staging, or production"
        exit 1
    fi
    
    # 检查kubectl配置
    if ! kubectl cluster-info &> /dev/null; then
        log_error "kubectl is not configured or cluster is unreachable"
        exit 1
    fi
    
    # 检查命名空间
    if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
        log_warn "Namespace $NAMESPACE does not exist, creating..."
        kubectl create namespace "$NAMESPACE"
    fi
}

# 部署数据库迁移
deploy_migrations() {
    log_info "Running database migrations..."
    
    kubectl create job "migration-$(date +%s)" \
        --image="ghcr.io/your-org/claude-web:${VERSION}-backend" \
        --namespace="$NAMESPACE" \
        -- alembic upgrade head
    
    # 等待迁移完成
    kubectl wait --for=condition=complete --timeout=300s \
        job/migration-* -n "$NAMESPACE"
}

# 部署应用
deploy_application() {
    log_info "Deploying application version: $VERSION"
    
    # 替换模板中的变量
    envsubst < "k8s/$ENVIRONMENT/backend.yaml" | kubectl apply -f -
    envsubst < "k8s/$ENVIRONMENT/frontend.yaml" | kubectl apply -f -
    envsubst < "k8s/$ENVIRONMENT/nginx.yaml" | kubectl apply -f -
    
    # 等待部署完成
    log_info "Waiting for deployments to be ready..."
    kubectl rollout status deployment/backend -n "$NAMESPACE" --timeout=600s
    kubectl rollout status deployment/frontend -n "$NAMESPACE" --timeout=600s
    kubectl rollout status deployment/nginx -n "$NAMESPACE" --timeout=300s
}

# 健康检查
health_check() {
    log_info "Performing health checks..."
    
    # 获取服务端点
    BACKEND_URL=$(kubectl get service backend -n "$NAMESPACE" -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
    FRONTEND_URL=$(kubectl get service nginx -n "$NAMESPACE" -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
    
    # 检查后端健康
    for i in {1..30}; do
        if curl -f "http://$BACKEND_URL/health" &> /dev/null; then
            log_info "Backend health check passed"
            break
        fi
        if [ $i -eq 30 ]; then
            log_error "Backend health check failed after 30 attempts"
            exit 1
        fi
        sleep 10
    done
    
    # 检查前端健康
    for i in {1..30}; do
        if curl -f "http://$FRONTEND_URL/health" &> /dev/null; then
            log_info "Frontend health check passed"
            break
        fi
        if [ $i -eq 30 ]; then
            log_error "Frontend health check failed after 30 attempts"
            exit 1
        fi
        sleep 10
    done
}

# 回滚功能
rollback() {
    local deployment=$1
    log_warn "Rolling back $deployment..."
    kubectl rollout undo deployment/"$deployment" -n "$NAMESPACE"
    kubectl rollout status deployment/"$deployment" -n "$NAMESPACE"
}

# 主部署流程
main() {
    log_info "Starting deployment to $ENVIRONMENT..."
    
    validate_environment
    
    # 设置环境变量
    export ENVIRONMENT VERSION NAMESPACE
    export IMAGE_TAG="ghcr.io/your-org/claude-web:${VERSION}"
    
    # 部署步骤
    deploy_migrations
    deploy_application
    health_check
    
    log_info "Deployment completed successfully!"
    log_info "Backend URL: http://$(kubectl get service backend -n "$NAMESPACE" -o jsonpath='{.status.loadBalancer.ingress[0].ip}')"
    log_info "Frontend URL: http://$(kubectl get service nginx -n "$NAMESPACE" -o jsonpath='{.status.loadBalancer.ingress[0].ip}')"
}

# 错误处理
trap 'log_error "Deployment failed! Check the logs above."; exit 1' ERR

# 执行部署
main "$@"
```

## 容器化部署

### 生产环境Dockerfile

```dockerfile
# backend/Dockerfile.prod
FROM python:3.11-slim as builder

# 安装构建依赖
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libffi-dev \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# 创建虚拟环境
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# 安装Python依赖
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# 生产阶段
FROM python:3.11-slim

# 创建应用用户
RUN groupadd -r appuser && useradd -r -g appuser appuser

# 安装运行时依赖
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 复制虚拟环境
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# 设置工作目录
WORKDIR /app

# 复制应用代码
COPY --chown=appuser:appuser . /app

# 切换到应用用户
USER appuser

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# 启动命令
CMD ["gunicorn", "app.main:app", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000"]
```

```dockerfile
# frontend/Dockerfile.prod
FROM node:18-alpine as builder

WORKDIR /app

# 复制依赖文件
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# 复制源代码
COPY . .

# 构建应用
ENV NODE_ENV=production
RUN npm run build

# 生产阶段
FROM node:18-alpine

# 创建应用用户
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

WORKDIR /app

# 复制构建产物
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 切换到应用用户
USER nextjs

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# 启动命令
CMD ["node", "server.js"]
```

### Kubernetes配置

```yaml
# k8s/production/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: claude-web
  labels:
    name: claude-web
    environment: production

---
# k8s/production/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: claude-web-config
  namespace: claude-web
data:
  ENVIRONMENT: "production"
  LOG_LEVEL: "INFO"
  ALLOWED_HOSTS: "claude-web.example.com,api.claude-web.example.com"
  CORS_ORIGINS: "https://claude-web.example.com"
  
---
# k8s/production/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: claude-web-secrets
  namespace: claude-web
type: Opaque
stringData:
  DATABASE_URL: "mysql+aiomysql://username:password@mysql:3306/claude_web"
  REDIS_URL: "redis://redis:6379/0"
  SECRET_KEY: "your-secret-key"
  CLAUDE_API_KEY: "your-claude-api-key"
  JWT_SECRET: "your-jwt-secret"

---
# k8s/production/backend.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: claude-web
  labels:
    app: claude-web-backend
    version: v1
spec:
  replicas: 3
  selector:
    matchLabels:
      app: claude-web-backend
  template:
    metadata:
      labels:
        app: claude-web-backend
        version: v1
    spec:
      serviceAccountName: claude-web
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
      containers:
      - name: backend
        image: ghcr.io/your-org/claude-web:${IMAGE_TAG}-backend
        ports:
        - containerPort: 8000
          name: http
        envFrom:
        - configMapRef:
            name: claude-web-config
        - secretRef:
            name: claude-web-secrets
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 8000
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
        securityContext:
          allowPrivilegeEscalation: false
          capabilities:
            drop: ["ALL"]
          readOnlyRootFilesystem: true

---
apiVersion: v1
kind: Service
metadata:
  name: backend
  namespace: claude-web
spec:
  selector:
    app: claude-web-backend
  ports:
  - port: 8000
    targetPort: 8000
    name: http
  type: ClusterIP

---
# k8s/production/frontend.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: claude-web
spec:
  replicas: 2
  selector:
    matchLabels:
      app: claude-web-frontend
  template:
    metadata:
      labels:
        app: claude-web-frontend
    spec:
      containers:
      - name: frontend
        image: ghcr.io/your-org/claude-web:${IMAGE_TAG}-frontend
        ports:
        - containerPort: 3000
        env:
        - name: NEXT_PUBLIC_API_URL
          value: "https://api.claude-web.example.com"
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "250m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5

---
apiVersion: v1
kind: Service
metadata:
  name: frontend
  namespace: claude-web
spec:
  selector:
    app: claude-web-frontend
  ports:
  - port: 3000
    targetPort: 3000
  type: ClusterIP
```

## 云原生架构

### Helm Chart配置

```yaml
# helm/claude-web/Chart.yaml
apiVersion: v2
name: claude-web
description: A Helm chart for Claude Web application
version: 0.1.0
appVersion: "1.0.0"
dependencies:
- name: mysql
  version: "9.4.1"
  repository: "https://charts.bitnami.com/bitnami"
  condition: mysql.enabled
- name: redis
  version: "17.3.7"
  repository: "https://charts.bitnami.com/bitnami"
  condition: redis.enabled

---
# helm/claude-web/values.yaml
# 默认值
global:
  imageRegistry: "ghcr.io"
  imagePullSecrets: []

replicaCount:
  backend: 3
  frontend: 2
  celery: 2

image:
  repository: your-org/claude-web
  pullPolicy: IfNotPresent
  tag: "latest"

service:
  type: ClusterIP
  backend:
    port: 8000
  frontend:
    port: 3000

ingress:
  enabled: true
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
  hosts:
    - host: claude-web.example.com
      paths:
        - path: /
          pathType: Prefix
          service: frontend
        - path: /api
          pathType: Prefix
          service: backend
  tls:
    - secretName: claude-web-tls
      hosts:
        - claude-web.example.com

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80

resources:
  backend:
    limits:
      cpu: 1000m
      memory: 1Gi
    requests:
      cpu: 250m
      memory: 512Mi
  frontend:
    limits:
      cpu: 500m
      memory: 512Mi
    requests:
      cpu: 100m
      memory: 256Mi

# 外部依赖
mysql:
  enabled: true
  auth:
    rootPassword: "secure-password"
    database: "claude_web"
    username: "claude"
    password: "claude-password"
  primary:
    persistence:
      enabled: true
      size: 20Gi

redis:
  enabled: true
  auth:
    enabled: false
  master:
    persistence:
      enabled: true
      size: 5Gi

# 监控配置
monitoring:
  enabled: true
  serviceMonitor:
    enabled: true
    interval: 30s
  grafana:
    dashboards:
      enabled: true

# 备份配置
backup:
  enabled: true
  schedule: "0 2 * * *"
  retention: 7
  storage:
    type: s3
    bucket: claude-web-backups
    region: us-east-1
```

### 服务网格配置

```yaml
# k8s/istio/virtual-service.yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: claude-web
  namespace: claude-web
spec:
  hosts:
  - claude-web.example.com
  gateways:
  - claude-web-gateway
  http:
  # API路由
  - match:
    - uri:
        prefix: /api/
    route:
    - destination:
        host: backend
        port:
          number: 8000
    timeout: 30s
    retries:
      attempts: 3
      perTryTimeout: 10s
  # 前端路由
  - match:
    - uri:
        prefix: /
    route:
    - destination:
        host: frontend
        port:
          number: 3000
    timeout: 15s

---
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: claude-web-backend
  namespace: claude-web
spec:
  host: backend
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 100
      http:
        http1MaxPendingRequests: 50
        maxRequestsPerConnection: 5
    loadBalancer:
      simple: LEAST_CONN
    outlierDetection:
      consecutive5xxErrors: 3
      interval: 30s
      baseEjectionTime: 30s
      maxEjectionPercent: 50

---
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: claude-web-policy
  namespace: claude-web
spec:
  selector:
    matchLabels:
      app: claude-web-backend
  rules:
  - from:
    - source:
        principals: ["cluster.local/ns/claude-web/sa/frontend"]
  - to:
    - operation:
        methods: ["GET", "POST", "PUT", "DELETE"]
    - operation:
        paths: ["/api/*"]
```

## 监控和日志

### Prometheus监控配置

```yaml
# k8s/monitoring/prometheus.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: claude-web-backend
  namespace: claude-web
spec:
  selector:
    matchLabels:
      app: claude-web-backend
  endpoints:
  - port: http
    path: /metrics
    interval: 30s
    scrapeTimeout: 10s

---
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: claude-web-alerts
  namespace: claude-web
spec:
  groups:
  - name: claude-web
    rules:
    - alert: HighErrorRate
      expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
      for: 2m
      labels:
        severity: warning
      annotations:
        summary: "High error rate detected"
        description: "Error rate is above 10% for 2 minutes"
    
    - alert: HighLatency
      expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "High latency detected"
        description: "95th percentile latency is above 1s"
    
    - alert: ServiceDown
      expr: up{job="claude-web-backend"} == 0
      for: 1m
      labels:
        severity: critical
      annotations:
        summary: "Service is down"
        description: "Claude Web backend service is not responding"
```

### 日志收集配置

```yaml
# k8s/logging/fluentd.yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluentd
  namespace: kube-system
spec:
  selector:
    matchLabels:
      name: fluentd
  template:
    metadata:
      labels:
        name: fluentd
    spec:
      serviceAccount: fluentd
      containers:
      - name: fluentd
        image: fluent/fluentd-kubernetes-daemonset:v1-debian-elasticsearch
        env:
        - name: FLUENT_ELASTICSEARCH_HOST
          value: "elasticsearch.logging.svc.cluster.local"
        - name: FLUENT_ELASTICSEARCH_PORT
          value: "9200"
        - name: FLUENT_UID
          value: "0"
        resources:
          limits:
            memory: 200Mi
          requests:
            cpu: 100m
            memory: 200Mi
        volumeMounts:
        - name: varlog
          mountPath: /var/log
        - name: varlibdockercontainers
          mountPath: /var/lib/docker/containers
          readOnly: true
        - name: fluentd-config
          mountPath: /fluentd/etc
      volumes:
      - name: varlog
        hostPath:
          path: /var/log
      - name: varlibdockercontainers
        hostPath:
          path: /var/lib/docker/containers
      - name: fluentd-config
        configMap:
          name: fluentd-config

---
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluentd-config
  namespace: kube-system
data:
  fluent.conf: |
    <source>
      @type tail
      @id in_tail_container_logs
      path /var/log/containers/*claude-web*.log
      pos_file /var/log/fluentd-containers.log.pos
      tag kubernetes.*
      read_from_head true
      <parse>
        @type json
        time_format %Y-%m-%dT%H:%M:%S.%NZ
      </parse>
    </source>
    
    <filter kubernetes.**>
      @type kubernetes_metadata
    </filter>
    
    <match kubernetes.**>
      @type elasticsearch
      host elasticsearch.logging.svc.cluster.local
      port 9200
      index_name claude-web-logs
      type_name _doc
    </match>
```

## 备份和恢复

### 数据库备份策略

```bash
# scripts/backup-database.sh
#!/bin/bash

set -e

BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
DATABASE_NAME="claude_web"
RETENTION_DAYS=7

# S3配置
S3_BUCKET="claude-web-backups"
S3_PREFIX="database"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

# 创建备份
create_backup() {
    log "Creating database backup..."
    
    local backup_file="${BACKUP_DIR}/${DATABASE_NAME}_${DATE}.sql.gz"
    
    # 创建备份目录
    mkdir -p "$BACKUP_DIR"
    
    # 执行备份
    kubectl exec -n claude-web deployment/mysql -- \
        mysqldump -u root -p${MYSQL_ROOT_PASSWORD} \
        --single-transaction \
        --routines \
        --triggers \
        --events \
        --quick \
        --lock-tables=false \
        "$DATABASE_NAME" | gzip > "$backup_file"
    
    log "Backup created: $backup_file"
    echo "$backup_file"
}

# 上传到S3
upload_to_s3() {
    local backup_file=$1
    local s3_key="${S3_PREFIX}/$(basename "$backup_file")"
    
    log "Uploading to S3: s3://${S3_BUCKET}/${s3_key}"
    
    aws s3 cp "$backup_file" "s3://${S3_BUCKET}/${s3_key}" \
        --storage-class STANDARD_IA \
        --server-side-encryption AES256
    
    log "Upload completed"
}

# 清理旧备份
cleanup_old_backups() {
    log "Cleaning up old backups..."
    
    # 本地清理
    find "$BACKUP_DIR" -name "${DATABASE_NAME}_*.sql.gz" \
        -mtime +${RETENTION_DAYS} -delete
    
    # S3清理
    aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}/" --recursive | \
        while read -r line; do
            file_date=$(echo "$line" | awk '{print $1}')
            file_name=$(echo "$line" | awk '{print $4}')
            
            if [[ $(date -d "$file_date" +%s) -lt $(date -d "${RETENTION_DAYS} days ago" +%s) ]]; then
                aws s3 rm "s3://${S3_BUCKET}/${file_name}"
                log "Deleted old backup: $file_name"
            fi
        done
    
    log "Cleanup completed"
}

# 验证备份
verify_backup() {
    local backup_file=$1
    
    log "Verifying backup integrity..."
    
    if gzip -t "$backup_file"; then
        log "Backup file is valid"
        return 0
    else
        log "ERROR: Backup file is corrupted"
        return 1
    fi
}

# 主函数
main() {
    log "Starting database backup process..."
    
    # 创建备份
    backup_file=$(create_backup)
    
    # 验证备份
    if verify_backup "$backup_file"; then
        # 上传到S3
        upload_to_s3 "$backup_file"
        
        # 清理旧备份
        cleanup_old_backups
        
        log "Backup process completed successfully"
    else
        log "ERROR: Backup verification failed"
        exit 1
    fi
}

main "$@"
```

### 恢复流程

```bash
# scripts/restore-database.sh
#!/bin/bash

set -e

BACKUP_FILE=$1
DATABASE_NAME="claude_web"
TEMP_DB="claude_web_restore_temp"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

# 验证参数
if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup-file>"
    echo "Example: $0 /backups/claude_web_20231201_120000.sql.gz"
    exit 1
fi

# 从S3下载备份
download_from_s3() {
    if [[ "$BACKUP_FILE" == s3://* ]]; then
        local local_file="/tmp/$(basename "$BACKUP_FILE")"
        log "Downloading backup from S3..."
        aws s3 cp "$BACKUP_FILE" "$local_file"
        BACKUP_FILE="$local_file"
    fi
}

# 验证备份文件
validate_backup() {
    log "Validating backup file..."
    
    if [ ! -f "$BACKUP_FILE" ]; then
        log "ERROR: Backup file not found: $BACKUP_FILE"
        exit 1
    fi
    
    if ! gzip -t "$BACKUP_FILE"; then
        log "ERROR: Backup file is corrupted"
        exit 1
    fi
    
    log "Backup file is valid"
}

# 创建临时数据库
create_temp_database() {
    log "Creating temporary database: $TEMP_DB"
    
    kubectl exec -n claude-web deployment/mysql -- \
        mysql -u root -p${MYSQL_ROOT_PASSWORD} \
        -e "CREATE DATABASE IF NOT EXISTS $TEMP_DB;"
}

# 恢复到临时数据库
restore_to_temp() {
    log "Restoring backup to temporary database..."
    
    gunzip -c "$BACKUP_FILE" | \
        kubectl exec -i -n claude-web deployment/mysql -- \
        mysql -u root -p${MYSQL_ROOT_PASSWORD} "$TEMP_DB"
    
    log "Restore to temporary database completed"
}

# 验证恢复数据
validate_restored_data() {
    log "Validating restored data..."
    
    # 检查表结构
    tables=$(kubectl exec -n claude-web deployment/mysql -- \
        mysql -u root -p${MYSQL_ROOT_PASSWORD} "$TEMP_DB" \
        -e "SHOW TABLES;" --skip-column-names)
    
    if [ -z "$tables" ]; then
        log "ERROR: No tables found in restored database"
        return 1
    fi
    
    log "Found tables: $(echo "$tables" | tr '\n' ' ')"
    
    # 检查数据完整性
    for table in $tables; do
        count=$(kubectl exec -n claude-web deployment/mysql -- \
            mysql -u root -p${MYSQL_ROOT_PASSWORD} "$TEMP_DB" \
            -e "SELECT COUNT(*) FROM $table;" --skip-column-names)
        log "Table $table: $count rows"
    done
    
    log "Data validation completed"
    return 0
}

# 切换数据库
switch_database() {
    log "Switching to restored database..."
    
    # 停止应用服务
    kubectl scale deployment/backend --replicas=0 -n claude-web
    kubectl scale deployment/celery --replicas=0 -n claude-web
    
    # 等待Pod终止
    kubectl wait --for=delete pod -l app=claude-web-backend -n claude-web --timeout=120s
    
    # 重命名数据库
    kubectl exec -n claude-web deployment/mysql -- \
        mysql -u root -p${MYSQL_ROOT_PASSWORD} \
        -e "CREATE DATABASE ${DATABASE_NAME}_backup_$(date +%Y%m%d_%H%M%S) LIKE $DATABASE_NAME;
            INSERT ${DATABASE_NAME}_backup_$(date +%Y%m%d_%H%M%S) SELECT * FROM $DATABASE_NAME;
            DROP DATABASE $DATABASE_NAME;
            CREATE DATABASE $DATABASE_NAME LIKE $TEMP_DB;
            INSERT $DATABASE_NAME SELECT * FROM $TEMP_DB;
            DROP DATABASE $TEMP_DB;"
    
    # 重新启动应用
    kubectl scale deployment/backend --replicas=3 -n claude-web
    kubectl scale deployment/celery --replicas=2 -n claude-web
    
    log "Database switch completed"
}

# 主函数
main() {
    log "Starting database restore process..."
    log "Backup file: $BACKUP_FILE"
    
    # 确认操作
    read -p "This will replace the current database. Continue? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log "Restore cancelled"
        exit 0
    fi
    
    # 执行恢复流程
    download_from_s3
    validate_backup
    create_temp_database
    restore_to_temp
    
    if validate_restored_data; then
        switch_database
        log "Database restore completed successfully"
    else
        log "ERROR: Data validation failed, aborting restore"
        # 清理临时数据库
        kubectl exec -n claude-web deployment/mysql -- \
            mysql -u root -p${MYSQL_ROOT_PASSWORD} \
            -e "DROP DATABASE IF EXISTS $TEMP_DB;"
        exit 1
    fi
}

main "$@"
```

## 扩容和负载均衡

### 水平Pod自动扩容

```yaml
# k8s/autoscaling/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: backend-hpa
  namespace: claude-web
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: "100"
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 100
        periodSeconds: 60
      - type: Pods
        value: 2
        periodSeconds: 60

---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: frontend-hpa
  namespace: claude-web
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: frontend
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

### 垂直Pod自动扩容

```yaml
# k8s/autoscaling/vpa.yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: backend-vpa
  namespace: claude-web
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  updatePolicy:
    updateMode: "Auto"
  resourcePolicy:
    containerPolicies:
    - containerName: backend
      maxAllowed:
        cpu: 2
        memory: 4Gi
      minAllowed:
        cpu: 100m
        memory: 256Mi
      controlledResources: ["cpu", "memory"]
      controlledValues: RequestsAndLimits
```

## 安全和合规

### 网络策略

```yaml
# k8s/security/network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: claude-web-network-policy
  namespace: claude-web
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
  ingress:
  # 允许来自Ingress Controller的流量
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 8000
    - protocol: TCP
      port: 3000
  
  # 允许内部服务通信
  - from:
    - podSelector:
        matchLabels:
          app: claude-web-frontend
    to:
    - podSelector:
        matchLabels:
          app: claude-web-backend
    ports:
    - protocol: TCP
      port: 8000
  
  egress:
  # 允许访问DNS
  - to: []
    ports:
    - protocol: UDP
      port: 53
    - protocol: TCP
      port: 53
  
  # 允许访问数据库和Redis
  - to:
    - podSelector:
        matchLabels:
          app: mysql
    ports:
    - protocol: TCP
      port: 3306
  
  - to:
    - podSelector:
        matchLabels:
          app: redis
    ports:
    - protocol: TCP
      port: 6379
  
  # 允许访问外部API (Claude API)
  - to: []
    ports:
    - protocol: TCP
      port: 443
```

### Pod安全策略

```yaml
# k8s/security/pod-security-policy.yaml
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: claude-web-psp
spec:
  privileged: false
  allowPrivilegeEscalation: false
  requiredDropCapabilities:
    - ALL
  volumes:
    - 'configMap'
    - 'emptyDir'
    - 'projected'
    - 'secret'
    - 'downwardAPI'
    - 'persistentVolumeClaim'
  runAsUser:
    rule: 'MustRunAsNonRoot'
  seLinux:
    rule: 'RunAsAny'
  fsGroup:
    rule: 'RunAsAny'
  readOnlyRootFilesystem: true
  
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: claude-web-psp-role
  namespace: claude-web
rules:
- apiGroups: ['policy']
  resources: ['podsecuritypolicies']
  verbs: ['use']
  resourceNames: ['claude-web-psp']

---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: claude-web-psp-binding
  namespace: claude-web
roleRef:
  kind: Role
  name: claude-web-psp-role
  apiGroup: rbac.authorization.k8s.io
subjects:
- kind: ServiceAccount
  name: default
  namespace: claude-web
```

## 总结

本设计文档全面覆盖了Claude Web应用的开发和部署策略：

1. **开发环境**: Docker Compose本地开发环境，IDE配置，环境变量管理
2. **开发流程**: Git工作流，代码质量检查，自动化测试策略
3. **CI/CD管道**: GitHub Actions工作流，多环境部署，安全扫描
4. **容器化**: 生产级Dockerfile，多阶段构建，安全优化
5. **Kubernetes部署**: 完整的K8s配置，Helm Charts，服务网格
6. **监控日志**: Prometheus监控，Grafana仪表盘，ELK日志栈
7. **备份恢复**: 自动化备份策略，灾难恢复流程
8. **自动扩容**: HPA/VPA配置，负载均衡策略
9. **安全合规**: 网络策略，Pod安全策略，RBAC权限控制

这套完整的DevOps解决方案确保了应用的高可用性、可扩展性和安全性，支持从开发到生产的全生命周期管理。