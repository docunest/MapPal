"""Launcher used by `python run.py` and the PyInstaller build."""

import sys

from movienight.__main__ import main

if __name__ == "__main__":
    sys.exit(main())
