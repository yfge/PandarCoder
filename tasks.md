# Tasks & Unattended Automation

Pandar Coder is “unattended‑first”: tasks run自动化，只有命中审批门槛才需人工确认。

## Execution Model
- States: `pending → running → waiting_confirmation → running → completed|failed|cancelled` (see `TaskStatus`).
- Fields: `output`, `error`, `exit_code`, `progress`, `started_at`, `completed_at`, `scheduled_at`, `metadata`。
- Safety: `CreateTaskRequest.command` 拒绝危险片段（如 `rm -rf`, `sudo`）。

## Unattended Policy (per task via metadata)
- `metadata.agent`: `"codex" | "claude" | "gemini"`（主代理）。
- `metadata.proxy_agent`: 兜底代理；用于回答 CLI 提示或恢复错误。
- `metadata.approval_policy`: `auto` | `manual` | `auto_with_gates`。
- `metadata.gates`: 命中则转 `waiting_confirmation`（示例：`["git_push_protected", "secrets_access", "infra_change"]`）。
- `metadata.notify`: 渠道列表（如 `slack://...`、`webhook:https://...`）。
- 可选：`timeout_sec`, `max_retries`, `context`, `concurrency_key`。

Create example
```bash
curl -X POST http://localhost:8000/api/v1/tasks \
  -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" \
  -d '{
    "name":"Nightly audit",
    "command":"codex audit --fix --create-pr",
    "project_id":1,
    "priority":"medium",
    "metadata":{
      "agent":"codex",
      "proxy_agent":"claude",
      "approval_policy":"auto_with_gates",
      "gates":["git_push_protected"],
      "notify":["webhook:https://hooks.example.com/builds"]
    }
  }'
```

## Approvals & Notifications
- 命中 gate → 置 `waiting_confirmation` 并创建 `Notification(CONFIRMATION_REQUIRED)`（见 `models/notification.py`）。
- 审批链接执行 `POST /api/v1/tasks/{id}/confirm`；拒绝则使用 `/action {"action":"cancel","reason":"..."}`。
- 完成后可发 `TASK_COMPLETED`/`TASK_FAILED` 通知。

## APIs (today vs planned)
- 已有：`GET|POST /api/v1/tasks`、`GET /api/v1/tasks/search`、`GET /api/v1/tasks/stats`、
  `POST /api/v1/tasks/{id}/action`（`start|cancel|confirm|retry`）、`POST /api/v1/tasks/{id}/confirm`。
- 规划：输出/日志/执行流接口、`/tasks/scheduled`（`ScheduledTaskRequest` 已定义）。

## Runner Integration (code)
- 在 `TaskService.execute_task_action('start')` 里接入执行器（TODO）：
  - 周期性调用 `update_task_progress`，追加 `output`。
  - 触发 gate 时置 `waiting_confirmation` 并发通知；`/confirm` 后继续。
  - 结束时调用 `complete_task(success, output, error, exit_code, duration)`。

## RBAC & Safety
- 权限见 `app/scripts/init_rbac.py`：`task:*`、`notification:*` 控制操作。
- 一律在隔离环境运行代理 CLI，并基于 allowlist/denylist 收敛指令面。
