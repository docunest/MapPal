# Agent Phase 0 — evidence (2026-11-21)

End-to-end run of the cost-test backend on a local production build with a
local Postgres (same migrations as production) and **live** OpenStreetMap,
Wikipedia and Wikimedia Commons. Claude Code in a cloud session acted as the
agent through the MCP connector (`/api/agent/mcp/<token>`). No Google key in
the sandbox, so Google was off.

## Travel state → zone

Test data like the real sources: a head-unit GPS log line near Pombal
(3 h old), then a link shared from an iPhone to "Parque público de caravanas,
Peniche" (1 h old). `get_travel_state` picked Peniche: "shared after that …
so it is the next likely stop". `plan_run` (dry run, nothing spent): camper
aire 360 m from the target; towns Peniche (city), Ferrel, Serra d'El-Rei.

## Run `cmwqk6wjc00027dfdpoo3j80m`

| | Cafes | Exploration |
|---|---|---|
| On the map | 128 | 171 |
| Dropped by rules | 8 (6 fast food, 1 fancy, 1 unnamed) | 144 (138 unnamed, 4 duplicates, 2 private/no access) |
| Checked by the agent | 25 (cap) | 15 (cap) |
| Kept | 16 | 8 |

- Served to the agent: **10,442 tokens** (text 4,200, images 6,242), 6 pages,
  16 images, 0 Google. Estimate before the run: ~62 k (no Google, 15 pages,
  40 photos); actual was lower because most cafes had no photo.
- Per kept place: 435 tokens served.
- **Weekly allowance: not measured.** A cloud session can't read `/usage`;
  the first real run on the owner's Claude Code gives the number.
- Kept exploration: Gruta da Furninha (sea cave, Neanderthal site), Fortaleza
  de Peniche, Forte de Paimogo, Forte de N. S. da Luz ruins, Convento do Bom
  Jesus ruins, Nau dos Corvos (abandoned cape restaurant), Gruta dos Bolhos
  (guided visits), Limbo do Leste (coast). Photos the agent saw:
  `exploration-photos-the-agent-saw.jpg`.
- The agent caught what the rules missed: TriBeCa (Serra d'El-Rei) read as
  fancy from its menu (foie gras, premium meats), not kept; "On Line" looks like
  a shop (fake); Os Americano's has a dead website (stale); Cerro da Velha is a
  Berlengas islet, not reachable by camper.
- Screenshots (iPhone 13): `run-page-top.png`, `run-page-exploration.png`,
  `runs-list.png`. The 👍/👎 there were test taps.

## Guards checked on a copy of the run with a 1,200-token cap

- `next_batch` before `start_run` → refused ("still a dry run").
- `start_run` with `owner_approved=false` → refused.
- First batch stopped after 1 place at 789/1,200 tokens: **"CAP HIT: content
  tokens cap reached. Stop now."**; later `next_batch` and `fetch_page` refused.
- Reviewing a place never sent (`e2`) → refused.
- `finish_run` pass logic: before/after % → delta and PASS/FAIL (tested with
  made-up numbers, run deleted afterwards).
- Wrong token → 401. `submit_reviews` > 20 items → refused with the reason.

## What the run taught (fixed or open)

- Fixed: a cafe website's preview image was a blank 2286×1330 PNG
  (1.5 k tokens). Website images over ~900 tokens are now skipped.
- Fixed: Overpass error pages are shortened in notes; the dry run reports a
  failed OSM query instead of showing an empty area (seen live: the only
  mirror the sandbox reaches often answers 504).
- Open: **cafes need the Google key.** Without it 21/25 had only OSM tags and
  no photo, so vibe is a guess. With the key: ~40 Details + 40 photos per run,
  inside the free monthly allowance (daily cap raised 30 → 50).
- Open: offshore islets can enter the exploration circle (agent drops them).
- Open: the Cares gorge isn't a mapped spot near Arenas (it's a trail without
  Wikidata); famous trails with Wikidata are now included, long-distance ones dropped.
