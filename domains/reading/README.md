# Reading (Lithuanian reading game: attempts and parent summary)

What it does: stores one row per answer from the Ponas game `skaitymas`
(`docunest/ANDROID-APPS` → `ponas/games/skaitymas`), and shows the parent a summary
(first-try accuracy per syllable, weakest first, average answer time). Analysis
agents will read the same data later (MCP, not built yet).

Table: `reading_attempt` (Prisma model `ReadingAttempt`), RLS on, no policies.

## Endpoints (token: `Authorization: Bearer <READING_TOKEN>` or `?t=`)

- `POST /api/reading/attempts`: one attempt or `{ "attempts": [...] }` (max 50).
  Fields: `id` (8–64 chars, makes resends idempotent), `level` (1–5), `item`, `options`
  (1–9), `answer`, `correct`, `first_try`, `hint_used`, `response_ms`, `at`.
- `GET /api/reading/summary?days=14&level=1`: summary JSON.
- Page: `/reading?t=<READING_TOKEN>` (the token is kept on the device).

## Setup

- Set `READING_TOKEN` on Vercel. It is never committed. Without it every call is refused.
- The table is created by the migration `prisma/migrations/20261124200000_reading_attempt`
  when the app is deployed (`prisma migrate deploy` in the build).

## Rules

- Accuracy counts first tries only (a retry after a miss is not a success).
- A syllable is judged only after 3 rounds.
- Imports only `@/lib/db` and this domain. It never touches another domain's tables.

## Check it is alive

Summary with no data returns `attempts: 0`, `firstTryAccuracy: null`. Tests:
`node --import tsx --test domains/reading/test/domain.test.ts`.
