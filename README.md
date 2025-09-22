# Pandar Coder

懒得写，自动做（Code while you chill）。

面向 Codex / Claude / Gemini 的无人值守自动化编程执行平台：通过 Web 界面编排任务、审批关键步骤，并由代理自动完成大部分工作，适配移动端与托管运行。

## 项目架构

```
claude-web/
├── backend/          # FastAPI 后端服务
├── frontend/         # Next.js 前端应用  
├── docs/            # 项目文档
├── scripts/         # 开发和部署脚本
└── .pre-commit-config.yaml  # 代码规范配置
```

## 技术栈

### 后端
- **框架**: FastAPI
- **数据库**: MySQL 8.0 + SQLAlchemy + Alembic
- **测试**: pytest + asyncio
- **代码规范**: black + flake8 + isort

### 前端  
- **框架**: Next.js 15 (App Router) + TypeScript
- **UI组件**: Radix UI + Tailwind CSS
- **状态管理**: Zustand
- **代码规范**: ESLint + Prettier

## 快速开始

### 环境准备

1. **Python环境** (推荐使用conda):
```bash
conda create -n claude-web python=3.11
conda activate claude-web
```

2. **Node.js环境** (推荐使用nvm):
```bash
nvm install 20
nvm use 20
```

3. **数据库准备**:
```bash
# 确保MySQL服务运行在 127.0.0.1:13306
# 用户: root, 密码: Pa88word
mysql -h127.0.0.1 -uroot -P13306 -pPa88word -e "CREATE DATABASE claude_web;"
mysql -h127.0.0.1 -uroot -P13306 -pPa88word -e "CREATE DATABASE claude_web_test;"
```

### 后端启动

```bash
cd backend

# 安装依赖
pip install -r requirements.txt

# 复制环境配置
cp .env.example .env

# 运行数据库迁移
alembic upgrade head

# 启动开发服务器
uvicorn app.main:app --reload --port 8000
```

### 前端启动

```bash
cd frontend

# 安装依赖  
npm install

# 启动开发服务器
npm run dev
```

## 开发工具

### 代码规范

项目配置了pre-commit钩子来确保代码质量:

```bash
# 安装pre-commit
pip install pre-commit

# 安装钩子
pre-commit install

# 手动运行检查
pre-commit run --all-files
```

### 测试

**后端测试:**
```bash
cd backend
pytest -v
```

**前端测试:**
```bash
cd frontend
npm test
```

### 数据库操作

**创建迁移:**
```bash
cd backend
alembic revision --autogenerate -m "描述变更"
```

**应用迁移:**
```bash
cd backend
alembic upgrade head
```

## API文档

启动后端服务后访问: http://localhost:8000/docs

## 项目状态

当前处于初始化阶段，基础脚手架已搭建完成:
- ✅ 项目结构和配置
- ✅ 后端FastAPI框架  
- ✅ 前端Next.js框架
- ✅ 数据库模型设计
- ✅ 测试框架配置
- ✅ 代码规范配置
- 🔲 核心业务逻辑实现
- 🔲 多代理（Codex/Claude/Gemini）集成
- 🔲 认证授权系统  
- 🔲 通知与审批系统

## 贡献指南

1. Fork项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交变更 (`git commit -m 'Add some AmazingFeature'`)
4. 推送分支 (`git push origin feature/AmazingFeature`)
5. 创建Pull Request

## 许可证

本项目采用MIT许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。
