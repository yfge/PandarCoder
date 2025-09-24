"""Minimal unattended task runner.

The runner polls the database for tasks that need to be executed and then
simulates their execution. For agents that require sandboxing (Codex and
Claude) the runner prepares a submission payload that would normally be sent to
an isolated execution environment.
"""
from __future__ import annotations

import asyncio
import copy
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.database import get_db_session
from app.models.task import Task, TaskStatus
from app.services.sandbox import SandboxError, SandboxManager


logger = logging.getLogger(__name__)


class TaskRunner:
    def __init__(
        self,
        poll_interval: int = 2,
        *,
        sandbox_manager: SandboxManager | None = None,
        chunk_delay: float = 0.2,
    ):
        self.poll_interval = poll_interval
        self.chunk_delay = chunk_delay
        self._stop_event = asyncio.Event()
        self._task: Optional[asyncio.Task] = None
        self._sandbox_manager = sandbox_manager or SandboxManager()

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._stop_event.clear()
            self._task = asyncio.create_task(self.run(), name="task-runner")
            logger.info("TaskRunner started (interval=%ss)", self.poll_interval)

    async def stop(self) -> None:
        self._stop_event.set()
        if self._task:
            await asyncio.wait([self._task], timeout=5)
            logger.info("TaskRunner stopped")

    async def run(self) -> None:
        while not self._stop_event.is_set():
            try:
                async with get_db_session() as db:
                    task = await self._fetch_next_task(db)
                    if task:
                        await self._process_task(db, task)
                        # loop quickly to see if there is another task
                        continue
            except Exception as e:
                logger.exception("Runner loop error: %s", e)

            await asyncio.sleep(self.poll_interval)

    async def _fetch_next_task(self, db: AsyncSession) -> Optional[Task]:
        """Pick one task to run.
        - PENDING tasks
        - RUNNING tasks with no started_at (confirmed after gate)
        """
        now = datetime.utcnow()
        stmt = (
            select(Task)
            .where(
                or_(
                    Task.status == TaskStatus.PENDING,
                    and_(Task.status == TaskStatus.RUNNING, Task.started_at.is_(None)),
                )
                ,
                or_(Task.scheduled_at.is_(None), Task.scheduled_at <= now)
            )
            .order_by(Task.priority.desc(), Task.created_at.asc())
            .limit(1)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def _process_task(self, db: AsyncSession, task: Task) -> None:
        raw_metadata = task.task_metadata or {}

        try:
            metadata = self._sandbox_manager.ensure_sandbox_metadata(
                task.command,
                raw_metadata,
            )
        except SandboxError as exc:
            await self._fail_task(db, task, f"Sandbox validation failed: {exc}")
            return

        task.task_metadata = copy.deepcopy(metadata)
        approval_policy = (metadata.get("approval_policy") or "auto").lower()
        gates = metadata.get("gates") or []

        # If policy requires gate and gates exist, pause for confirmation
        if approval_policy in ("manual", "auto_with_gates") and gates:
            task.status = TaskStatus.WAITING_CONFIRMATION
            task.updated_at = datetime.utcnow()
            await db.commit()
            logger.info("Task %s waiting for confirmation (gates=%s)", task.id, gates)
            return

        # Start execution
        now = datetime.utcnow()
        task.status = TaskStatus.RUNNING
        task.started_at = now
        task.updated_at = now
        task.output = (task.output or "") + f"[runner] starting at {now.isoformat()}\n"
        await db.commit()

        if self._sandbox_manager.should_use_sandbox(metadata, task.command):
            submission_payload = await self._submit_to_sandbox(db, task, metadata)
            if submission_payload is None:
                # Submission failed, task already marked as failed
                return
            metadata = task.task_metadata or metadata

        try:
            # Simulate work in chunks
            for i in range(1, 6):
                await asyncio.sleep(self.chunk_delay)
                task.progress = i * 20
                task.output = (task.output or "") + f"chunk {i}/5 done\n"
                task.updated_at = datetime.utcnow()
                await db.commit()

            # Complete successfully
            finished = datetime.utcnow()
            task.status = TaskStatus.COMPLETED
            task.completed_at = finished
            task.exit_code = 0
            if task.started_at:
                task.duration = int((finished - task.started_at).total_seconds())
            task.output = (task.output or "") + "[runner] completed successfully\n"
            task.progress = 100
            task.updated_at = finished
            await db.commit()
            logger.info("Task %s completed", task.id)

        except Exception as e:
            await self._fail_task(db, task, str(e))

    async def _submit_to_sandbox(
        self,
        db: AsyncSession,
        task: Task,
        metadata: dict,
    ) -> Optional[dict]:
        try:
            submission = self._sandbox_manager.build_submission(
                task.command,
                metadata,
            )
        except SandboxError as exc:
            await self._fail_task(db, task, f"Sandbox submission failed: {exc}")
            return None

        payload = submission.to_payload()
        runtime_metadata = copy.deepcopy(metadata.get("runtime") or {})
        runtime_metadata["sandbox_submission"] = payload

        new_metadata = copy.deepcopy(metadata)
        new_metadata["runtime"] = runtime_metadata
        task.task_metadata = new_metadata
        task.output = (task.output or "") + (
            "[runner] submitted to sandbox "
            f"profile={payload['sandbox']['profile']}\n"
        )
        task.updated_at = datetime.utcnow()
        await db.commit()
        logger.info(
            "Task %s submitted to sandbox (agent=%s, profile=%s)",
            task.id,
            payload["agent"],
            payload["sandbox"]["profile"],
        )
        return payload

    async def _fail_task(self, db: AsyncSession, task: Task, message: str) -> None:
        finished = datetime.utcnow()
        task.status = TaskStatus.FAILED
        task.completed_at = finished
        task.error = message
        task.exit_code = 1
        if task.started_at:
            task.duration = int((finished - task.started_at).total_seconds())
        task.updated_at = finished
        await db.commit()
        logger.exception("Task %s failed: %s", task.id, message)
