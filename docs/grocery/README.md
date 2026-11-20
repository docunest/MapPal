# Pirkiniai — family grocery list

A shared shopping list for a few phones. Lithuanian first, English mixed in.
It is a self-contained **module of MapPal** (same Vercel project, same deploy,
same Supabase project; owner 2026-11-20, AGENTS.md G6). It lives at `/grocery`
and has its own token auth, its own `grocery_*` tables and enums, and no imports
from MapPal code except the shared Prisma client (`lib/db.ts`). See "Removing it" below.

**Open it:** `<MapPal URL>/grocery#t=<family token>` (the live URL and the token are not kept in the repo; ask the owner).

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

The app is opened with `/grocery#t=<token>`. The token is stored on the phone
and a name is asked once ("Kas tu?"). Only the token's SHA-256 is in the repo
(`lib/grocery/auth.ts`). Setting `GROCERY_TOKEN` on Vercel replaces it. The
MapPal login is not used: `proxy.ts` lets `/grocery` and `/api/grocery/*` through,
and those routes check the token themselves.
**Add to Home Screen** from that link: the installed app starts with the token
(its manifest `start_url` carries it), so it never asks to log in. Offline
opening comes from MapPal's service worker (`public/sw.js` keeps the last copy of each page).

MCP connector URL: `/api/grocery/mcp/<token>`.

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
| `prisma/schema.prisma` (Grocery section at the end) | `Grocery*` models → `grocery_*` tables and enums |
| `prisma/migrations/20261120190000_grocery_list` | creates them (normal MapPal migration) |
| `lib/grocery/seed-data.ts` | starter taxonomy: 24 sections, about 250 products, LT + EN + aliases (inserted on first use) |
| `lib/grocery/text.ts` | fold / stem / autocomplete / phrase matching (shared by phone and server) |
| `lib/grocery/parse.ts` | local sentence parser (stage 1) |
| `lib/grocery/llm/prompts.ts` | **prompt templates** (see `PROMPTS.md`) |
| `lib/grocery/llm/ai.ts`, `deepseek.ts` | DeepSeek parse and shortlist, validation, call log and cap |
| `lib/grocery/suggest.ts` | "usually buy" from purchase rhythm |
| `lib/grocery/store.ts` | all DB reads and writes (used by the API and MCP) |
| `lib/grocery/mcp.ts` | MCP server (JSON-RPC over HTTP) |
| `components/grocery/` | the phone UI; `useSync.ts` = polling sync plus offline outbox |
| `app/grocery/`, `app/api/grocery/` | page (scoped CSS under `.grocery-root`) and API |
| `public/grocery/` | Home Screen icons |
| `docs/grocery/skill/grocery-list/SKILL.md` | skill for Claude / ChatGPT accounts |

## Where data comes from (honesty)

Each list line records `via`: `typed`, `pick` (autocomplete), `suggest`, `ai`
(DeepSeek parsed it, shown with ✨) or `mcp` (an agent). Each product records
`source`: `seed`, `user` or `ai`. Every DeepSeek call is logged in
`grocery_ai_call` with its purpose, tokens and any error. DeepSeek receives
product names and the list only, never names or locations.

## Removing it

1. Delete `lib/grocery`, `components/grocery`, `app/grocery`, `app/api/grocery`,
   `public/grocery`, `docs/grocery`, `test/grocery.test.ts`, the `isGrocery`
   line in `proxy.ts`, the Grocery section of `prisma/schema.prisma` and G6 in `AGENTS.md`.
2. Add a migration that drops the tables, then `npm run migrations:bundle`:
```sql
DROP TABLE IF EXISTS grocery_entry, grocery_product, grocery_category, grocery_trip,
  grocery_member, grocery_ai_call CASCADE;
DROP TYPE IF EXISTS grocery_kind, grocery_entry_status;
```
