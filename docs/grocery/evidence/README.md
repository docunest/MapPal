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
| Phone B crosses out → phone A sees | 850 ms, 1821 ms, 2320 ms |
| B offline, cross out, back online | A sees it 1297 ms after reconnect |
| Finish shopping | 4 bought → history; 8 not bought stay; long-term stays |
| MCP | add_items "eggs and 2 kg potatoes", mark_bought "potatoes", "milk" → bulvės, pienas |
