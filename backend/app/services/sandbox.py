"""Sandbox policy helpers for Codex/Claude agents.

The production system is expected to run command execution for the "codex"
and "claude" agents inside an isolated environment. The real runner will be
responsible for starting containers or lightweight sandboxes, but the backend
still needs deterministic logic to decide **when** the sandbox must be used and
which restrictions should be applied.

This module keeps the policy self-contained and dependency free so it can be
unit tested without docker being available. It performs three main tasks:

* Normalise the desired agent (metadata or inferred from command).
* Enforce that sandbox execution cannot be disabled for the supported agents.
* Merge user overrides with the default limits while keeping the output safe
  to persist in ``Task.task_metadata``.

The intent is to provide the same guard rails that the real runner will honour
once the container execution pieces land.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import copy
import re
from typing import Any, Dict, Mapping, MutableMapping, Optional


class SandboxError(ValueError):
    """Raised when a sandbox configuration is invalid."""


@dataclass(frozen=True)
class SandboxLimits:
    """Resource limits applied to the sandbox."""

    cpu: float
    memory_mb: int
    disk_mb: int
    timeout_seconds: int
    allow_network: bool = False
    working_dir: str = "/app/workspace"

    def to_metadata(self) -> Dict[str, Any]:
        """Convert limits to a serialisable dictionary."""

        return {
            "limits": {
                "cpu": self.cpu,
                "memory_mb": self.memory_mb,
                "disk_mb": self.disk_mb,
                "timeout_seconds": self.timeout_seconds,
            },
            "network": {
                "allow": self.allow_network,
            },
            "working_dir": self.working_dir,
        }


@dataclass(frozen=True)
class SandboxProfile:
    """Profile configuration that is specific to an agent."""

    name: str
    limits: SandboxLimits
    capabilities: frozenset[str] = field(default_factory=frozenset)

    def to_metadata(self) -> Dict[str, Any]:
        """Convert the profile to a serialisable dictionary."""

        metadata = {
            "enabled": True,
            "profile": self.name,
        }
        metadata.update(self.limits.to_metadata())
        metadata["capabilities"] = sorted(self.capabilities)
        return metadata


class SandboxManager:
    """Resolve sandbox policies for Codex and Claude agents."""

    SUPPORTED_AGENTS = {"codex", "claude"}

    _DEFAULT_PROFILES: Dict[str, SandboxProfile] = {
        "codex": SandboxProfile(
            name="codex-standard",
            limits=SandboxLimits(
                cpu=1.0,
                memory_mb=512,
                disk_mb=1024,
                timeout_seconds=1800,
                allow_network=False,
            ),
            capabilities=frozenset({"CAP_CHOWN", "CAP_DAC_OVERRIDE"}),
        ),
        "claude": SandboxProfile(
            name="claude-standard",
            limits=SandboxLimits(
                cpu=1.5,
                memory_mb=768,
                disk_mb=1536,
                timeout_seconds=2400,
                allow_network=False,
            ),
            capabilities=frozenset({"CAP_CHOWN", "CAP_DAC_OVERRIDE", "CAP_SETUID"}),
        ),
    }

    _DANGEROUS_SUBSTRINGS = (
        "rm -rf",
        "sudo",
        "&&",
        ";",
        "|",
        "curl http",
        "wget http",
        "nc ",
        "ssh ",
    )
    _DANGEROUS_PATTERNS = (
        re.compile(r"\brm\s+-[rfRF]+"),
        re.compile(r"`[^`]+`"),
        re.compile(r"\$\([^)]*\)"),
        re.compile(r">\s*/dev/(null|zero|tty)"),
    )

    def __init__(self, profiles: Optional[Mapping[str, SandboxProfile]] = None) -> None:
        self._profiles = dict(profiles or self._DEFAULT_PROFILES)

    def ensure_sandbox_metadata(
        self, command: str, metadata: Optional[MutableMapping[str, Any]]
    ) -> Dict[str, Any]:
        """Validate command and augment metadata with sandbox information.

        The input metadata is never mutated; a deep copy is returned instead so
        callers can safely persist the new structure.
        """

        self._validate_command(command)
        metadata_copy: Dict[str, Any] = copy.deepcopy(metadata) if metadata else {}

        agent = self._normalise_agent(metadata_copy.get("agent"), command)
        if agent:
            metadata_copy["agent"] = agent

        if agent in self.SUPPORTED_AGENTS:
            overrides = metadata_copy.get("sandbox")
            if isinstance(overrides, Mapping) and overrides.get("enabled") is False:
                raise SandboxError(
                    "Sandbox execution is mandatory for codex/claude agents"
                )

            profile = self._profiles.get(agent)
            if not profile:
                raise SandboxError(f"No sandbox profile configured for agent '{agent}'")

            merged = self._merge_metadata(profile, overrides)
            metadata_copy["sandbox"] = merged
        elif metadata_copy.get("sandbox"):
            # Allow custom sandbox config for other agents but still validate.
            overrides = metadata_copy.get("sandbox")
            merged = self._merge_metadata(None, overrides)
            metadata_copy["sandbox"] = merged

        return metadata_copy

    def should_use_sandbox(self, metadata: Optional[Mapping[str, Any]], command: str) -> bool:
        """Return True if sandbox execution is required for the task."""

        agent = self._normalise_agent(metadata.get("agent") if metadata else None, command)
        return agent in self.SUPPORTED_AGENTS

    def _normalise_agent(self, agent: Optional[str], command: str) -> Optional[str]:
        if agent:
            return str(agent).strip().lower() or None

        command = command.strip().lower()
        if not command:
            return None

        first_token = command.split()[0]
        if first_token in self.SUPPORTED_AGENTS:
            return first_token
        return None

    def _merge_metadata(
        self,
        profile: Optional[SandboxProfile],
        overrides: Optional[Mapping[str, Any]],
    ) -> Dict[str, Any]:
        """Merge default profile metadata with user overrides."""

        base = profile.to_metadata() if profile else {"enabled": True}
        if not overrides:
            return base

        return self._recursive_merge(base, overrides)

    def _recursive_merge(
        self, base: Dict[str, Any], overrides: Mapping[str, Any]
    ) -> Dict[str, Any]:
        merged = copy.deepcopy(base)
        for key, value in overrides.items():
            if key == "enabled" and value is False:
                raise SandboxError(
                    "Sandbox execution is mandatory for codex/claude agents"
                )

            if (
                key in merged
                and isinstance(merged[key], dict)
                and isinstance(value, Mapping)
            ):
                merged[key] = self._recursive_merge(merged[key], value)
            elif key == "capabilities" and value is not None:
                capabilities = set(merged.get("capabilities", []))
                if isinstance(value, (list, tuple, set)):
                    capabilities.update(str(item) for item in value)
                else:
                    capabilities.add(str(value))
                merged["capabilities"] = sorted(capabilities)
            else:
                merged[key] = value
        return merged

    def _validate_command(self, command: str) -> None:
        command_stripped = (command or "").strip()
        if not command_stripped:
            raise SandboxError("Command cannot be empty")

        lowered = command_stripped.lower()
        for fragment in self._DANGEROUS_SUBSTRINGS:
            if fragment in lowered:
                raise SandboxError(
                    f"Command contains disallowed fragment: '{fragment.strip()}'."
                )

        for pattern in self._DANGEROUS_PATTERNS:
            if pattern.search(command_stripped):
                raise SandboxError("Command contains potentially unsafe pattern")


__all__ = ["SandboxManager", "SandboxError", "SandboxProfile", "SandboxLimits"]

