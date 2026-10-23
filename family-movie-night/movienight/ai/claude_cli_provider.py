"""Claude through the Claude Code terminal CLI (``claude -p``).

Uses whatever login the local ``claude`` command has (Pro/Max subscription or
API key), so no key is needed in this app.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile

from .base import AIError, LogFn


class ClaudeCliProvider:
    id = "claude_cli"
    label = "Claude Code terminalas"

    def __init__(self, cli_path: str, model: str, cwd: str | None = None,
                 timeout: float = 300.0) -> None:
        self.cli_path = cli_path or "claude"
        self.cwd = cwd  # run outside any project so no CLAUDE.md is picked up
        self.model = model
        self.timeout = timeout

    def command(self, system_file: str) -> list[str]:
        exe = shutil.which(self.cli_path) or self.cli_path
        # No tools and no saved session: a single, fast text answer.
        cmd = [exe, "-p", "--output-format", "json", "--system-prompt-file", system_file,
               "--tools", "", "--no-session-persistence"]
        if self.model:
            cmd += ["--model", self.model]
        return cmd

    def complete(self, system: str, user: str, log: LogFn) -> str:
        # The prompts go through a file and stdin: multi-line arguments are
        # mangled by Windows .cmd shims.
        with tempfile.NamedTemporaryFile(
            "w", suffix=".txt", encoding="utf-8", delete=False
        ) as fh:
            fh.write(system)
        try:
            return self._run(self.command(fh.name), user, log)
        finally:
            os.unlink(fh.name)

    def _run(self, cmd: list[str], user: str, log: LogFn) -> str:
        log("$ " + " ".join(a or "''" for a in cmd) + "  < užklausa per stdin")
        flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        try:
            proc = subprocess.run(
                cmd,
                input=user,
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=self.timeout,
                creationflags=flags,
                cwd=self.cwd,
            )
        except FileNotFoundError:
            raise AIError(
                f"Nerasta „{self.cli_path}“ komanda. Įdiekite Claude Code "
                "(https://claude.com/claude-code) arba nurodykite kelią Nustatymuose."
            ) from None
        except subprocess.TimeoutExpired:
            raise AIError(f"Claude Code neatsakė per {int(self.timeout)} s.") from None

        if proc.stderr.strip():
            log(proc.stderr.strip()[-2000:])
        try:
            payload = json.loads(proc.stdout)
        except json.JSONDecodeError:
            if proc.returncode != 0:
                raise AIError(
                    f"claude baigėsi su kodu {proc.returncode}: "
                    f"{(proc.stderr or proc.stdout).strip()[:300]}"
                ) from None
            return proc.stdout  # plain text output – let the parser try
        if payload.get("is_error") or proc.returncode != 0:
            raise AIError(f"Claude Code klaida: {str(payload.get('result') or proc.stderr)[:300]}")
        cost = payload.get("total_cost_usd")
        log(f"← claude baigė per {payload.get('duration_ms', '?')} ms"
            + (f", ~${cost:.4f}" if isinstance(cost, (int, float)) else ""))
        return str(payload.get("result", ""))
