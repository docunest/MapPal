"""AI suggestion providers and the shared suggestion pipeline."""

from __future__ import annotations

from ..paths import app_data_dir
from ..models import Movie, validate_and_dedupe
from ..prompts import PromptStore
from ..settings import Settings, get_api_key
from .anthropic_provider import AnthropicProvider
from .base import AIError, LogFn, Provider, parse_json_array
from .claude_cli_provider import ClaudeCliProvider
from .deepseek_provider import DeepSeekProvider

__all__ = ["AIError", "Provider", "make_provider", "suggest_movies"]


def make_provider(settings: Settings) -> Provider:
    if settings.provider == "claude_cli":
        return ClaudeCliProvider(
            settings.claude_cli_path, settings.claude_cli_model, cwd=str(app_data_dir())
        )
    if settings.provider == "deepseek":
        return DeepSeekProvider(
            get_api_key("deepseek"), settings.deepseek_model, settings.deepseek_base_url
        )
    return AnthropicProvider(
        get_api_key("anthropic"), settings.anthropic_model, settings.anthropic_effort
    )


def suggest_movies(
    provider: Provider,
    prompts: PromptStore,
    context: dict[str, list[str]],
    known_keys: set[str],
    log: LogFn,
    extra_request: str | None = None,
) -> list[Movie]:
    """Run one suggestion round: prompt → provider → parse → validate → dedupe."""
    system, user = prompts.render(context, extra_request)
    log("── SISTEMOS UŽKLAUSA ──\n" + system)
    log("── UŽKLAUSA ──\n" + user)
    text = provider.complete(system, user, log)
    log("── ATSAKYMAS ──\n" + text.strip())
    items = parse_json_array(text)
    movies, problems = validate_and_dedupe(items, known_keys, provider.id)
    for problem in problems:
        log(f"⚠ praleista: {problem}")
    if not movies:
        raise AIError(
            "AI nepasiūlė nė vieno naujo tinkamo filmo"
            + (f" ({len(problems)} atmesta)." if problems else ".")
        )
    log(f"✓ pridėta {len(movies)} naujų filmų")
    return movies
