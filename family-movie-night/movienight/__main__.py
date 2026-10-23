"""Entry point: ``python -m movienight``."""

from __future__ import annotations

import sys


def main() -> int:
    from PySide6.QtCore import QCoreApplication, Qt
    from PySide6.QtWidgets import QApplication

    from . import APP_ID, APP_NAME
    from .paths import app_data_dir

    QCoreApplication.setAttribute(Qt.ApplicationAttribute.AA_ShareOpenGLContexts)
    app = QApplication(sys.argv)
    app.setApplicationName(APP_ID)
    app.setApplicationDisplayName(APP_NAME)

    from .ui.main_window import MainWindow

    data_dir = app_data_dir()
    # The browser profile is parented to the app so it outlives the window's pages.
    window = MainWindow(data_dir, profile_parent=app)
    window.show()
    code = app.exec()
    del window
    return code


if __name__ == "__main__":
    sys.exit(main())
