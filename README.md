# Pandar Coder

English | [简体中文](README.zh-CN.md)

Code while you chill. Unattended multi‑agent coding with lightweight approvals.

## Overview

Pandar Coder orchestrates Codex, Claude, and Gemini to run coding tasks without supervision. It supports approval gates when needed, a minimal task runner, and a web UI. Stack: FastAPI (backend), Next.js + TypeScript (frontend), MySQL + SQLAlchemy + Alembic.

## Features

- Unattended tasks with agent selection and proxy fallback
- Approval gates (waiting_confirmation → confirm API)
- Minimal built‑in runner (polling) with progress/output
- Project/tasks/users models and JWT auth scaffolding
- ESLint/Prettier, Black/isort/Flake8, pytest + asyncio
- i18n ready (en/zh), system font and offline‑friendly FE build

## Project Structure

```
PandarCoder/
├── backend/          # FastAPI service (app/, tests/, alembic/)
├── frontend/         # Next.js app (src/app, components, hooks, store, locales)
├── docs/             # Project docs (optional)
├── scripts/          # Setup and dev helpers
├── tasks.md          # Unattended & CI/i18n roadmap
├── AGENTS.md         # Contributor guide
└── docker-compose.yml
```

## Quick Start

1) Backend
- Python 3.11 (conda recommended): `conda env create -f environment.yml && conda activate claude-web`
- Install deps: `cd backend && pip install -r requirements.txt`
- Copy env: `cp .env.example .env` (set `DATABASE_URL` if needed)
- Migrate: `alembic upgrade head`
- Run API: `uvicorn app.main:app --reload --port 8100`
- API docs: http://localhost:8100/docs

2) Frontend
- Node `nvm use 20`; deps: `cd frontend && npm install`
- Dev server: `npm run dev` (default http://localhost:3100)

3) Database (optional via Docker)
- `docker compose up -d mysql` (MySQL 8 @ 127.0.0.1:13306)

## Minimal Runner (Unattended)

- Toggle in backend/.env: `RUNNER_ENABLED=true`, `RUNNER_POLL_INTERVAL=2`
- Create a task (metadata supports `agent`, `proxy_agent`, `approval_policy`, `gates`, `notify`)
- The runner executes pending tasks, pauses on gates (waiting_confirmation), and finishes upon confirmation

Key APIs: `POST /api/v1/tasks` (create) • `POST /api/v1/tasks/{id}/action` (start/cancel/confirm/retry) • `POST /api/v1/tasks/{id}/confirm`

## Sandbox

- Enforced by default: denies shell operators (&&, |, ;, >, <, backticks, $()), and common dangerous patterns (sudo, rm -rf, chmod 777, dd if=, mkfs, docker, kubectl, ssh/scp, curl | sh).
- Allowed root commands only: defaults to `codex`, `claude`, `gemini`. Configure via `.env` settings.
- Decisions: allow | gate (WAITING_CONFIRMATION) | block (FAILED). Violations in `manual` or `auto_with_gates` policy are gated; otherwise blocked.
- Metadata: `sandbox.mode` can be `strict` (default) or `permissive`. Reason is recorded as `task_metadata.last_block_reason` when gated/blocked.

Environment
- `SANDBOX_ENFORCED=true` (default)
- `SANDBOX_ALLOWED_ROOT_CMDS=["codex","claude","gemini"]`
- `APPROVALS_ENABLED=false` (default: never ask for confirmation; gates ignored)

Example create
```
{
  "name": "Nightly audit",
  "command": "codex audit --fix --create-pr",
  "project_id": 1,
  "metadata": {
    "approval_policy": "auto_with_gates",
    "gates": ["git_push_protected"],
    "sandbox": {"mode": "strict"}
  }
}
```

## Scripts

- `./scripts/setup.sh` one‑time init
- `./scripts/dev.sh` start backend (8100) + frontend (3100)

## Test & Lint

- Backend: `cd backend && pytest -v` (≥80% coverage), `flake8`, `black --check .`, `isort --check-only .`
- Frontend: `cd frontend && npm run lint && npm run type-check && npm run build` (Vitest for tests if present)

## Internationalization

- Next.js i18n locales: `en` (default), `zh`
- UI strings in `frontend/src/locales/{en,zh}.json`; `I18nProvider` exposes `t(key)` and `setLocale()`
- Browser language detected initially; persisted in `localStorage.locale`

## Open Source

- License: MIT (see LICENSE)
- Contributions welcome: see AGENTS.md and tasks.md for contributor guidance and roadmap
