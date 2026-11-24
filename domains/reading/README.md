# Reading (Lithuanian reading game: answers and parent summary)

What it does: stores one row per answer from the Ponas game `skaitymas`
(`docunest/ANDROID-APPS` → `ponas/games/skaitymas`) and shows the parent a summary
(first-try accuracy per item, weakest first, average answer time, per level).

Table: `reading_attempt` (Prisma model `ReadingAttempt`), RLS on, no policies.

## Who can do what (owner 2026-11-25: trusted devices, no extra token)

- The game posts answers to `POST /api/reading/attempts` with no token. The server only checks
  that each answer is well-formed.
- The summary (`/reading`, `GET /api/reading/summary`) is behind the normal MapPal login.
- `GET /api/reading/health` is public: `{ ok, db, version }`, no data.

## Endpoints

- `POST /api/reading/attempts`: one attempt or `{ "attempts": [...] }` (max 50). CORS open (the game
  runs on its own origin). Fields: `id` (8–64 chars, makes resends idempotent), `level` (1–99: A
  levels 1–3, Montessori 11–15), `item`, `options` (0–32), `answer`, `correct`, `first_try`,
  `hint_used`, `response_ms`, `at`, optional `letter_ok` (per-letter result, e.g. `"11011"`).
- `GET /api/reading/summary?days=14&level=1`: summary JSON (logged-in MapPal session).
- Page: `/reading`.

The table comes from the migrations in `prisma/migrations/` on deploy (`prisma migrate deploy`).

## Rules

- Accuracy counts first tries only (a retry after a miss is not a success).
- An item is judged weak only after 3 rounds.
- Imports only `@/lib/db` and this domain. It never touches another domain's tables.

## Check it is alive

`GET /api/reading/health` returns `{"ok":true,"db":true,…}`. Tests:
`node --import tsx --test domains/reading/test/domain.test.ts`.
