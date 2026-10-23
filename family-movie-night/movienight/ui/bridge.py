"""QWebChannel object exposed to deck.js as ``bridge``."""

from __future__ import annotations

import json

from PySide6.QtCore import QObject, Signal, Slot


class DeckBridge(QObject):
    # Python → JS: full deck state as JSON.
    stateChanged = Signal(str)
    # JS → Python, re-emitted as a Qt signal for the main window.
    actionRequested = Signal(str, dict)

    @Slot(str, str)
    def action(self, name: str, payload: str) -> None:
        try:
            data = json.loads(payload) if payload else {}
        except json.JSONDecodeError:
            data = {}
        self.actionRequested.emit(name, data if isinstance(data, dict) else {})

    def push(self, state: dict) -> None:
        self.stateChanged.emit(json.dumps(state, ensure_ascii=False))
