"""
Sandbox policy and validators for task commands.

Goals
- Prevent dangerous commands from being created/executed.
- Constrain root commands to an allowlist (typically agent CLIs).
- Provide a single place to evaluate runtime policy for the runner.
"""
from __future__ import annotations

from typing import Dict, Tuple, Optional
import re

from app.core.config import settings


# Default policy values if not provided by settings
DEFAULT_ALLOWED_ROOT_CMDS = ("codex", "claude", "gemini")

# Operators that enable command chaining or redirection
SHELL_OPERATOR_PATTERNS = [
    r"&&",
    r"\|\|",
    r";",
    r"\|",
    r">{1,2}",
    r"<",
    r"2>\&1",
    r"`[\s\S]*?`",  # backticks
    r"\$\([\s\S]*?\)",  # command substitution
]

# Additional dangerous substrings / commands
DENYLIST_PATTERNS = [
    r"\bsudo\b",
    r"\bsu\b",
    r"\bchmod\s+777\b",
    r"\brm\s+-rf\b",
    r"\bdd\s+if=",
    r"\bmkfs\b",
    r"\bfdisk\b",
    r"\bmount\b|\bumount\b",
    r"\bchown\b",
    r"\bkill\s+-9\b",
    r"\bshutdown\b|\breboot\b",
    r"\bscp\b|\bssh\b",
    r"curl[\s\S]*\|[\s\S]*sh\b",
    r"\bdocker\b|\bkubectl\b",
]


def _get_allowed_roots() -> Tuple[str, ...]:
    allowed = getattr(settings, "SANDBOX_ALLOWED_ROOT_CMDS", None)
    if isinstance(allowed, (list, tuple)) and allowed:
        return tuple(str(x).strip() for x in allowed if str(x).strip())
    return DEFAULT_ALLOWED_ROOT_CMDS


def extract_root(command: str) -> str:
    cmd = command.strip()
    # remove leading env assignments like FOO=bar BAR=baz cmd ...
    parts = cmd.split()
    i = 0
    while i < len(parts) and re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", parts[i]):
        i += 1
    return parts[i] if i < len(parts) else ""


def has_shell_operators(command: str) -> bool:
    for p in SHELL_OPERATOR_PATTERNS:
        if re.search(p, command):
            return True
    return False


def matches_denylist(command: str) -> Optional[str]:
    for p in DENYLIST_PATTERNS:
        if re.search(p, command, flags=re.IGNORECASE):
            return p
    return None


def is_command_allowed(command: str) -> Tuple[bool, Optional[str]]:
    """Static checks that do not depend on metadata.

    Returns (allowed, reason).
    """
    cmd = command.strip()
    if not cmd:
        return False, "empty command"

    # disallow chaining/redirection
    if has_shell_operators(cmd):
        return False, "shell operators (chaining/redirection) are not allowed"

    # denylisted fragments
    m = matches_denylist(cmd)
    if m:
        return False, f"command contains denied pattern: {m}"

    # allowed root commands only
    root = extract_root(cmd).lower()
    if root not in _get_allowed_roots():
        return False, f"root command '{root}' is not allowed"

    return True, None


def evaluate_runtime_policy(command: str, metadata: Optional[Dict] = None) -> Tuple[str, Optional[str]]:
    """Evaluate what the runner should do.

    Returns (decision, reason) where decision is one of:
    - "allow": proceed with execution
    - "gate": require confirmation (WAITING_CONFIRMATION)
    - "block": mark as FAILED immediately
    """
    metadata = metadata or {}
    sandbox_mode = str(metadata.get("sandbox", {}).get("mode", "strict")).lower()
    approval = str(metadata.get("approval_policy", "auto")).lower()

    enforced = getattr(settings, "SANDBOX_ENFORCED", True)
    allowed, reason = is_command_allowed(command)

    if allowed:
        return "allow", None

    # With approvals disabled globally, never gate — always block
    if not getattr(settings, "APPROVALS_ENABLED", True):
        return "block", reason or "blocked by sandbox"

    # If sandbox is enforced or sandbox_mode is strict → gate or block
    if enforced or sandbox_mode == "strict":
        if approval in ("manual", "auto_with_gates"):
            return "gate", reason or "blocked by sandbox"
        return "block", reason or "blocked by sandbox"

    # permissive mode: allow but note reason
    return "allow", None
