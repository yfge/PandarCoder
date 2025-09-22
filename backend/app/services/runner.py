"""
Minimal unattended task runner.

- Polls for tasks to run (pending, or re-run after confirmation)
- Simulates execution by updating progress/output and completing
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.database import get_db_session
from app.models.task import Task, TaskStatus


logger = logging.getLogger(__name__)


class TaskRunner:
    def __init__(self, poll_interval: int = 2):
        self.poll_interval = poll_interval
        self._stop_event = asyncio.Event()
        self._task: Optional[asyncio.Task] = None

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
        # Read metadata safely
        metadata = task.task_metadata or {}
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

        try:
            # Simulate work in chunks
            for i in range(1, 6):
                await asyncio.sleep(0.2)
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
            finished = datetime.utcnow()
            task.status = TaskStatus.FAILED
            task.completed_at = finished
            task.error = str(e)
            task.exit_code = 1
            if task.started_at:
                task.duration = int((finished - task.started_at).total_seconds())
            task.updated_at = finished
            await db.commit()
            logger.exception("Task %s failed: %s", task.id, e)
