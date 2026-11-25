# Reading: word management design (proposed 2026-11-25, waiting for owner "go")

Owner's request (2026-11-25): a parent mode to manage the words all reading games use: a
scrollable list with photo, word, status, difficulty, grade and lesson count; review and add
words; pick the photo and the voice per word; record your own voice; approve. Words live in the
backend, can be managed from any device, and the games keep a heavy offline cache with auto-update.

## 1. What changes, in one picture

```
 Parent (phone / desktop / any browser)          Kid devices (Ponas tablet, phone web app)
 MapPal web app  /reading/words                   games/skaitymas (+ later other Ponas games)
        │  MapPal login                                   │  no login (trusted devices)
        ▼                                                 ▼
 /api/reading/words …  (manage)          /api/reading/content?v=…  (read, versioned)
 /api/reading/media/:hash (upload)       /api/reading/media/:hash  (immutable files)
        │                                                 │
        └────────────── domains/reading (MapPal) ─────────┘
                 Postgres: reading_word, reading_image, reading_audio,
                           reading_media (files), reading_attempt (exists)
```

- One word list in the backend for **all** games. The game file stops carrying words, photos
  and voices. It carries only a small built-in starter set, so it still works on first start
  with no internet.
- Games download the content once, keep it (heavy cache), use it offline, and check for a
  new content version when they start and every 15 minutes while online.

## 2. Data (backend, `reading_*` tables, RLS on)

| Table | Holds |
|---|---|
| `reading_word` | `text` (medis), `accented` (mẽdis: what the voices read), `syllables` (me-dis), `status`, `difficulty`, `grade_override`, `flags` (needs_better_image, not_ok), `groups` (five / pink / green + letter group), `updated_at` |
| `reading_image` | candidate photos per word: source (Commons, upload, camera), media hash, licence, author, source page, `selected` |
| `reading_audio` | clips per word × kind × voice: kind = **word** / **letters** / **syllables**; voice = azure-ona, azure-ona-hd, azure-leonas, offline, **parent**; media hash; `selected` per kind |
| `reading_media` | the files themselves (JPEG, MP3, recorded audio) by SHA-256, with content type |
| `reading_attempt` | exists; gains `word_id` so grades and lesson counts come from real answers |

**Why files in Postgres:** a word's files are small (photo ~20 KB, clip ~5–10 KB). 100 words
with three voices and three clip kinds is about 10 MB, well inside the free database. Using Supabase
Storage instead would need a new service key on Vercel; this needs nothing new. Files are served
by hash with "cache forever" headers, so every device downloads each file once.

### Status (Būsena)

| Status | Meaning | In games |
|---|---|---|
| **Naujas** | draft: just added, photo or voice not chosen yet | never shown |
| **Mokomės** | learning | normal |
| **Extra pamokos** | he struggles; focus here | about 3× as often |
| **Išmokta** | known well | now and then, as review (~⅓) |
| (not OK) | flag: the word is wrong or unusable | never shown, kept for the record |

**Approve** = a photo is selected **and** a word clip is selected → status moves Naujas → Mokomės.
The parent can set any status by hand at any time.

### Difficulty (Sunkumas): Lengvas / Vidutinis / Sunkus

Suggested when a word is added (the parent can change it):
- Lengvas: up to 4 letters, every letter one sound, no ą ę ė į ų ū č š ž.
- Vidutinis: 5 letters, or one of those letters.
- Sunkus: a letter pair (uo, ie, ai, au, ei, ui, dž, ch), a consonant cluster (str, kr…), or 6+ letters.

Games use it: easier words first in a session, sunkus words only once the level's difficulty is up.

### Grade (Pažymys): 1–3 suns, or a small grey bomb

From the word's last 6 first tries (a retry after a miss doesn't count):

| Grade | Rule |
|---|---|
| 3 suns | ≥ 90 % right |
| 2 suns | ≥ 70 % |
| 1 sun | ≥ 50 % |
| grey bomb | < 50 % with at least 3 tries |
| empty | fewer than 3 tries |

The bomb is drawn small, grey and plain (no explosion, no animation, no sound), so it is not a
prize. Suns are bright. The parent can override a grade; the override shows as such.

**Lesson count (Pamokos)** = how many rounds the word has been shown (from `reading_attempt`).

**Status suggestions:** when a word is at 3 suns for 2 sessions in a row, the list shows
"siūlau: Išmokta"; at the bomb, "siūlau: Extra pamokos". The parent taps to accept (see questions).

## 3. Voices

Three generated voices plus your own, for three kinds of clip per word:

| Kind | What it says | How it's made |
|---|---|---|
| **Žodis** | the whole word, with stress: "mẽdis" | Azure text-to-speech from `accented` |
| **Raidės** | letter by letter: "m – e – d – i – s" | joined from the 32 letter clips (one approved set per voice), with short pauses |
| **Skiemenys** | by syllable: "me – dis" | Azure, syllable by syllable with pauses |

- Voices: **Azure Ona, Azure Ona HD, Azure Leonas**. The old offline voice stays only as a fallback.
- Stress: `accented` comes from Wiktionary when the word is added. If Wiktionary doesn't have it,
  the list marks it "kirtis nepatikrintas" and the parent fixes it in the word screen.
- Files are generated **once** when a word is added or its stress changes, then stored as MP3.
  Games only ever play stored files.
- **Parent recording:** a record button per clip kind (phone microphone in the browser). The
  recording becomes one more option and can be selected like the others.

## 4. Parent screens (MapPal web app, `/reading/words`, MapPal login)

Works on phone and desktop. Lithuanian. No emojis: icons are simple drawings.

**List (Žodžiai)**: scrolls; each row shows
`[photo thumb] medis · Mokomės · Vidutinis · [3 sun icons] · 12 pamokų` (suns and bomb are drawn SVG icons).
- Filter chips: all / Naujas / Mokomės / Extra / Išmokta / not OK / "reikia geresnės nuotraukos".
- Sort: by status, by grade (worst first), by lessons, A–Z.
- Tap status, difficulty or grade right in the row to change it.
- "+ Naujas žodis" at the top.

**Word screen (Žodis)**:
1. **Photo:** all candidates as a grid, the selected one marked. "Reikia geresnės" flag.
   "Įkelti" (choose a file) and "Fotografuoti" (phone camera). The photo is made 480 px on the
   phone before upload, so uploads are small. "Ieškoti daugiau" fetches more Commons photos.
2. **Voice:** three rows: Žodis, Raidės, Skiemenys. Each has **▶ Groti visus**: it plays
   Ona → Ona HD → Leonas → your recording, highlighting the card that's playing, with its name.
   **Tap a card to choose it**: playback stops and that one is selected. **↻ Pakartoti** replays.
   **● Įrašyti** records your own.
3. **Word:** text, stress (accented form), syllables, difficulty, status, grade override, "ne OK".
4. **Patvirtinti** (approve): enabled when a photo and a word clip are chosen; moves to Mokomės.

**Add word:** type the word → the backend suggests stress (Wiktionary), syllables (Lithuanian
syllable rules), difficulty, photos (Wikipedia/Commons, one batch request) and generates the
voices → the word appears as **Naujas** for review.

## 5. Games: same words, heavy cache, auto-update

- `GET /api/reading/content` returns the version and every word that is Mokomės, Extra or Išmokta,
  with its selected photo and clip hashes. Open to read: the words and media are not private.
- The game stores the content list and every file it needs (Cache Storage, falling back to
  localStorage for the list), and starts from the cache with no internet. On start and every
  15 minutes while online, it asks "anything newer than version N?" and fetches only new files.
- Ponas tablet: games may already reach the MapPal host (`connect-src`), but `img-src` and
  `media-src` allow only the game itself. So the game fetches files with `fetch()` and shows them
  as blob URLs, which those rules allow. **No new APK is needed.**
- Word choice per round: weighted by status (Extra ×3, Mokomės ×1, Išmokta ×⅓), then the existing
  deck (cycle through all, misses come back sooner).
- Answers are still logged per word (`word_id`), which feeds the grades and lesson counts.

### Works with as little as one word

Every level asks for "up to N" options and takes what exists:
- Letter levels (A2, A3, B1, B2) fill decoys from the alphabet, so one word is enough.
- Picture choice (B3, B4) with one word shows one picture; with two, two; it never crashes or blocks.
- Letter groups (B5) offers the groups that exist, plus decoy groups from the fixed list.
- No approved words at all: the game uses its built-in starter set and says nothing to the child.
- Parent screens work with an empty list too (only "+ Naujas žodis" is shown).

## 6. API (all JSON; manage routes need the MapPal login, or an agent token from the existing
agent token system so a Claude session can import or fix words)

| Route | Does |
|---|---|
| `GET /api/reading/words` | list with grade, lesson count, thumb hash (filters, sort) |
| `POST /api/reading/words` | add a word → suggestions + generated voices, status Naujas |
| `GET/PATCH /api/reading/words/:id` | word screen data / change text, stress, syllables, status, difficulty, grade, flags, selections |
| `POST /api/reading/words/:id/images` | upload or camera photo (JPEG), or `{"search": true}` for more Commons photos |
| `POST /api/reading/words/:id/audio` | upload a parent recording for one clip kind |
| `POST /api/reading/words/:id/generate` | regenerate voices (after a stress or syllable change) |
| `GET /api/reading/content?v=` | game content (open) |
| `GET /api/reading/media/:hash` | a file, cached forever (open) |

## 7. Keys and costs

- Azure Speech key on **Vercel** (`READING_AZURE_SPEECH_KEY`, `READING_AZURE_SPEECH_REGION=swedencentral`),
  so adding a word from the phone generates its voices. Free tier (500,000 characters a month); a
  word with three kinds of clip in three voices is about 150 characters, so ~3,000 words a month.
- No new service, database or bucket. Files stay in the shared Postgres.
- Wiktionary and Wikipedia/Commons: free, anonymous, a few requests per word.

## 8. Build steps (each proven before the next)

1. Tables + migration; import the current 48 words, their stress, photos and voices (Ona as the
   default selection) as **Mokomės**; content + media routes.
2. Game reads words from the backend with the cache, auto-update and one-word fallbacks; the
   built-in starter set stays. Logs carry `word_id`.
3. Parent list: status, difficulty, grade, lessons, filters, inline changes.
4. Word screen: photos (select, flag, upload, camera, search), voices (play all, select, replay,
   record), approve.
5. Add word: suggestions + Azure generation on the server.
6. Grade and status suggestions from real answers.

Proof at each step: tests, the Ponas smoke and playthrough tests (with the backend mocked),
and the real page on the phone.
