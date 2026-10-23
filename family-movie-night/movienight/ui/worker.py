"""Background thread for AI suggestions."""

from __future__ import annotations

import traceback

from PySide6.QtCore import QThread, Signal

from ..ai import AIError, Provider, suggest_movies
from ..prompts import PromptStore


class SuggestWorker(QThread):
    log = Signal(str)
    succeeded = Signal(object)  # list[Movie]
    failed = Signal(str)

    def __init__(
        self,
        provider: Provider,
        prompts: PromptStore,
        context: dict[str, list[str]],
        known_keys: set[str],
        extra_request: str | None = None,
        parent=None,
    ) -> None:
        super().__init__(parent)
        self.provider = provider
        self.prompts = prompts
        self.context = context
        self.known_keys = known_keys
        self.extra_request = extra_request

    def run(self) -> None:
        try:
            movies = suggest_movies(
                self.provider, self.prompts, self.context, self.known_keys,
                self.log.emit, extra_request=self.extra_request,
            )
        except AIError as exc:
            self.log.emit(f"✗ {exc}")
            self.failed.emit(str(exc))
        except Exception as exc:  # never let the thread die silently
            self.log.emit(traceback.format_exc())
            self.failed.emit(f"Netikėta klaida: {exc}")
        else:
            self.succeeded.emit(movies)
