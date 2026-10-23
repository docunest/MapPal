"""Where the app keeps its files. Qt-free so the core can run anywhere."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from . import APP_ID


def app_data_dir() -> Path:
    """Per-user data directory; ``MOVIENIGHT_DATA_DIR`` overrides it."""
    override = os.environ.get("MOVIENIGHT_DATA_DIR")
    if override:
        path = Path(override)
    elif sys.platform == "win32":
        path = Path(os.environ.get("APPDATA") or Path.home() / "AppData" / "Roaming") / APP_ID
    elif sys.platform == "darwin":
        path = Path.home() / "Library" / "Application Support" / APP_ID
    else:
        base = os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share"
        path = Path(base) / "family-movie-night"
    path.mkdir(parents=True, exist_ok=True)
    return path


def resource_path(*parts: str) -> Path:
    """Path to a bundled resource, working both from source and a PyInstaller build."""
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))
    return base.joinpath("movienight", *parts)
