"""Tests for the task runner sandbox integration."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, Optional

import pytest

from app.models.task import TaskStatus
from app.services.runner import TaskRunner


class DummySession:
    """Minimal async session stand-in used for unit tests."""

    def __init__(self) -> None:
        self.commits: int = 0

    async def commit(self) -> None:  # pragma: no cover - trivial
        self.commits += 1


@dataclass
class DummyTask:
    """Lightweight task model compatible with :class:`TaskRunner`."""

    id: int
    command: str
    task_metadata: Optional[Dict[str, object]] = field(default_factory=dict)
    status: TaskStatus = TaskStatus.PENDING
    output: Optional[str] = None
    error: Optional[str] = None
    exit_code: Optional[int] = None
    progress: Optional[int] = None
    duration: Optional[int] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


@pytest.mark.asyncio
async def test_runner_submits_sandbox_task():
    runner = TaskRunner(poll_interval=0, chunk_delay=0)
    task = DummyTask(id=1, command="codex lint", task_metadata={"agent": "codex"})
    session = DummySession()

    await runner._process_task(session, task)

    assert task.status is TaskStatus.COMPLETED
    assert task.progress == 100
    assert task.task_metadata is not None
    runtime = task.task_metadata.get("runtime", {})
    submission = runtime.get("sandbox_submission")
    assert submission["agent"] == "codex"
    assert submission["sandbox"]["profile"] == "codex-standard"
    assert "submitted to sandbox" in (task.output or "")
    assert session.commits > 0


@pytest.mark.asyncio
async def test_runner_handles_invalid_sandbox_config():
    runner = TaskRunner(poll_interval=0, chunk_delay=0)
    task = DummyTask(
        id=2,
        command="codex lint",
        task_metadata={"agent": "codex", "sandbox": {"enabled": False}},
    )
    session = DummySession()

    await runner._process_task(session, task)

    assert task.status is TaskStatus.FAILED
    assert task.error is not None
    assert "Sandbox validation failed" in task.error


@pytest.mark.asyncio
async def test_runner_processes_non_sandbox_agent():
    runner = TaskRunner(poll_interval=0, chunk_delay=0)
    task = DummyTask(id=3, command="npm test", task_metadata={"agent": "gemini"})
    session = DummySession()

    await runner._process_task(session, task)

    assert task.status is TaskStatus.COMPLETED
    assert (task.task_metadata or {}).get("runtime") is None
    assert "submitted to sandbox" not in (task.output or "")
