"""Movie records and validation of AI output."""

from __future__ import annotations

import datetime as _dt
import re
import unicodedata
from dataclasses import asdict, dataclass, field
from typing import Any, Iterable

MIN_YEAR = 2018

# Verdicts a card can get. LATER is not stored as a rating: the card goes back into the deck.
NO = "no"
WANT = "want"
SUPER = "super"
LATER = "later"
ME_YES_KID_NO = "me_yes_kid_no"
KID_YES_ME_NO = "kid_yes_me_no"
SEEN_LIKED = "seen_liked"
VERDICTS = (NO, WANT, SUPER, LATER, ME_YES_KID_NO, KID_YES_ME_NO, SEEN_LIKED)

VERDICT_LABELS_LT = {
    SUPER: "Labai taip!",
    WANT: "Taip",
    NO: "Ne",
    LATER: "Nežinau – palikti vėliau",
    ME_YES_KID_NO: "Aš taip, vaikas – ne",
    KID_YES_ME_NO: "Vaikas taip, aš – ne",
    SEEN_LIKED: "Matėm, patiko",
}


def title_key(title: str) -> str:
    """Normalised title used for de-duplication ("The Wild Robot" == "wild robot!")."""
    text = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode().lower()
    text = text.replace("&", "and")
    text = re.sub(r"^(the|a|an)\s+", "", text.strip())
    return re.sub(r"[^a-z0-9]+", "", text)


@dataclass
class Movie:
    title: str
    year: int
    emoji: str = "🎬"
    desc_lt: str = ""
    why_lt: str = ""
    kid_note_lt: str = ""
    source: str = "seed"  # "seed" or the AI provider id
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def key(self) -> str:
        return title_key(self.title)

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["key"] = self.key
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Movie":
        return cls(
            title=str(data["title"]),
            year=int(data["year"]),
            emoji=str(data.get("emoji") or "🎬"),
            desc_lt=str(data.get("desc_lt") or ""),
            why_lt=str(data.get("why_lt") or ""),
            kid_note_lt=str(data.get("kid_note_lt") or ""),
            source=str(data.get("source") or "seed"),
            extra=dict(data.get("extra") or {}),
        )


class ValidationError(ValueError):
    pass


def _clean_text(value: Any, limit: int = 400) -> str:
    text = " ".join(str(value or "").split())
    return text[:limit]


def validate_suggestion(item: Any, source: str) -> Movie:
    """Turn one raw AI object into a Movie or raise ValidationError."""
    if not isinstance(item, dict):
        raise ValidationError("ne objektas")
    title = _clean_text(item.get("title"), 120)
    if not title:
        raise ValidationError("trūksta pavadinimo")
    try:
        year = int(str(item.get("year")).strip()[:4])
    except (TypeError, ValueError):
        raise ValidationError(f"{title}: neteisingi metai") from None
    if year < MIN_YEAR or year > _dt.date.today().year + 1:
        raise ValidationError(f"{title}: metai {year} už ribų")
    desc = _clean_text(item.get("desc_lt"))
    if not desc:
        raise ValidationError(f"{title}: trūksta aprašymo")
    emoji = _clean_text(item.get("emoji"), 8) or "🎬"
    return Movie(
        title=title,
        year=year,
        emoji=emoji,
        desc_lt=desc,
        why_lt=_clean_text(item.get("why_lt")),
        kid_note_lt=_clean_text(item.get("kid_note_lt")),
        source=source,
    )


def validate_and_dedupe(
    items: Iterable[Any], known_keys: set[str], source: str
) -> tuple[list[Movie], list[str]]:
    """Validate AI items and drop anything already shown. Returns (movies, problems)."""
    movies: list[Movie] = []
    problems: list[str] = []
    seen = set(known_keys)
    for item in items:
        try:
            movie = validate_suggestion(item, source)
        except ValidationError as exc:
            problems.append(str(exc))
            continue
        if movie.key in seen:
            problems.append(f"{movie.title}: jau rodytas")
            continue
        seen.add(movie.key)
        movies.append(movie)
    return movies, problems
