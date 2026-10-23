"""Right-hand browser sidebar: IMDb / Letterboxd / YouTube for the current movie."""

from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import quote, quote_plus

from PySide6.QtCore import QTimer, QUrl, Signal
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import (
    QButtonGroup,
    QHBoxLayout,
    QLabel,
    QSizePolicy,
    QToolButton,
    QVBoxLayout,
    QWidget,
)
from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineProfile
from PySide6.QtWebEngineWidgets import QWebEngineView

from ..models import Movie

IMDB = "imdb"
LETTERBOXD = "letterboxd"
YOUTUBE = "youtube"

# JS run on a search page to find the first real result link.
_FIRST_LINK_JS = {
    IMDB: """(() => {
        if (!location.pathname.startsWith('/find')) return null;
        const sel = ['[data-testid="find-results-section-title"] a[href*="/title/tt"]',
                     '.find-result-item a[href*="/title/tt"]',
                     'main a[href*="/title/tt"]', 'a[href*="/title/tt"]'];
        for (const s of sel) { const a = document.querySelector(s); if (a) return a.href; }
        return null; })()""",
    LETTERBOXD: """(() => {
        if (!location.pathname.startsWith('/search/')) return null;
        const sel = ['.results .film-title-wrapper a[href*="/film/"]',
                     '.results a[href*="/film/"]', 'main a[href^="/film/"]'];
        for (const s of sel) { const a = document.querySelector(s); if (a) return a.href; }
        return null; })()""",
}
# × 500 ms. Polling starts right away instead of waiting for loadFinished: ad-heavy
# search pages may keep "loading" long after the results are visible.
_RESOLVE_POLLS = 40


def make_profile(data_dir: Path, parent) -> QWebEngineProfile:
    """Persistent profile so cookie banners / logins survive restarts."""
    storage = data_dir / "web-profile"
    cache = data_dir / "web-cache"
    storage.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    try:  # Qt ≥ 6.9
        from PySide6.QtWebEngineCore import QWebEngineProfileBuilder

        builder = QWebEngineProfileBuilder()
        builder.setPersistentStoragePath(str(storage))
        builder.setCachePath(str(cache))
        builder.setHttpCacheType(QWebEngineProfile.HttpCacheType.DiskHttpCache)
        builder.setPersistentCookiesPolicy(
            QWebEngineProfile.PersistentCookiesPolicy.ForcePersistentCookies
        )
        profile = builder.createProfile("FamilyMovieNight", parent)
    except ImportError:
        profile = QWebEngineProfile("FamilyMovieNight", parent)
        profile.setPersistentStoragePath(str(storage))
        profile.setCachePath(str(cache))
        profile.setHttpCacheType(QWebEngineProfile.HttpCacheType.DiskHttpCache)
        profile.setPersistentCookiesPolicy(
            QWebEngineProfile.PersistentCookiesPolicy.ForcePersistentCookies
        )
    profile.setHttpAcceptLanguage("lt-LT,lt;q=0.9,en;q=0.8")
    return profile


class SidebarPage(QWebEnginePage):
    """Opens target=_blank links in the same view instead of dropping them."""

    def createWindow(self, _type):  # noqa: N802 (Qt API)
        return self


def site_url(site: str, movie: Movie, imdb_id: str | None = None) -> str:
    query = f"{movie.title} {movie.year}"
    if site == IMDB:
        if imdb_id:
            return f"https://www.imdb.com/title/{imdb_id}/"
        return f"https://www.imdb.com/find/?q={quote_plus(query)}&s=tt"
    if site == LETTERBOXD:
        return f"https://letterboxd.com/search/films/{quote(query)}/"
    return f"https://www.youtube.com/results?search_query={quote_plus(query + ' trailer')}"


class BrowserPane(QWidget):
    imdbResolved = Signal(str, str)  # movie key, tt id
    pageInfo = Signal(str)

    def __init__(self, profile: QWebEngineProfile, imdb_lookup, parent=None) -> None:
        super().__init__(parent)
        self._imdb_lookup = imdb_lookup  # key -> tt id | None
        self.movie: Movie | None = None
        self.site = IMDB
        self._token = 0
        self._resolve: tuple[int, str, str] | None = None  # (token, site, key)
        self._polls = 0

        self.view = QWebEngineView(self)
        self.page = SidebarPage(profile, self.view)
        self.view.setPage(self.page)
        self.view.loadFinished.connect(self._on_load_finished)
        self.view.urlChanged.connect(self._on_url_changed)

        bar = QHBoxLayout()
        bar.setContentsMargins(6, 4, 6, 4)
        bar.setSpacing(4)

        def tool(text: str, tip: str, slot=None, checkable=False) -> QToolButton:
            btn = QToolButton(self)
            btn.setText(text)
            btn.setToolTip(tip)
            btn.setAutoRaise(True)
            btn.setCheckable(checkable)
            if slot:
                btn.clicked.connect(slot)
            bar.addWidget(btn)
            return btn

        self.back_btn = tool("◀", "Atgal", self.view.back)
        self.fwd_btn = tool("▶", "Pirmyn", self.view.forward)
        tool("⟳", "Perkrauti", self.view.reload)
        bar.addSpacing(8)

        self.site_group = QButtonGroup(self)
        self.site_group.setExclusive(True)
        for site, label, tip in (
            (IMDB, "IMDb", "Rodyti IMDb puslapį"),
            (LETTERBOXD, "Letterboxd", "Rodyti Letterboxd puslapį"),
            (YOUTUBE, "▶ Anonsas", "Ieškoti anonso YouTube"),
        ):
            btn = tool(label, tip, checkable=True)
            btn.setProperty("site", site)
            self.site_group.addButton(btn)
            if site == IMDB:
                btn.setChecked(True)
        self.site_group.buttonClicked.connect(lambda b: self.set_site(b.property("site")))

        bar.addSpacing(8)
        self.url_label = QLabel(self)
        self.url_label.setSizePolicy(QSizePolicy.Policy.Ignored, QSizePolicy.Policy.Preferred)
        self.url_label.setStyleSheet("color: palette(mid);")
        bar.addWidget(self.url_label, 1)
        tool("↗", "Atidaryti išorinėje naršyklėje",
             lambda: QDesktopServices.openUrl(self.view.url()))

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        layout.addLayout(bar)
        layout.addWidget(self.view, 1)

        self._poll_timer = QTimer(self)
        self._poll_timer.setInterval(500)
        self._poll_timer.timeout.connect(self._poll_first_result)
        self._update_nav()

    # ---- public API --------------------------------------------------
    def show_movie(self, movie: Movie | None) -> None:
        self.movie = movie
        self._load()

    def set_site(self, site: str) -> None:
        self.site = site
        for btn in self.site_group.buttons():
            btn.setChecked(btn.property("site") == site)
        self._load()

    # ---- internals ---------------------------------------------------
    def _load(self) -> None:
        self._token += 1
        self._poll_timer.stop()
        self._resolve = None
        if self.movie is None:
            self.view.setHtml("<p style='font-family:sans-serif;color:#888;padding:2em'>"
                              "Pasirinkite filmą.</p>")
            return
        imdb_id = self._imdb_lookup(self.movie.key) if self.site == IMDB else None
        url = site_url(self.site, self.movie, imdb_id)
        self.view.setUrl(QUrl(url))
        if self.site in _FIRST_LINK_JS and not imdb_id:
            self._resolve = (self._token, self.site, self.movie.key)
            self._polls = 0
            self._poll_timer.start()

    def _on_load_finished(self, ok: bool) -> None:
        self._update_nav()
        # A new page while still unresolved (e.g. after the user passed a
        # Cloudflare/WAF check) → look for the first result again.
        if ok and self._resolve and self._resolve[0] == self._token:
            self._polls = 0
            self._poll_timer.start()

    def _poll_first_result(self) -> None:
        if not self._resolve or self._resolve[0] != self._token:
            self._poll_timer.stop()
            return
        self._polls += 1
        if self._polls > _RESOLVE_POLLS:
            self._poll_timer.stop()  # leave the search results visible
            return
        token, site, key = self._resolve
        self.page.runJavaScript(
            _FIRST_LINK_JS[site], 0, lambda href: self._on_first_result(token, site, key, href)
        )

    def _on_first_result(self, token: int, site: str, key: str, href) -> None:
        if token != self._token or not self._resolve or not href:
            return
        self._poll_timer.stop()
        self._resolve = None
        if site == IMDB:
            match = re.search(r"/title/(tt\d+)", href)
            if match:
                self.imdbResolved.emit(key, match.group(1))
                href = f"https://www.imdb.com/title/{match.group(1)}/"
        self.view.setUrl(QUrl(href))

    def _on_url_changed(self, url: QUrl) -> None:
        self.url_label.setText(url.toString())
        self._update_nav()

    def _update_nav(self) -> None:
        history = self.view.history()
        self.back_btn.setEnabled(history.canGoBack())
        self.fwd_btn.setEnabled(history.canGoForward())
