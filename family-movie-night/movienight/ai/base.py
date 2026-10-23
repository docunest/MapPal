"""Provider interface for AI movie suggestions.

A provider only turns (system, user) prompts into raw text. Parsing,
validation and de-duplication are shared, so adding a provider (DeepSeek,
a local model, a cloud function …) means writing one ``complete`` method.
"""

from __future__ import annotations

import json
import re
from typing import Any, Callable, Protocol

LogFn = Callable[[str], None]


class AIError(RuntimeError):
    """Failure with a user-facing Lithuanian message."""


class Provider(Protocol):
    id: str
    label: str

    def complete(self, system: str, user: str, log: LogFn) -> str: ...


def parse_json_array(text: str) -> list[Any]:
    """Extract the JSON array from a model reply (tolerates code fences / chatter)."""
    cleaned = re.sub(r"```(?:json)?", "", text).strip()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        start, end = cleaned.find("["), cleaned.rfind("]")
        if start == -1 or end <= start:
            raise AIError("AI atsakyme nerasta JSON masyvo.") from None
        try:
            data = json.loads(cleaned[start : end + 1])
        except json.JSONDecodeError as exc:
            raise AIError(f"AI grąžino netaisyklingą JSON: {exc.msg}.") from None
    if isinstance(data, dict):
        # Some models wrap the list: {"movies": [...]}
        lists = [v for v in data.values() if isinstance(v, list)]
        data = lists[0] if lists else [data]
    if not isinstance(data, list):
        raise AIError("AI atsakymas nėra JSON masyvas.")
    return data
