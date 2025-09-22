# Pandar Coder

懒得写，自动做（Code while you chill）。

[English](README.md) | 简体中文

## 概述

Pandar Coder 编排 Codex、Claude 与 Gemini 实现无人值守编码任务。支持必要的审批门槛、最小任务 Runner，以及 Web 界面。技术栈：FastAPI（后端）、Next.js + TypeScript（前端）、MySQL + SQLAlchemy + Alembic。

## 特性

- 无人值守任务，支持代理选择和代理代理兜底
- 审批门槛（waiting_confirmation → confirm API）
- 内置最小 Runner（轮询），记录进度/输出
- 项目/任务/用户模型与 JWT 认证脚手架
- ESLint/Prettier、Black/isort/Flake8、pytest + asyncio
- i18n 就绪（en/zh），前端使用系统字体并兼容离线构建

## 项目结构

```
PandarCoder/
├── backend/          # FastAPI 服务（app/、tests/、alembic/）
├── frontend/         # Next.js 应用（src/app、components、hooks、store、locales）
├── docs/             # 项目文档（可选）
├── scripts/          # 初始化与开发脚本
├── tasks.md          # 无人值守与 CI/i18n 路线图
├── AGENTS.md         # 贡献者指南
└── docker-compose.yml
```

## 快速开始

1) 后端
- Python 3.11（推荐 conda）：`conda env create -f environment.yml && conda activate claude-web`
- 安装依赖：`cd backend && pip install -r requirements.txt`
- 复制环境：`cp .env.example .env`（如需修改 `DATABASE_URL`）
- 迁移：`alembic upgrade head`
- 启动：`uvicorn app.main:app --reload --port 8100`
- API 文档：http://localhost:8100/docs

2) 前端
- Node `nvm use 20`；依赖：`cd frontend && npm install`
- 开发：`npm run dev`（默认 http://localhost:3100）

3) 数据库（可选 Docker）
- `docker compose up -d mysql`（MySQL 8 @ 127.0.0.1:13306）

## 最小 Runner（无人值守）

- 在 backend/.env 开启：`RUNNER_ENABLED=true`，设置 `RUNNER_POLL_INTERVAL=2`
- 创建任务（metadata 支持 `agent`、`proxy_agent`、`approval_policy`、`gates`、`notify`）
- Runner 自动执行待运行任务，命中门槛则转 `waiting_confirmation`，确认后继续至完成

关键 API：`POST /api/v1/tasks`（创建）• `POST /api/v1/tasks/{id}/action`（start/cancel/confirm/retry）• `POST /api/v1/tasks/{id}/confirm`

## 脚本

- `./scripts/setup.sh` 一次性初始化
- `./scripts/dev.sh` 同时启动后端（8100）与前端（3100）

## 测试与规范

- 后端：`cd backend && pytest -v`（覆盖率 ≥80%）、`flake8`、`black --check .`、`isort --check-only .`
- 前端：`cd frontend && npm run lint && npm run type-check && npm run build`（如有 Vitest 测试则执行）

## 国际化

- Next.js i18n：`en`（默认）、`zh`
- 文案位于 `frontend/src/locales/{en,zh}.json`；`I18nProvider` 提供 `t(key)` 和 `setLocale()`
- 首次使用读取浏览器语言，持久化于 `localStorage.locale`

## 开源

- 许可证：MIT（见 LICENSE）
- 欢迎贡献：参考 AGENTS.md 与 tasks.md 获取贡献与路线图信息
