# Reading (Lithuanian reading game: attempts and parent summary)

What it does: stores one row per answer from the Ponas game `skaitymas`
(`docunest/ANDROID-APPS` → `ponas/games/skaitymas`), and shows the parent a summary
(first-try accuracy per syllable, weakest first, average answer time). Analysis
agents will read the same data later (MCP, not built yet).

Tables: `reading_attempt` (answers) and `reading_device` (SHA-256 of each device token), RLS on, no policies.

## Endpoints (device token: `Authorization: Bearer <token>` or `?t=`)

- `POST /api/reading/attempts`: one attempt or `{ "attempts": [...] }` (max 50).
  Fields: `id` (8–64 chars, makes resends idempotent), `level` (1–5), `item`, `options`
  (1–9), `answer`, `correct`, `first_try`, `hint_used`, `response_ms`, `at`.
- `GET /api/reading/summary?days=14&level=1`: summary JSON.
- Page: `/reading?t=<token>` (the token is kept on the device).

## Setup

- Issue a device token (run locally with `DATABASE_URL` set):
  `npm run reading:device -- add tablet`. The token is printed once. Only its SHA-256 is stored.
  Also: `... -- list`, `... -- revoke <name>`.
- Tables `reading_attempt` and `reading_device` are created by the migrations in
  `prisma/migrations/` when the app is deployed (`prisma migrate deploy` in the build).
- Unknown, revoked or missing tokens get 401.

## Rules

- Accuracy counts first tries only (a retry after a miss is not a success).
- A syllable is judged only after 3 rounds.
- Imports only `@/lib/db` and this domain. It never touches another domain's tables.

## Check it is alive

Summary with no data returns `attempts: 0`, `firstTryAccuracy: null`. Tests:
`node --import tsx --test domains/reading/test/domain.test.ts`.
