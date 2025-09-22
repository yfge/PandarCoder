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

## Sandbox（沙盒）
- 默认启用：禁止 shell 运算符（`&&`、`|`、`;`、重定向、反引号、`$()`）与危险片段（`sudo`、`rm -rf`、`chmod 777`、`dd if=`、`mkfs`、`docker`、`kubectl`、`ssh/scp`、`curl | sh`）。
- 仅允许的根命令：默认仅 `codex`、`claude`、`gemini`，可通过环境变量配置。
- 决策：`allow` | `gate`（置 `waiting_confirmation`）| `block`（直接 `failed`）。当 `approval_policy` 为 `manual` 或 `auto_with_gates` 时违规将被 gate；否则直接 block。
- 元数据：`sandbox.mode` 可为 `strict`（默认）或 `permissive`。当 gate/block 时，原因写入 `task_metadata.last_block_reason`。

全局审批开关
- `APPROVALS_ENABLED=false`（默认）时，系统不会进入人工确认，所有 gate 情况将直接 block；元数据 `gates` 也将被忽略，任务直跑。
- `APPROVALS_ENABLED=true` 时，结合 `approval_policy` 与 `gates` 启用人工确认。

环境变量
- `SANDBOX_ENFORCED=true`
- `SANDBOX_ALLOWED_ROOT_CMDS=["codex","claude","gemini"]`
- `APPROVALS_ENABLED=false`

## RBAC & Safety
- 权限见 `app/scripts/init_rbac.py`：`task:*`、`notification:*` 控制操作。
- 一律在隔离环境运行代理 CLI，并基于 allowlist/denylist 收敛指令面。

## Open Source Readiness
- License: add `LICENSE` (MIT) and reference in README; include `NOTICE` if needed.
- Community: add `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant), `SECURITY.md` (vuln report flow), `GOVERNANCE.md` (轻量治理).
- Templates: `.github/ISSUE_TEMPLATE/*.yml` (bug, feature), `PULL_REQUEST_TEMPLATE.md`, `CODEOWNERS`.
- Releases: adopt SemVer, generate `CHANGELOG.md` via conventional commits; tag `v0.x`.
- CI: run backend `pytest` + coverage, lint (flake8/black/isort), frontend ESLint/TypeCheck/Build; verify `tasks.json` locales (见下文 i18n 校验)。

## Internationalization (i18n)
- API language strategy
  - Keep backend error payloads language‑agnostic (stable `error.code`, `details`), translate on FE; optionally honor `Accept-Language` or `?lang=` for simple messages.
  - Ensure all timestamps are UTC ISO‑8601; localize at client.
- Frontend i18n (Next.js App Router)
  - Add locales: `en`, `zh` in `next.config.ts` i18n; default `en`.
  - Store dictionaries at `frontend/src/locales/{en,zh}.json` and use a `t(key, params)` util.
  - Externalize all UI strings; avoid hardcoded text in components/pages.
  - Support RTL (dir="rtl") switch; test truncation and wrapping.
- Docs i18n
  - Mirror docs to `docs/en` and `docs/zh` (or adopt Docusaurus later); keep tasks/AGENTS in English first with Chinese translation.
- Validation & tooling
  - Add script to check missing/unused keys across `src/locales/*.json`.
  - Optional: integrate Crowdin/POEditor sync via GitHub Action.

Example FE usage
```ts
// src/lib/i18n.ts
import en from "@/locales/en.json";
import zh from "@/locales/zh.json";
export const dict = { en, zh } as const;
export const t = (locale: keyof typeof dict, key: string, vars: Record<string,string|number> = {}) =>
  (dict[locale][key] || key).replace(/\{(\w+)\}/g, (_,k)=> String(vars[k] ?? ""));
```
