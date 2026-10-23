"""Persistence behind a tiny interface so the JSON file can later become a cloud DB.

To move to the cloud, implement ``Storage`` (e.g. ``FirestoreStorage``,
``SupabaseStorage``) and pass it to ``DeckState``. The document shape is the
plain dict described in ``DeckState.to_document``.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any, Protocol


class Storage(Protocol):
    def load(self) -> dict[str, Any] | None: ...

    def save(self, document: dict[str, Any]) -> None: ...


class JsonFileStorage:
    """Stores the whole document in one human-readable, portable JSON file."""

    def __init__(self, path: Path) -> None:
        self.path = Path(path)

    def load(self) -> dict[str, Any] | None:
        if not self.path.exists():
            return None
        try:
            with self.path.open(encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, json.JSONDecodeError):
            # Keep the broken file for inspection instead of silently losing it.
            backup = self.path.with_suffix(".broken.json")
            try:
                os.replace(self.path, backup)
            except OSError:
                pass
            return None
        return data if isinstance(data, dict) else None

    def save(self, document: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(prefix=".movienight-", suffix=".json", dir=self.path.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(document, fh, ensure_ascii=False, indent=2)
            os.replace(tmp, self.path)
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise


class MemoryStorage:
    """In-memory storage for tests."""

    def __init__(self) -> None:
        self.document: dict[str, Any] | None = None

    def load(self) -> dict[str, Any] | None:
        return json.loads(json.dumps(self.document)) if self.document else None

    def save(self, document: dict[str, Any]) -> None:
        self.document = json.loads(json.dumps(document))
