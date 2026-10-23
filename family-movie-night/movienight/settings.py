"""App settings (settings.json) and API keys (OS keyring)."""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path

KEYRING_SERVICE = "FamilyMovieNight"

# provider id -> (label, env var with the API key or None)
PROVIDERS = {
    "anthropic": ("Claude API (anthropic SDK)", "ANTHROPIC_API_KEY"),
    "claude_cli": ("Claude Code terminalas (claude -p)", None),
    "deepseek": ("DeepSeek API", "DEEPSEEK_API_KEY"),
}


@dataclass
class Settings:
    provider: str = "anthropic"
    anthropic_model: str = "claude-sonnet-5-5"
    anthropic_effort: str = "medium"
    claude_cli_path: str = "claude"
    claude_cli_model: str = "claude-sonnet-5-5"
    deepseek_model: str = "deepseek-chat"
    deepseek_base_url: str = "https://api.deepseek.com"
    auto_refill: bool = True

    @classmethod
    def load(cls, path: Path) -> "Settings":
        try:
            data = json.loads(Path(path).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return cls()
        known = {k: v for k, v in data.items() if k in cls.__dataclass_fields__}
        settings = cls(**known)
        if settings.provider not in PROVIDERS:
            settings.provider = "anthropic"
        return settings

    def save(self, path: Path) -> None:
        Path(path).write_text(json.dumps(asdict(self), indent=2), encoding="utf-8")


class KeyStoreError(RuntimeError):
    pass


def get_api_key(provider: str) -> str | None:
    """Environment variable first, then the OS keyring."""
    env_var = PROVIDERS.get(provider, ("", None))[1]
    if env_var and os.environ.get(env_var):
        return os.environ[env_var]
    try:
        import keyring

        return keyring.get_password(KEYRING_SERVICE, provider) or None
    except Exception:  # no keyring backend (e.g. headless Linux)
        return None


def set_api_key(provider: str, key: str | None) -> None:
    try:
        import keyring

        if key:
            keyring.set_password(KEYRING_SERVICE, provider, key)
        else:
            try:
                keyring.delete_password(KEYRING_SERVICE, provider)
            except keyring.errors.PasswordDeleteError:
                pass
    except Exception as exc:
        raise KeyStoreError(
            f"Nepavyko išsaugoti rakto OS raktų saugykloje: {exc}. "
            f"Galite nustatyti aplinkos kintamąjį {PROVIDERS[provider][1]}."
        ) from exc


def key_from_env(provider: str) -> bool:
    env_var = PROVIDERS.get(provider, ("", None))[1]
    return bool(env_var and os.environ.get(env_var))
