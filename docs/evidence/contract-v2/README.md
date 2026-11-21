# Evidence — contract v2 (score, like/dislike hints, complications) and index cells (2026-11-21)

Local production build, local test database (place index around Caldas da Rainha), test logins "Tester A"/"Tester B",
browser in dark mode.

| File | Shows |
|---|---|
| 01-phone-index-cells-explained.png | Browse → Index & agent: what a cell is, Show/Hide on map |
| 02-phone-manual-saved.png | Manual Restaurants pull answered with scores + complications, pasted back: 5 of 5 saved |
| 03-phone-browse-restaurants-scores.png | Browse list: score and complication icons |
| 04-phone-card-complications.png | Tasca Torta: AI 66/100, 🚷 car-free zone, 🅿️ no camper parking, with the notes |
| 05/06-desktop-index-cells-*.png | Cells on the map with labels ("✓ 863 places · 0 d", grey dashed = not indexed), then hidden |
| 07-desktop-pull-scores-complications.png | Pull page: score and flags per place |

The brief now has (copied from the built payload):

```
## 2. Output format (v… · …)
…
Server contract v2 (generated from the code that checks answers): per place candidate, verdict real|stale|fake,
confidence 0–1, relevant, keep, score 0–100 (0 = no-go, 50 = undecided, 100 = a must — judged against layer 6,
the like/dislike hints), summary ≤ 400 chars, complications (list, [] when none: {flag, severity
minor|major|blocker, note}; flags: inside_shop_or_mall, car_free_zone, no_camper_parking, …), evidence ≤ 8; …

## 6. Like and dislike hints — the family's votes in Food (9 liked · 4 disliked · …)
Score every place 0–100 against these: 0 = no-go, 50 = undecided, 100 = a must. …
Liked:
- Malaica Organic Brewery — Food › Cool bars · bar (liked ×2) — earlier AI note: "Taproom of a local organic craft brewery…"
…
Disliked:
- Lumen — Food › Restaurants · restaurant · cuisine=portuguese (never again) — earlier AI note: "Hotel restaurant…"

## 7. Places to judge (5)
```

No voter names go to the agent — only counts. Not proven here: the owner's iPhone, a real ChatGPT/Claude.ai answer
(this one was written by this session in the same format), indexing from Vercel.
