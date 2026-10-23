"""„AI terminalas“ tab: live log of every AI exchange plus a free-form request line."""

from __future__ import annotations

import time

from PySide6.QtCore import Signal
from PySide6.QtGui import QFont, QFontDatabase
from PySide6.QtWidgets import (
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPlainTextEdit,
    QPushButton,
    QVBoxLayout,
    QWidget,
)


class TerminalTab(QWidget):
    askRequested = Signal(str)  # free-form wish, may be empty

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self.provider_label = QLabel(self)
        self.output = QPlainTextEdit(self)
        self.output.setReadOnly(True)
        self.output.setMaximumBlockCount(5000)
        mono = QFontDatabase.systemFont(QFontDatabase.SystemFont.FixedFont)
        mono.setStyleHint(QFont.StyleHint.Monospace)
        self.output.setFont(mono)
        self.output.setStyleSheet(
            "QPlainTextEdit { background: #111; color: #d6f5d6; border-radius: 6px; padding: 6px; }"
        )

        self.input = QLineEdit(self)
        self.input.setPlaceholderText(
            "Pvz.: „ko nors apie dinozaurus“, „vaidybinio, ne animacinio“… (Enter – klausti)"
        )
        self.input.returnPressed.connect(self._ask)
        self.ask_btn = QPushButton("🤖 Klausti", self)
        self.ask_btn.clicked.connect(self._ask)
        clear_btn = QPushButton("Valyti", self)
        clear_btn.clicked.connect(self.output.clear)

        row = QHBoxLayout()
        row.addWidget(self.input, 1)
        row.addWidget(self.ask_btn)
        row.addWidget(clear_btn)

        layout = QVBoxLayout(self)
        layout.addWidget(self.provider_label)
        layout.addWidget(self.output, 1)
        layout.addLayout(row)

    def set_provider(self, label: str) -> None:
        self.provider_label.setText(f"Teikėjas: <b>{label}</b> · keičiamas Nustatymuose")

    def set_busy(self, busy: bool) -> None:
        self.ask_btn.setEnabled(not busy)
        self.input.setEnabled(not busy)

    def append(self, text: str) -> None:
        stamp = time.strftime("%H:%M:%S")
        self.output.appendPlainText(f"[{stamp}] {text}")
        bar = self.output.verticalScrollBar()
        bar.setValue(bar.maximum())

    def _ask(self) -> None:
        if self.ask_btn.isEnabled():
            self.askRequested.emit(self.input.text().strip())
