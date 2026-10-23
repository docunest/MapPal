"""Deck state: queue, ratings, shown titles, undo. Pure Python, no Qt."""

from __future__ import annotations

import time
from typing import Any

from .models import (
    KID_YES_ME_NO,
    LATER,
    ME_YES_KID_NO,
    NO,
    SEEN_LIKED,
    SUPER,
    VERDICTS,
    WANT,
    Movie,
)
from .seed import seed_movies
from .storage import Storage

SCHEMA_VERSION = 2
LATER_OFFSET = 5  # a "later" card comes back after this many other cards

REFILL_MIN_RATINGS = 4
REFILL_MAX_REMAINING = 4


class DeckState:
    """All user selection data. Persisted after every change via ``Storage``."""

    def __init__(self, storage: Storage) -> None:
        self.storage = storage
        self.queue: list[Movie] = []
        self.ratings: list[dict[str, Any]] = []  # {"movie": {...}, "verdict": str, "ts": float}
        self.shown: dict[str, str] = {}  # key -> "Title (year)", every title ever queued
        self.imdb_ids: dict[str, str] = {}  # key -> "tt1234567", survives resets
        self._undo: list[tuple[str, Any]] = []
        self.load()

    # ---- persistence -------------------------------------------------
    def load(self) -> None:
        doc = self.storage.load()
        if not doc:
            self._reset_contents()
            self.save()
            return
        self.queue = [Movie.from_dict(m) for m in doc.get("queue", [])]
        self.ratings = [r for r in doc.get("ratings", []) if r.get("verdict") in VERDICTS]
        self.shown = dict(doc.get("shown", {}))
        self.imdb_ids = dict(doc.get("imdb_ids", {}))
        for movie in self.queue:
            self.shown.setdefault(movie.key, f"{movie.title} ({movie.year})")

    def to_document(self) -> dict[str, Any]:
        return {
            "version": SCHEMA_VERSION,
            "updated_at": time.time(),
            "queue": [m.to_dict() for m in self.queue],
            "ratings": self.ratings,
            "shown": self.shown,
            "imdb_ids": self.imdb_ids,
        }

    def save(self) -> None:
        self.storage.save(self.to_document())

    def _reset_contents(self) -> None:
        self.queue = seed_movies()
        self.ratings = []
        self.shown = {m.key: f"{m.title} ({m.year})" for m in self.queue}
        self._undo.clear()

    # ---- queries -----------------------------------------------------
    @property
    def top(self) -> Movie | None:
        return self.queue[0] if self.queue else None

    def known_keys(self) -> set[str]:
        return set(self.shown)

    def by_verdict(self, *verdicts: str) -> list[Movie]:
        return [Movie.from_dict(r["movie"]) for r in self.ratings if r["verdict"] in verdicts]

    def rating_index(self, key: str) -> int | None:
        for i, r in enumerate(self.ratings):
            if Movie.from_dict(r["movie"]).key == key:
                return i
        return None

    def needs_refill(self) -> bool:
        return len(self.ratings) >= REFILL_MIN_RATINGS and len(self.queue) <= REFILL_MAX_REMAINING

    def can_undo(self) -> bool:
        return bool(self._undo)

    # ---- mutations ---------------------------------------------------
    def rate(self, key: str, verdict: str) -> Movie | None:
        """Rate the top card. ``key`` guards against double-swipes on a stale card."""
        if verdict not in VERDICTS or not self.queue or self.queue[0].key != key:
            return None
        movie = self.queue.pop(0)
        if verdict == LATER:
            pos = min(LATER_OFFSET, len(self.queue))
            self.queue.insert(pos, movie)
            self._undo.append(("later", (movie, pos)))
        else:
            self.ratings.append({"movie": movie.to_dict(), "verdict": verdict, "ts": time.time()})
            self._undo.append(("rate", movie))
        self.save()
        return movie

    def remove_rating(self, key: str) -> bool:
        idx = self.rating_index(key)
        if idx is None:
            return False
        entry = self.ratings.pop(idx)
        self._undo.append(("remove", (idx, entry)))
        self.save()
        return True

    def change_verdict(self, key: str, verdict: str) -> bool:
        idx = self.rating_index(key)
        if idx is None or verdict not in VERDICTS or verdict == LATER:
            return False
        old = dict(self.ratings[idx])
        self.ratings[idx] = {**old, "verdict": verdict, "ts": time.time()}
        self._undo.append(("change", (idx, old)))
        self.save()
        return True

    def undo(self) -> str | None:
        """Undo the last swipe/remove. Returns the title it affected."""
        if not self._undo:
            return None
        kind, payload = self._undo.pop()
        if kind == "rate":
            movie: Movie = payload
            idx = self.rating_index(movie.key)
            if idx is not None:
                self.ratings.pop(idx)
            self.queue.insert(0, movie)
            title = movie.title
        elif kind == "later":
            movie, pos = payload
            if pos < len(self.queue) and self.queue[pos].key == movie.key:
                self.queue.pop(pos)
            self.queue.insert(0, movie)
            title = movie.title
        elif kind == "remove":
            idx, entry = payload
            self.ratings.insert(min(idx, len(self.ratings)), entry)
            title = entry["movie"]["title"]
        else:  # change
            idx, old = payload
            if idx < len(self.ratings):
                self.ratings[idx] = old
            title = old["movie"]["title"]
        self.save()
        return title

    def append_movies(self, movies: list[Movie]) -> list[Movie]:
        added = []
        for movie in movies:
            if movie.key in self.shown:
                continue
            self.shown[movie.key] = f"{movie.title} ({movie.year})"
            self.queue.append(movie)
            added.append(movie)
        if added:
            self.save()
        return added

    def reset(self) -> None:
        self._reset_contents()
        self.save()

    def set_imdb_id(self, key: str, imdb_id: str) -> None:
        if self.imdb_ids.get(key) != imdb_id:
            self.imdb_ids[key] = imdb_id
            self.save()

    # ---- AI context --------------------------------------------------
    def ai_context(self) -> dict[str, list[str]]:
        def names(*verdicts: str) -> list[str]:
            return [f"{m.title} ({m.year})" for m in self.by_verdict(*verdicts)]

        return {
            "super_liked": names(SUPER),
            "liked": names(WANT),
            "seen_liked": names(SEEN_LIKED),
            "me_yes_kid_no": names(ME_YES_KID_NO),
            "kid_yes_me_no": names(KID_YES_ME_NO),
            "rejected": names(NO),
            "shown": sorted(self.shown.values()),
        }
