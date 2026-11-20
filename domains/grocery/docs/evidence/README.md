# Evidence — 2026-11-20 (local production build of MapPal with the grocery module)

`next build && next start` of MapPal on a fresh local Postgres 16: all MapPal
migrations plus `20261120190000_grocery_list` applied at startup. Phones: two
Playwright Chromium contexts emulating an iPhone 13. **The purchase history is synthetic**
(SQL-inserted trips over 8 weeks). **DeepSeek was off** (no key in the sandbox);
the AI path is covered by unit tests with a fake model only.

| Check | Result |
| --- | --- |
| MapPal unaffected | `/` → 307 to `/login`, `/api/scenarios` → 307 without login, `/api/health` ok, 110 tests pass |
| Grocery auth | `/api/grocery/*` without token → 401; `/grocery` opens with `#t=` |
| DB | 6 `grocery_*` tables next to 27 `mappal_*`; 248 seed products |
| Autocomplete `pi` / `milk` | pienas first / pienas |
| Dictation, no commas | "reikia duonos ir kiaušinių du litrus kefyro baigėsi sviestas ir dar nešiojamo šildytuvo" → duona, kiaušiniai, kefyras 2 l, sviestas, nešiojamas šildytuvas (long-term), no AI |
| Phone B crosses out → phone A sees | 855 ms, 1830 ms, 2316 ms |
| B offline, cross out, back online | B shows the last-sync time; A sees it 792 ms after reconnect |
| Finish shopping | 4 bought → history; 8 not bought stay; long-term stays |
| MCP | family token → 401; Claude agent token: add_items "two litres of milk and a portable heater" → pienas × 2 l (added by "claude"), heater already on list |
| RLS | on for all 6 grocery_* tables (migration 20261120210000_grocery_rls) |
