# Pirkiniai — family grocery list

A shared shopping list for a few phones. Lithuanian first, English mixed in.
It is a self-contained **module of MapPal** (same Vercel project, same deploy,
same Supabase project; owner 2026-11-20, AGENTS.md G6). It lives at `/grocery`
and has its own token auth, its own `grocery_*` tables and enums, and no imports
from MapPal code except the shared Prisma client (`lib/db.ts`). See "Removing it" below.

**Open it:** `<MapPal URL>/grocery?t=<family token>` (the live URL and the token are not kept in the repo; ask the owner).

## What it does

| Job | How |
| --- | --- |
| **Plan** without typing | Type `pi` and pick **pienas**. Autocomplete runs on the phone over the family catalog (about 250 seeded items plus everything you ever added), ranked by how often you buy each thing. It ignores diacritics (`kiausiniai`) and understands English aliases (`milk`). |
| **Dictate** at the fridge | Tap **🎤 Sakyk**, use the iPhone keyboard mic and say "reikia pieno, duonos, du litrus kefyro ir dar šildytuvo". A free local parser picks out the known items, quantities and "not needed" phrases. DeepSeek is asked only when something is left that the catalog can't place. |
| **Usual items** | "Dažniausiai perkate" shortlists what is due by your own rhythm (milk every ~7 days, last bought 9 days ago). Tap to add, or **Add all**. **✨ Ask AI** has DeepSeek refine the list. With no history yet it shows staples. |
| **Store order** | The list is grouped by supermarket section in aisle order. Change the order in Settings with ↑↓. Moving an item to another section teaches the catalog. |
| **In store, together** | Tap to cross out. Other phones see it within about 1–2 s. It works with no signal: changes queue on the phone and sync when the signal is back. |
| **Long-term purchases** | Things like a portable heater, tools or clothes go to "Vėliau / ilgalaikiai". In the store they show as a collapsed "if you see it" section. |
| **Finish shopping** | Crossed-out items become purchase history, which feeds the shortlist. Everything not bought stays on the list for the next trip. |
| **Agents** | An MCP endpoint for Claude and ChatGPT connectors, plus a skill (`skill/grocery-list/`). |

## Access: one family link, no passwords

The app is opened with `/grocery?t=<token>` (old `#t=` links still work). The token is stored on the phone
and a name is asked once ("Kas tu?"). Only the token's SHA-256 is in the repo
(`infrastructure/auth.ts`). Setting `GROCERY_TOKEN` on Vercel replaces it. The
MapPal login is not used: `proxy.ts` lets `/grocery` and `/api/grocery/*` through,
and those routes check the token themselves.
**Add to Home Screen** from that link: `/grocery` sends no manifest, so iPhone
Safari saves the current address (`/grocery?t=…`, the app keeps the token
there) as the start page. The Home Screen app doesn't share Safari's storage,
so the token must be in that address. (MapPal's manifest, start page `/`, made
the icon open the MapPal login, 2026-11-20.) Offline
opening comes from MapPal's service worker (`public/sw.js` keeps the last copy of each page).

MCP connector URL: `/api/grocery/mcp/<agent token>`. Agent tokens are issued,
named and revoked in the app (⚙️ → Asistentai): as many as needed, one per
assistant/integration, so each can be revoked alone. Only their SHA-256 is
stored (`grocery_agent_token`); the full link is shown once, when it is created.
The family token is not accepted on MCP. API: `GET/POST /api/grocery/agents`,
`DELETE /api/grocery/agents/<id>` (family token).

**REST for OpenAPI actions** (ChatGPT custom GPT actions, Gemini, scripts): the
same assistant tokens as API keys (`Authorization: Bearer`, `X-API-Key` or
`?key=`), schema at `/api/grocery/v1/openapi.json` (public, no secrets).
`GET/POST /items`, `POST /items/bought`, `POST /items/remove`,
`POST /trip/finish`, `GET /suggestions`, `GET /catalog?q=` under
`/api/grocery/v1`. MCP and REST share `application/agentActions.ts`, so they
behave the same.

Setting up a ChatGPT GPT: Configure → Actions → Import from URL
(`<MapPal URL>/api/grocery/v1/openapi.json`) → Authentication: API key,
Bearer, paste the key from ⚙️ → Asistentai. Anything else that accepts
OpenAPI actions (e.g. Gemini, where custom actions are offered) uses the same schema and key.

## Settings

Nothing extra to set: it uses MapPal's `DATABASE_URL` and `DEEPSEEK_API_KEY`.
DeepSeek calls count against MapPal's shared cap `deepseek:grocery` (200/day,
3,000/month, shown on `/sources`; `CAP_DEEPSEEK_GROCERY_DAILY` / `_MONTHLY`
override it) and are logged in `grocery_ai_call`. Optional: `GROCERY_TOKEN`.

## Local

Same as MapPal (`npm run dev`). Grocery tests: `test/grocery.test.ts` (part of `npm test`).

## Code map

| Path | What |
| --- | --- |
| `index.ts` | the only public surface (routes import from `@/domains/grocery`) |
| `domain/` | pure rules, no IO: `text.ts` (fold/stem/autocomplete/matching), `parse.ts` (local sentence parser), `suggest.ts` (purchase rhythm), `seed-data.ts` (24 sections, ~250 products LT+EN), `prompts.ts` (**prompt templates**, see `docs/PROMPTS.md`), `ai.ts` (DeepSeek output validation behind a `ChatJson` port), `types.ts` |
| `application/` | one use case per file (getState, addItems, updateEntry, finishTrip, parseText, suggestFromHistory, suggestWithAi, classifyNew, …) and `mcp.ts` (MCP server) |
| `infrastructure/` | `repo.ts` (`grocery_*` tables), `deepseek.ts` (MapPal's shared cap `deepseek:grocery`), `auth.ts` (family token), `agentTokens.ts` (MCP tokens), `seed.ts`, `http.ts` |
| `ui/` | the phone UI; `useSync.ts` = polling sync plus offline outbox; `grocery.css` scoped under `.grocery-root` |
| `test/` | domain tests without DB or network (`npm test`); `test/boundaries.test.ts` + ESLint guard the domain boundary |
| `docs/` | `PROMPTS.md`, `skill/grocery-list/SKILL.md`, `evidence/` |
| outside the folder | `app/grocery/` + `app/api/grocery/` (thin routes), `public/grocery/` (icons), Grocery section of `prisma/schema.prisma`, migrations `prisma/migrations/*grocery*` (move to `domains/grocery/migrations` with `core_migrations` in hosting step 1), the `isGrocery` line in `proxy.ts` |

## Where data comes from (honesty)

Each list line records `via`: `typed`, `pick` (autocomplete), `suggest`, `ai`
(DeepSeek parsed it, shown with ✨) or `mcp` (an agent). Each product records
`source`: `seed`, `user` or `ai`. Every DeepSeek call is logged in
`grocery_ai_call` with its purpose, tokens and any error. DeepSeek receives
product names and the list only, never names or locations.

## Is it alive?

`/api/grocery/health` → `{ ok, db, ai, missing }` (public, names only).

## Removing it

1. Delete `domains/grocery`, `app/grocery`, `app/api/grocery`, `public/grocery`,
   the `isGrocery` line in `proxy.ts`, the grocery block in `eslint.config.mjs`,
   the Grocery section of `prisma/schema.prisma`, the `deepseek:grocery` cap and G6 in `AGENTS.md`.
2. Add a migration that drops the tables, then `npm run migrations:bundle`:
```sql
DROP TABLE IF EXISTS grocery_entry, grocery_product, grocery_category, grocery_trip,
  grocery_member, grocery_ai_call CASCADE;
DROP TYPE IF EXISTS grocery_kind, grocery_entry_status;
```
