"""Main window: swipe deck (left, 40%) + browser sidebar (right, 60%)."""

from __future__ import annotations

from pathlib import Path

from PySide6.QtCore import Qt, QUrl
from PySide6.QtGui import QAction, QDesktopServices, QKeySequence
from PySide6.QtWebChannel import QWebChannel
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QMainWindow, QMessageBox, QSplitter, QTabWidget

from .. import APP_NAME, __version__
from ..ai import make_provider
from ..models import Movie
from ..paths import resource_path
from ..prompts import PromptStore
from ..settings import PROVIDERS, Settings
from ..state import DeckState
from ..storage import JsonFileStorage
from .bridge import DeckBridge
from .browser import BrowserPane, make_profile
from .lists_tab import ListsTab
from .settings_dialog import SettingsDialog
from .terminal_tab import TerminalTab
from .worker import SuggestWorker

IDLE, LOADING, ERROR = "idle", "loading", "error"


class MainWindow(QMainWindow):
    def __init__(self, data_dir: Path, profile_parent) -> None:
        super().__init__()
        self.data_dir = data_dir
        self.setWindowTitle(f"{APP_NAME} – Šeimos kino vakaras")
        self.resize(1440, 900)

        self.state = DeckState(JsonFileStorage(data_dir / "movienight.json"))
        self.prompts = PromptStore(data_dir / "prompts.json")
        self.settings_path = data_dir / "settings.json"
        self.settings = Settings.load(self.settings_path)

        self.ai_status = IDLE
        self.ai_message = ""
        self._worker: SuggestWorker | None = None
        self._sidebar_key: str | None = None

        # Left: tabs (deck / lists / AI terminal)
        self.bridge = DeckBridge(self)
        self.bridge.actionRequested.connect(self._on_deck_action)
        self.deck_view = QWebEngineView(self)
        self.channel = QWebChannel(self.deck_view.page())
        self.channel.registerObject("bridge", self.bridge)
        self.deck_view.page().setWebChannel(self.channel)
        self.deck_view.setUrl(QUrl.fromLocalFile(str(resource_path("web", "deck.html"))))

        self.lists_tab = ListsTab(self)
        self.lists_tab.openMovie.connect(self._open_in_sidebar)
        self.lists_tab.removeRequested.connect(self._remove_rating)
        self.lists_tab.moveRequested.connect(self._move_rating)
        self.lists_tab.undoRequested.connect(self._undo)
        self.lists_tab.resetRequested.connect(self._reset)

        self.terminal_tab = TerminalTab(self)
        self.terminal_tab.askRequested.connect(lambda wish: self.request_suggestions(wish))

        self.tabs = QTabWidget(self)
        self.tabs.addTab(self.deck_view, "🎴 Kortelės")
        self.tabs.addTab(self.lists_tab, "📋 Sąrašas")
        self.tabs.addTab(self.terminal_tab, "🤖 AI terminalas")
        self.tabs.currentChanged.connect(self._on_tab_changed)

        # Right: persistent browser
        self.profile = make_profile(data_dir, profile_parent)
        self.browser = BrowserPane(self.profile, self.state.imdb_ids.get, self)
        self.browser.imdbResolved.connect(self.state.set_imdb_id)

        splitter = QSplitter(Qt.Orientation.Horizontal, self)
        splitter.addWidget(self.tabs)
        splitter.addWidget(self.browser)
        splitter.setStretchFactor(0, 2)
        splitter.setStretchFactor(1, 3)
        splitter.setSizes([576, 864])
        self.setCentralWidget(splitter)

        self._build_menu()
        self.terminal_tab.set_provider(PROVIDERS[self.settings.provider][0])
        self.lists_tab.refresh(self.state)
        self._sync_sidebar()
        self.deck_view.setFocus()

    # ---- menu --------------------------------------------------------
    def _build_menu(self) -> None:
        menu = self.menuBar().addMenu("&Programa")
        settings = QAction("Nustatymai…", self)
        settings.setShortcut(QKeySequence("Ctrl+,"))
        settings.triggered.connect(self.open_settings)
        menu.addAction(settings)
        more = QAction("Paprašyti AI pasiūlymų", self)
        more.setShortcut(QKeySequence("Ctrl+R"))
        more.triggered.connect(lambda: self.request_suggestions())
        menu.addAction(more)
        folder = QAction("Atidaryti duomenų aplanką", self)
        folder.triggered.connect(
            lambda: QDesktopServices.openUrl(QUrl.fromLocalFile(str(self.data_dir)))
        )
        menu.addAction(folder)
        menu.addSeparator()
        reset = QAction("Pradėti iš naujo…", self)
        reset.triggered.connect(self._reset)
        menu.addAction(reset)
        menu.addSeparator()
        about = QAction("Apie", self)
        about.triggered.connect(self._about)
        menu.addAction(about)
        quit_action = QAction("Išeiti", self)
        quit_action.setShortcut(QKeySequence.StandardKey.Quit)
        quit_action.triggered.connect(self.close)
        menu.addAction(quit_action)

    # ---- deck <-> python ---------------------------------------------
    def deck_state(self) -> dict:
        top = self.state.top
        nxt = self.state.queue[1] if len(self.state.queue) > 1 else None
        return {
            "top": top.to_dict() if top else None,
            "next": nxt.to_dict() if nxt else None,
            "remaining": len(self.state.queue),
            "rated": len(self.state.ratings),
            "can_undo": self.state.can_undo(),
            "ai": {
                "status": self.ai_status,
                "message": self.ai_message,
                "label": PROVIDERS[self.settings.provider][0],
            },
        }

    def push_state(self) -> None:
        self.bridge.push(self.deck_state())
        self.lists_tab.refresh(self.state)
        self._sync_sidebar()

    def _sync_sidebar(self) -> None:
        top = self.state.top
        key = top.key if top else None
        if key != self._sidebar_key:
            self._sidebar_key = key
            if top:
                self.browser.show_movie(top)

    def _on_deck_action(self, name: str, data: dict) -> None:
        if name == "ready":
            self.push_state()
        elif name == "rate":
            if self.state.rate(str(data.get("key", "")), str(data.get("verdict", ""))):
                self._maybe_refill()
            self.push_state()
        elif name == "undo":
            self._undo()
        elif name in ("retry", "more"):
            self.request_suggestions()

    def _on_tab_changed(self, index: int) -> None:
        if self.tabs.widget(index) is self.deck_view:
            self.deck_view.setFocus()
            # Coming back from the lists: show the top card again.
            self._sidebar_key = None
            self._sync_sidebar()

    # ---- list actions ------------------------------------------------
    def _open_in_sidebar(self, movie: Movie) -> None:
        self._sidebar_key = movie.key
        self.browser.show_movie(movie)

    def _remove_rating(self, key: str) -> None:
        self.state.remove_rating(key)
        self.push_state()

    def _move_rating(self, key: str, verdict: str) -> None:
        self.state.change_verdict(key, verdict)
        self.push_state()

    def _undo(self) -> None:
        title = self.state.undo()
        if title:
            self.statusBar().showMessage(f"Atšaukta: {title}", 4000)
        self.push_state()

    def _reset(self) -> None:
        answer = QMessageBox.question(
            self,
            "Pradėti iš naujo",
            "Ištrinti visus įvertinimus ir sąrašus bei vėl pradėti nuo pradinio filmų sąrašo?",
        )
        if answer != QMessageBox.StandardButton.Yes:
            return
        self.state.reset()
        self.ai_status, self.ai_message = IDLE, ""
        self.push_state()
        self.statusBar().showMessage("Pradėta iš naujo", 4000)

    # ---- AI ----------------------------------------------------------
    def _maybe_refill(self) -> None:
        if self.settings.auto_refill and self.ai_status == IDLE and self.state.needs_refill():
            self.request_suggestions()

    def request_suggestions(self, wish: str | None = None) -> None:
        if self._worker is not None:
            return
        provider = make_provider(self.settings)
        self.ai_status, self.ai_message = LOADING, ""
        self.terminal_tab.set_busy(True)
        self.terminal_tab.append(f"▶ Prašoma pasiūlymų ({provider.label})"
                                 + (f" – pageidavimas: {wish}" if wish else ""))
        worker = SuggestWorker(
            provider, self.prompts, self.state.ai_context(), self.state.known_keys(), wish, self
        )
        worker.log.connect(self.terminal_tab.append)
        worker.succeeded.connect(self._on_suggestions)
        worker.failed.connect(self._on_suggest_failed)
        worker.finished.connect(self._on_worker_finished)
        self._worker = worker
        worker.start()
        self.push_state()

    def _on_suggestions(self, movies: list) -> None:
        added = self.state.append_movies(movies)
        if added:
            self.ai_status, self.ai_message = IDLE, ""
            self.statusBar().showMessage(f"🤖 Pridėta naujų filmų: {len(added)}", 5000)
        else:
            self.ai_status = ERROR
            self.ai_message = "AI pasiūlė tik jau matytus filmus."
        self.push_state()

    def _on_suggest_failed(self, message: str) -> None:
        self.ai_status, self.ai_message = ERROR, message
        self.push_state()

    def _on_worker_finished(self) -> None:
        if self._worker is not None:
            self._worker.deleteLater()
        self._worker = None
        self.terminal_tab.set_busy(False)

    # ---- dialogs -----------------------------------------------------
    def open_settings(self) -> None:
        dialog = SettingsDialog(self.settings, self.prompts, self)
        if dialog.exec():
            self.settings.save(self.settings_path)
            self.prompts.save()
            self.terminal_tab.set_provider(PROVIDERS[self.settings.provider][0])
            if self.ai_status == ERROR:
                self.ai_status, self.ai_message = IDLE, ""
            self.push_state()
            self.statusBar().showMessage("Nustatymai išsaugoti", 3000)
        else:
            # Dialog edits settings in place only on save; reload to drop half-edits.
            self.settings = Settings.load(self.settings_path)

    def _about(self) -> None:
        QMessageBox.about(
            self,
            "Apie",
            f"<b>{APP_NAME}</b> {__version__}<br>Šeimos kino vakaro filmų rinkiklis.<br><br>"
            f"Duomenys: <code>{self.data_dir}</code>",
        )

    def closeEvent(self, event) -> None:  # noqa: N802 (Qt API)
        if self._worker is not None:
            self._worker.wait(2000)
        super().closeEvent(event)
