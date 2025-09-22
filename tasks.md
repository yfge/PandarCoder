# Tasks & Agent Automation

Pandar Coder focuses on unattended multi‑agent coding with lightweight approvals.

## Goal
Support fully unattended runs by Codex/Claude/Gemini. When a step needs human approval, create a notification and pause as `waiting_confirmation`. Optionally delegate CLI questions to a proxy agent to continue without human input.

## Model & Status
- Task fields tied to execution: `status`, `output`, `error`, `exit_code`, `progress`, `started_at`, `completed_at`, `scheduled_at`, `metadata` (free‑form).
- Status flow (see `TaskStatus`): `pending → running → waiting_confirmation → running → completed|failed|cancelled`.
- Server‑side command safety: `CreateTaskRequest.command` rejects dangerous substrings (e.g., `rm -rf`, `sudo`).

## Agent Routing (per‑task)
- Select agent via `metadata.agent`: `"codex" | "claude" | "gemini"`.
- Configure fallback via `metadata.proxy_agent` (used to auto‑answer CLI prompts or recover from errors).
- You may pass hints: `metadata.context`, `metadata.max_duration`, `metadata.approval_policy` (convention used by the runner; backend stores as JSON).

Example create payload
```bash
curl -X POST http://localhost:8000/api/v1/tasks \
  -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" \
  -d '{
    "name":"Nightly audit",
    "description":"audit + open PRs",
    "command":"codex audit --fix --create-pr",
    "project_id":1,
    "priority":"medium",
    "metadata":{ "agent":"codex", "proxy_agent":"claude" }
  }'
```

## APIs (implemented vs planned)
- List/create: `GET|POST /api/v1/tasks` (implemented)
- Stats/search: `GET /api/v1/tasks/stats`, `GET /api/v1/tasks/search` (implemented)
- Actions: `POST /api/v1/tasks/{id}/action` with `{ "action": "start|cancel|confirm|retry", "reason"? }` (implemented)
- Direct confirm/cancel/retry: `/confirm`, `/cancel`, `/retry` helpers (implemented; prefer unified `/action`).
- Output/logs/executions streaming: endpoints stubbed (not implemented yet).
- Scheduling: types exist (`ScheduledTaskRequest`), endpoints stubbed (planned).

All secured with JWT (`get_current_user`). Create requires project ownership; see checks in `TaskService.create_task`.

## Approvals & Notifications
- When a step needs approval, set `status=waiting_confirmation` and create a `Notification(type=CONFIRMATION_REQUIRED)` for the owner.
- Approval UX: send a channel message (email/webhook/IM) linking to `POST /api/v1/tasks/{id}/confirm`. Notifications routes are scaffolded under `/api/v1/notifications`.
- Consider emitting `TASK_COMPLETED`/`TASK_FAILED` on finish for visibility.

## Runner integration (where to hook)
- Start: extend `TaskService.execute_task_action('start')` (TODO in code) to spawn a sandboxed process that runs the selected agent CLI.
- Progress/output: call `TaskService.update_task_progress` as the run proceeds; append to `output`.
- Gates: on approval boundary, set `waiting_confirmation`, emit notification; resume on `/confirm`.
- Finish: call `TaskService.complete_task(success, output, error, exit_code, duration)`.

## RBAC & Safety
- Permissions (see `app/scripts/init_rbac.py`): `task:read|write|delete|execute|manage` and `notification:*` should gate operations.
- Keep commands safe; rely on schema checks and run agents in an isolated environment.

## Testing guidance
- Backend: add tests for `start/cancel/confirm/retry` transitions and notification triggers under `backend/tests`.
- Frontend: cover unattended flows (task create → approval → confirm) with Vitest + Testing Library.
