"""Editable prompt templates for AI movie hints.

Templates use ``$name`` placeholders (``string.Template``) so literal JSON braces
in the prompt text are safe. Users edit them in Settings → "Užklausos"; they are
stored in ``prompts.json`` next to the data file.
"""

from __future__ import annotations

import json
from pathlib import Path
from string import Template
from typing import Any

from .models import MIN_YEAR

PLACEHOLDERS = {
    "count": "kiek filmų prašyti",
    "min_year": "anksčiausi leidimo metai",
    "super_liked": "„Labai taip!“ sąrašas",
    "liked": "„Taip“ sąrašas",
    "seen_liked": "„Matėm, patiko“ sąrašas",
    "me_yes_kid_no": "„Aš taip, vaikas – ne“ sąrašas",
    "kid_yes_me_no": "„Vaikas taip, aš – ne“ sąrašas",
    "rejected": "„Ne“ sąrašas",
    "shown": "visi jau rodyti pavadinimai (negalima kartoti)",
}

DEFAULT_SYSTEM = """\
You recommend movies for a family movie night in Lithuania: two parents, teenagers \
and a 6-year-old who all watch together. You know films well beyond the usual \
top-10 lists and you answer ONLY with strict JSON."""

DEFAULT_USER = """\
Suggest $count movies for our next family movie night.

What we think so far:
- LOVED ("Labai taip!", strongest signal): $super_liked
- Liked ("Taip"): $liked
- Already seen and liked: $seen_liked
- The parent liked it but the kid did not ("Aš taip, vaikas – ne"): $me_yes_kid_no
- The kid liked it but the parent did not ("Vaikas taip, aš – ne"): $kid_yes_me_no
- Rejected ("Ne"): $rejected

Rules (all must hold):
1. Released $min_year or later.
2. Fun for all ages watching together – parents, teenagers and a 6-year-old.
3. Nothing scary for a 6-year-old (no horror, no intense peril, no frightening villains).
4. NO animated films without dialogue.
5. Favour lesser-known picks over the usual top-10 lists; mix animation and live action.
6. Never suggest any title from this already-shown list: $shown
7. Prefer films that both parents and kids would like – the "Aš taip, vaikas – ne" and \
"Vaikas taip, aš – ne" lists show where tastes split.

Write desc_lt, why_lt and kid_note_lt in natural Lithuanian:
- desc_lt: 1–2 sentence plot summary, no spoilers.
- why_lt: one line on why it fits THIS family, based on what we liked.
- kid_note_lt: one short note for the 6-year-old (scary moments, pace, songs …).

Reply with ONLY a JSON array, no markdown, no commentary:
[{"title": "Original English title", "year": 2021, "emoji": "🎬", \
"desc_lt": "...", "why_lt": "...", "kid_note_lt": "..."}]"""


DEFAULTS = {"system": DEFAULT_SYSTEM, "user": DEFAULT_USER, "count": 8}


class PromptStore:
    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self.system = DEFAULT_SYSTEM
        self.user = DEFAULT_USER
        self.count = 8
        self.load()

    def load(self) -> None:
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return
        self.system = str(data.get("system") or DEFAULT_SYSTEM)
        self.user = str(data.get("user") or DEFAULT_USER)
        try:
            self.count = max(1, min(20, int(data.get("count", 8))))
        except (TypeError, ValueError):
            self.count = 8

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps({"system": self.system, "user": self.user, "count": self.count},
                       ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def reset(self) -> None:
        self.system, self.user, self.count = DEFAULT_SYSTEM, DEFAULT_USER, 8
        self.save()

    def render(
        self, context: dict[str, Any], extra_request: str | None = None
    ) -> tuple[str, str]:
        """Return (system, user) with placeholders filled from ``DeckState.ai_context``.

        ``extra_request`` is a free-form wish typed in the AI terminal tab
        ("kažko apie dinozaurus"); it is appended after the template.
        """
        values: dict[str, str] = {"count": str(self.count), "min_year": str(MIN_YEAR)}
        for name, items in context.items():
            values[name] = "; ".join(items) if items else "(nieko)"
        user = Template(self.user).safe_substitute(values)
        if extra_request and extra_request.strip():
            user += (
                "\n\nExtra wish from the family for this round (follow it, but never "
                "break the safety rules or the JSON format):\n" + extra_request.strip()
            )
        return Template(self.system).safe_substitute(values), user
