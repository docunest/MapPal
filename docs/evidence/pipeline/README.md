# Brief pipeline + Config / Browse / Swipe — evidence (2026-11-21)

Local production build + local Postgres, live OpenStreetMap (one public
mirror from this sandbox), no Google key. Claude Code in this cloud session
acted as the agent through the connector with an app-issued token.

**Place index:** 6 cells around Caldas da Rainha fetched once (3,570 places,
17–26 s per cell, no failures). The preview then answers from the database in
0.15 s.

**Pull `run_20261121_205093ed`** (8 places per use case for the test):
- Two briefs, shared layers once: charter v1 · 158ae0c11285, output format
  v1 · 816df10cc077, location; cafes rules v1 · d8b376bf183f, exploration
  v1 · 9261e332a11e. Known places (negative list): 32 cafes, 19 exploration
  spots in the area — none of them came back.
- 16 places judged: 4 cafes and 5 exploration spots kept. 4,159 tokens served
  (text 2,579, photos 1,580).
- Claude's own use for the pull, from the transcript (`usage.mjs`): 4.9 M
  tokens, almost all re-read from cache. That number is this very long build
  session's context, not a fresh agent's — and it shows why it's measured.
- A result for a place from another brief is refused.

**Rule change by the agent:** the cafes rules let through Lumen (a hotel's
restaurant). The agent saved cafes v2 (drop: website contains "hotel"), with
its name and the reason; the next preview used v2, dropped one more place and
showed page 2 (new places only). Exploration v2: the same name within 1.5 km
counts as one place (the Óbidos aqueduct is mapped as a relation and two ways
~930 m apart, and had come back).

| Screenshot | |
|---|---|
| `01-phone-browse.png` | Browse on iPhone: map (AI picks blue, unchecked grey, index cells, 20 km circle) + list nearest first |
| `02-phone-browse-index.png` | Index & agent panel: cells fresh/stale/failed/missing, "Index missing & stale", "Reindex everything here", the pulls with rule versions |
| `03-phone-config-charter.png` | Config: the charter with its version |
| `04-phone-config-cafes-history.png` | Cafes rules: text + JSON rules, history v2 by the agent, restore |
| `05-phone-swipe.png` | Swipe |
| `06-desktop-browse.png`, `07-desktop-config.png` | Desktop layouts |
| `08-desktop-pull-under-the-hood.png` | The pull's correlation id on a map: index cells, zone, candidates by fate |
| `09-desktop-budget.png` | Budget log: measured numbers per pull |
