# 🍿 Family Movie Night – Šeimos kino vakaras

A Tinder-style desktop picker for family movies (parents, teenagers and a 6-year-old,
Lithuania). The UI is in Lithuanian. Swipe through movie cards on the left. The right
pane is a real browser that follows the current card on IMDb, Letterboxd or YouTube.
When the deck runs low, an AI suggests new movies based on how you rated the earlier ones.

## Features

- **Swipe deck** (left, about 40%): a local HTML/JS page in a `QWebEngineView`. It talks to
  Python through `QWebChannel`. Each card shows the title, year, a Lithuanian description,
  „Kodėl tinka“ (why it fits) and a note for the 6-year-old.
- **Seven verdicts**, available as buttons, keys and swipes:

  | Verdict | Swipe | Key |
  |---|---|---|
  | ✖ Ne | ← drag left | ← or 1 |
  | ❤ Taip | → drag right | → or 2 |
  | ⭐ Labai taip! | – | S, Shift+→ or 3 |
  | ⏳ Nežinau – palikti vėliau (the card comes back after 5 others) | ↓ drag down | ↓ or 4 |
  | 👀 Matėm, patiko | ↑ drag up | ↑ or 5 |
  | 🧑 Aš taip, vaikas – ne | – | A or 6 |
  | 🧒 Vaikas taip, aš – ne | – | V or 7 |

  Backspace or Ctrl+Z undoes the last action.
- **Browser sidebar** (right, about 60%):
  - Resolves IMDb through `imdb.com/find/?q=<title>+<year>&s=tt` and opens the first title result.
    The tt-id is cached, so the next visit opens the page directly.
  - The toolbar has back, forward, reload, IMDb / Letterboxd / ▶ Anonsas (YouTube trailer
    search) toggles, and "open in external browser".
  - It uses a persistent `QWebEngineProfile` (cookies and cache in the app data dir), so cookie
    banners and "are you human" checks only need to be passed once.
- **„Sąrašas“ tab**: lists for Norim pažiūrėti (super-yes first), Matėm, patiko,
  Aš taip, vaikas – ne, Vaikas taip, aš – ne, and Atmesti.
  - Click an item to open it in the right pane.
  - Pašalinti removes an item, Perkelti į… moves it to another list, and ↶ Atšaukti undoes.
  - „Pradėti iš naujo“ resets everything.
- **AI suggestions**:
  - Triggered after 4 or more ratings, when 4 or fewer cards are left (or on demand: 🤖 button or Ctrl+R).
  - Runs in a background `QThread`. The deck shows a spinner card while it works, and a clear
    error with a "Bandyti dar kartą" (retry) button if it fails.
  - Output is strict JSON `[{title, year, emoji, desc_lt, why_lt, kid_note_lt}]`. It is
    validated (year 2018 or later, required fields), de-duplicated against every title
    already shown, and appended to the deck.
- **„AI terminalas“ tab** shows each AI exchange live: the exact prompt, the command, and the
  raw reply. It also has a request line, e.g. „ko nors apie dinozaurus“ ("something about
  dinosaurs"). That wish is added to the prompt for one round.
- **Three AI providers**, switchable in *Programa → Nustatymai*:
  - **Claude API**: the official `anthropic` SDK, model `claude-sonnet-5-5` by default.
    Server-side refusal fallbacks are enabled (`fallbacks="default"`).
  - **Claude Code terminalas**: runs `claude -p` and uses whatever login your local Claude
    Code has (Pro/Max subscription or API key).
  - **DeepSeek**: plain HTTPS to `api.deepseek.com/chat/completions`, model `deepseek-chat`.
- **Editable prompts**: *Nustatymai → Užklausos* edits the system prompt and the main prompt,
  using `$liked`, `$rejected`, `$shown` and similar placeholders. It can also reset to the defaults.

## Setup and run

You need Python 3.11 or newer. The project lives in this folder (`family-movie-night/`).

### Windows (PowerShell)

```powershell
cd family-movie-night
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:ANTHROPIC_API_KEY = "sk-ant-..."   # optional – or enter it in Nustatymai
python run.py
```

### macOS

```bash
cd family-movie-night
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...      # optional – or enter it in Nustatymai
python run.py
```

### Linux

```bash
cd family-movie-night
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py
```

On minimal installs, Qt WebEngine needs a few system libraries. On Debian/Ubuntu:
`sudo apt install libegl1 libgl1 libnss3 libxkbcommon-x11-0 libxcb-cursor0 libxcb-xkb1
libxcomposite1 libxdamage1 libxrandr2 libxtst6 libasound2t64 fonts-noto-color-emoji`.
To store keys, `keyring` needs a Secret Service backend (GNOME Keyring or KWallet). Without
one, use the `ANTHROPIC_API_KEY` / `DEEPSEEK_API_KEY` environment variables.

`python -m movienight` also works.

### API keys

- **Claude API:** the `ANTHROPIC_API_KEY` env var wins. Otherwise the app uses the key saved
  in *Nustatymai*, which is stored in the OS keyring (Windows Credential Manager, macOS
  Keychain, Secret Service), never in a file.
- **Claude Code terminalas:** install [Claude Code](https://claude.com/claude-code) and run
  `claude` once to log in. No key is needed in this app.
- **DeepSeek:** use `DEEPSEEK_API_KEY` or enter the key in *Nustatymai*.

## One-file build (PyInstaller)

```bash
pip install -r requirements-dev.txt
pyinstaller FamilyMovieNight.spec
```

The result is `dist/FamilyMovieNight` (`.exe` on Windows; macOS also gets
`dist/FamilyMovieNight.app`).
- Build on each OS for that OS; PyInstaller does not cross-compile.
- Expect about 250 MB, because Qt WebEngine bundles Chromium.
- The first start of a one-file build is slow, because it unpacks to a temp folder.

## Where data lives

| OS | Folder |
|---|---|
| Windows | `%APPDATA%\FamilyMovieNight\` |
| macOS | `~/Library/Application Support/FamilyMovieNight/` |
| Linux | `~/.local/share/family-movie-night/` |

Set `MOVIENIGHT_DATA_DIR` to use another folder (handy for testing or a synced folder).
*Programa → Atidaryti duomenų aplanką* opens it.

- `movienight.json`: all your selection data (queue, ratings, every title already shown,
  cached IMDb ids). It is plain, portable JSON, so you can copy it between machines.
- `prompts.json`: your edited prompts.
- `settings.json`: provider and model choice (no secrets).
- `web-profile/`, `web-cache/`: the browser sidebar's cookies and cache.

## Project layout and future ports

```
movienight/
  models.py  seed.py  state.py  storage.py  prompts.py  settings.py   ← pure Python, no Qt
  ai/        anthropic_provider.py  claude_cli_provider.py  deepseek_provider.py
  web/       deck.html  deck.css  deck.js                              ← portable swipe UI
  ui/        main_window.py  browser.py  lists_tab.py  terminal_tab.py  settings_dialog.py
tests/       test_core.py
```

- **Cloud DB later:** `storage.py` defines a two-method `Storage` protocol (`load()` /
  `save(document)`). Today `JsonFileStorage` implements it. Add, say, a `FirestoreStorage`
  or `SupabaseStorage` with the same document shape, and pass it to `DeckState`.
- **Android later:** the core modules have no Qt dependency. The swipe deck only talks to
  `window.MovieBridge.send(action, payload)` and receives state through
  `window.__movieNightPushState(json)`. An Android `WebView` can load the same `web/` files
  and use `addJavascriptInterface` (as `AndroidBridge.action(name, json)`).
- **Another AI provider:** implement `complete(system, user, log) -> str` (see `ai/base.py`)
  and register it in `ai/__init__.py` and `settings.PROVIDERS`. Parsing, validation and
  de-duplication are shared.

## Tests

```bash
python -m unittest discover -s tests
```
