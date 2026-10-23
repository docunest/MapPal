"""Family Movie Night – a Tinder-style family movie picker.

Package layout (the split matters for a later Android / cloud port):

* ``models``, ``seed``, ``state``, ``storage``, ``prompts``, ``settings``, ``ai`` –
  pure Python, no Qt imports. Reusable from any frontend (Kivy/BeeWare/Chaquopy
  on Android, a web backend, tests).
* ``web/`` – the swipe deck as a plain HTML/JS page. It talks to the host through
  a tiny adapter (``window.MovieBridge``), so it can be dropped into an Android
  WebView with a different bridge.
* ``ui/`` – the PySide6 desktop shell.
"""

APP_NAME = "Family Movie Night"
APP_ID = "FamilyMovieNight"
__version__ = "1.0.0"
