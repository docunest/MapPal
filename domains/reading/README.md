# Reading (Lithuanian reading game: attempts and parent summary)

What it does: stores one row per answer from the Ponas game `skaitymas`
(`docunest/ANDROID-APPS` → `ponas/games/skaitymas`), and shows the parent a summary
(first-try accuracy per syllable, weakest first, average answer time). Analysis
agents will read the same data later (MCP, not built yet).

Tables: `reading_attempt` (answers) and `reading_device` (SHA-256 of the token), RLS on, no policies.

## Endpoints (one token: `Authorization: Bearer <token>` or `?t=`)

- `POST /api/reading/attempts`: one attempt or `{ "attempts": [...] }` (max 50).
  Fields: `id` (8–64 chars, makes resends idempotent), `level` (1–5), `item`, `options`
  (1–9), `answer`, `correct`, `first_try`, `hint_used`, `response_ms`, `at`.
- `GET /api/reading/summary?days=14&level=1`: summary JSON.
- Page: `/reading?t=<token>` (the token is kept on the device).

## Setup and rotation

- Create the token (admin secret needed, returned once):
  `curl -X POST https://<site>/api/reading/admin/token -H "x-admin-secret: $ADMIN_SEED_SECRET"`
- Calling it again replaces the token, and the old one stops working at once.
- Only the SHA-256 is stored, in `reading_device` (one row).
- Tables `reading_attempt` and `reading_device` come from the migrations in
  `prisma/migrations/` when the app is deployed.

## Rules

- Accuracy counts first tries only (a retry after a miss is not a success).
- A syllable is judged only after 3 rounds.
- Imports only `@/lib/db` and this domain. It never touches another domain's tables.

## Check it is alive

Summary with no data returns `attempts: 0`, `firstTryAccuracy: null`. Tests:
`node --import tsx --test domains/reading/test/domain.test.ts`.
