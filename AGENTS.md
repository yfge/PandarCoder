# Repository Guidelines

This repository hosts Pandar Coder — a lazy-friendly, automated multi‑agent coder.

## Project Structure & Modules
- `backend/` FastAPI: `app/{api,core,db,models,schemas,services}`, `tests/`, Alembic.
- `frontend/` Next.js + TS: `src/{app,components,hooks,lib,store,api,types}`, `public/`.
- `docs/` docs, `scripts/` helpers, `docker-compose.yml` for MySQL + services.

## Build, Test, and Development
- Backend: `cd backend && pip install -r requirements.txt`; `alembic upgrade head`; `uvicorn app.main:app --reload --port 8000`; `pytest -v` (coverage fails <80%).
- Frontend: `cd frontend && npm install`; `npm run dev` (port 3100); `npm run build && npm start`; `npm test`/`npm run test:coverage`.
- Full stack: `./scripts/setup.sh` first‑time; `./scripts/dev.sh` run FE+BE; `docker-compose up -d` starts MySQL.

## Agent Automation (Unattended)
- Create tasks via `POST /api/v1/tasks` with `name`, `command`, `project_id`, optional `metadata.agent` (`codex|claude|gemini`) and `metadata.proxy_agent` for fallback Q&A.
- Lifecycle: `pending → running → waiting_confirmation → running → completed/failed`. Confirm via `POST /api/v1/tasks/{id}/confirm` when human approval is required.
- Approvals: use notifications (model `Notification`, type `CONFIRMATION_REQUIRED`) to prompt owners; wire channels (email/webhook/IM) in notifications service (endpoints scaffolded under `/notifications`).
- Safety: commands validated server‑side (see schema checks); prefer sandboxed runners for CLI execution in the future task runner.

## Coding Style & Tests
- Python: Black (88), isort (profile=black), Flake8 (`E203,W503` ignored). Names: files/functions `snake_case`, classes `PascalCase`.
- TS/React: Prettier + ESLint (Next). Components `PascalCase`, route folders lower‑case.
- Backend tests in `backend/tests` (`test_*.py`, `Test*`, `test_*`), asyncio enabled; Frontend tests with Vitest + Testing Library.

## Commit & PRs
- Use concise, imperative commits (Conventional Commits encouraged). Include PR description, linked issues, screenshots/GIFs (UI), and test plan. Ensure `pre-commit run --all-files` passes and migrations are noted.

## Submission Checklist
- Backend: `pytest -v` (≥80% coverage), `flake8`, `black --check`, `isort --check-only`.
- Frontend: `npm run lint`, `npm test`, `npm run type-check`, `npm run build`.
- CI parity: run `docker-compose up -d mysql` when tests need DB; seed if required. No failing lint/test allowed before merge.
Note: run test/lint/build after each change before submitting any PR.

## Configuration
- Backend `.env` from `.env.example`; MySQL default `127.0.0.1:13306`. Optional: define `AGENT_DEFAULT` and `AGENT_PROXY` (planned) for global agent selection. Never commit secrets.
