"""„Sąrašas“ tab: want-to-watch, seen and split-vote lists."""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QHBoxLayout,
    QMenu,
    QPushButton,
    QTreeWidget,
    QTreeWidgetItem,
    QVBoxLayout,
    QWidget,
)

from ..models import (
    KID_YES_ME_NO,
    ME_YES_KID_NO,
    NO,
    SEEN_LIKED,
    SUPER,
    VERDICT_LABELS_LT,
    WANT,
    LATER,
    Movie,
)
from ..state import DeckState

# (group title, verdicts, expanded by default)
GROUPS = [
    ("🍿 Norim pažiūrėti", (SUPER, WANT), True),
    ("👀 Matėm, patiko", (SEEN_LIKED,), True),
    ("🧑 Aš taip, vaikas – ne", (ME_YES_KID_NO,), True),
    ("🧒 Vaikas taip, aš – ne", (KID_YES_ME_NO,), True),
    ("✖ Atmesti", (NO,), False),
]
_KEY_ROLE = Qt.ItemDataRole.UserRole
_MOVIE_ROLE = Qt.ItemDataRole.UserRole + 1


class ListsTab(QWidget):
    openMovie = Signal(object)  # Movie
    removeRequested = Signal(str)
    moveRequested = Signal(str, str)  # key, verdict
    undoRequested = Signal()
    resetRequested = Signal()

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self.tree = QTreeWidget(self)
        self.tree.setHeaderHidden(True)
        self.tree.setRootIsDecorated(True)
        self.tree.itemClicked.connect(self._on_clicked)
        self.tree.itemActivated.connect(self._on_clicked)
        self.tree.currentItemChanged.connect(lambda *_: self._update_buttons())
        self.tree.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.tree.customContextMenuRequested.connect(self._context_menu)
        self._expanded = {title: exp for title, _, exp in GROUPS}

        self.remove_btn = QPushButton("Pašalinti", self)
        self.remove_btn.clicked.connect(self._remove)
        self.move_btn = QPushButton("Perkelti į…", self)
        self.move_btn.setMenu(self._move_menu())
        self.undo_btn = QPushButton("↶ Atšaukti", self)
        self.undo_btn.clicked.connect(self.undoRequested)
        reset_btn = QPushButton("Pradėti iš naujo", self)
        reset_btn.clicked.connect(self.resetRequested)

        buttons = QHBoxLayout()
        buttons.addWidget(self.remove_btn)
        buttons.addWidget(self.move_btn)
        buttons.addWidget(self.undo_btn)
        buttons.addStretch(1)
        buttons.addWidget(reset_btn)

        layout = QVBoxLayout(self)
        layout.addWidget(self.tree, 1)
        layout.addLayout(buttons)
        self._update_buttons()

    def refresh(self, state: DeckState) -> None:
        current = self._current_key()
        for i in range(self.tree.topLevelItemCount()):
            item = self.tree.topLevelItem(i)
            self._expanded[item.data(0, _KEY_ROLE)] = item.isExpanded()
        self.tree.clear()
        for title, verdicts, _ in GROUPS:
            entries = [r for r in state.ratings if r["verdict"] in verdicts]
            entries.sort(key=lambda r: (verdicts.index(r["verdict"]), -r.get("ts", 0)))
            group = QTreeWidgetItem([f"{title} ({len(entries)})"])
            group.setData(0, _KEY_ROLE, title)
            group.setFlags(Qt.ItemFlag.ItemIsEnabled)
            font = group.font(0)
            font.setBold(True)
            group.setFont(0, font)
            self.tree.addTopLevelItem(group)
            for entry in entries:
                movie = Movie.from_dict(entry["movie"])
                star = "⭐ " if entry["verdict"] == SUPER else ""
                child = QTreeWidgetItem([f"{star}{movie.emoji} {movie.title} ({movie.year})"])
                child.setToolTip(0, movie.desc_lt)
                child.setData(0, _KEY_ROLE, movie.key)
                child.setData(0, _MOVIE_ROLE, movie)
                group.addChild(child)
                if movie.key == current:
                    self.tree.setCurrentItem(child)
            group.setExpanded(self._expanded.get(title, True))
        self.undo_btn.setEnabled(state.can_undo())
        self._update_buttons()

    # ---- internals ---------------------------------------------------
    def _current_key(self) -> str | None:
        item = self.tree.currentItem()
        return item.data(0, _KEY_ROLE) if item and item.parent() else None

    def _update_buttons(self) -> None:
        has = self._current_key() is not None
        self.remove_btn.setEnabled(has)
        self.move_btn.setEnabled(has)

    def _on_clicked(self, item: QTreeWidgetItem, _col: int = 0) -> None:
        movie = item.data(0, _MOVIE_ROLE)
        if movie is not None:
            self.openMovie.emit(movie)

    def _remove(self) -> None:
        key = self._current_key()
        if key:
            self.removeRequested.emit(key)

    def _move_menu(self) -> QMenu:
        menu = QMenu(self)
        for verdict, label in VERDICT_LABELS_LT.items():
            if verdict == LATER:
                continue
            action = menu.addAction(label)
            action.triggered.connect(lambda _=False, v=verdict: self._move(v))
        return menu

    def _move(self, verdict: str) -> None:
        key = self._current_key()
        if key:
            self.moveRequested.emit(key, verdict)

    def _context_menu(self, pos) -> None:
        item = self.tree.itemAt(pos)
        if not item or not item.parent():
            return
        self.tree.setCurrentItem(item)
        menu = QMenu(self)
        menu.addAction("Rodyti dešinėje", lambda: self._on_clicked(item))
        menu.addAction("Pašalinti", self._remove)
        menu.addMenu(self._move_menu()).setText("Perkelti į…")
        menu.exec(self.tree.viewport().mapToGlobal(pos))
