# -*- mode: python ; coding: utf-8 -*-
# One-file build:  pyinstaller FamilyMovieNight.spec
# Output: dist/FamilyMovieNight(.exe)   (macOS: also dist/FamilyMovieNight.app)
import sys

from PyInstaller.utils.hooks import collect_submodules

hiddenimports = (
    collect_submodules("keyring.backends")  # keyring picks its OS backend at runtime
    + ["PySide6.QtWebChannel", "PySide6.QtWebEngineCore", "PySide6.QtWebEngineWidgets"]
)

a = Analysis(
    ["run.py"],
    pathex=[],
    binaries=[],
    datas=[("movienight/web", "movienight/web")],
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "PySide6.Qt3DCore", "PySide6.QtQuick3D", "PySide6.QtCharts",
              "PySide6.QtDataVisualization"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="FamilyMovieNight",
    debug=False,
    strip=False,
    upx=False,  # UPX breaks Qt WebEngine binaries
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
)

if sys.platform == "darwin":
    app = BUNDLE(
        exe,
        name="FamilyMovieNight.app",
        bundle_identifier="lt.family.movienight",
        info_plist={"NSHighResolutionCapable": True, "LSApplicationCategoryType":
                    "public.app-category.entertainment"},
    )
