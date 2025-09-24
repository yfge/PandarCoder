"""Unit tests for :mod:`app.services.sandbox`."""

import pytest

from app.services.sandbox import SandboxError, SandboxManager


def test_build_submission_payload():
    manager = SandboxManager()
    metadata = {"agent": "codex", "approval_policy": "auto"}

    submission = manager.build_submission("codex lint", metadata)
    payload = submission.to_payload()

    assert payload["agent"] == "codex"
    assert payload["command"] == "codex lint"
    assert payload["sandbox"]["profile"] == "codex-standard"
    assert payload["sandbox"]["limits"]["memory_mb"] == 512
    assert payload["metadata"]["approval_policy"] == "auto"


def test_build_submission_requires_supported_agent():
    manager = SandboxManager()

    with pytest.raises(SandboxError):
        manager.build_submission("npm test", {"agent": "gemini"})


def test_codex_agent_gets_default_profile():
    manager = SandboxManager()
    source_metadata = {"agent": "codex", "extra": "value"}

    result = manager.ensure_sandbox_metadata("codex lint", source_metadata)

    # Original metadata must remain untouched
    assert "sandbox" not in source_metadata
    assert result is not source_metadata

    sandbox = result["sandbox"]
    assert sandbox["enabled"] is True
    assert sandbox["profile"] == "codex-standard"
    assert sandbox["limits"]["cpu"] == pytest.approx(1.0)
    assert sandbox["limits"]["memory_mb"] == 512
    assert sandbox["working_dir"] == "/app/workspace"


def test_claude_agent_overrides_are_merged():
    manager = SandboxManager()
    metadata = {
        "agent": "CLAUDE",  # case insensitivity
        "sandbox": {
            "limits": {"memory_mb": 1024},
            "capabilities": ["CAP_SYS_PTRACE"],
        },
    }

    result = manager.ensure_sandbox_metadata("claude plan", metadata)
    sandbox = result["sandbox"]

    # Memory override applied while CPU stays with the default profile
    assert sandbox["limits"]["memory_mb"] == 1024
    assert sandbox["limits"]["cpu"] == pytest.approx(1.5)

    # Capabilities merge (no duplicates, sorted)
    assert sandbox["capabilities"] == [
        "CAP_CHOWN",
        "CAP_DAC_OVERRIDE",
        "CAP_SETUID",
        "CAP_SYS_PTRACE",
    ]


def test_cannot_disable_sandbox_for_codex():
    manager = SandboxManager()

    with pytest.raises(SandboxError):
        manager.ensure_sandbox_metadata(
            "codex format",
            {"agent": "codex", "sandbox": {"enabled": False}},
        )


def test_disallowed_command_fragments_raise_error():
    manager = SandboxManager()

    with pytest.raises(SandboxError):
        manager.ensure_sandbox_metadata("codex run && rm -rf /", {"agent": "codex"})


def test_agent_is_inferred_from_command():
    manager = SandboxManager()

    result = manager.ensure_sandbox_metadata("claude format", None)

    assert result["agent"] == "claude"
    assert result["sandbox"]["profile"] == "claude-standard"


def test_other_agents_keep_custom_sandbox():
    manager = SandboxManager()
    metadata = {
        "agent": "gemini",
        "sandbox": {
            "enabled": True,
            "limits": {"cpu": 0.5},
        },
    }

    result = manager.ensure_sandbox_metadata("npm test", metadata)

    assert result["agent"] == "gemini"
    assert result["sandbox"]["limits"]["cpu"] == 0.5
    # Base helper ensures "enabled" survives even without a default profile
    assert result["sandbox"]["enabled"] is True
