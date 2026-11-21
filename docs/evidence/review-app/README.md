# Review app `/review` — evidence (2026-11-21)

Local production build + local Postgres, emulated iPhone 13 (GPS set to
Caldas da Rainha) and a 1440×900 desktop window. Places come from two real
agent runs made in this session: Peniche and **Caldas da Rainha** (25 cafes +
15 exploration spots checked, 18 + 11 kept, 112 + 15 more kept as unchecked
backlog). Test people "Tester A" and "Tester B" (B's votes were seeded: 9
votes on Caldas picks). A test GPS fix by Café Central and a test "sent to
car" link at the Óbidos aqueduct were added to show those marks. No Google key.

| Screenshot | What it shows |
|---|---|
| `01-who-is-swiping.png` | name picker (name handles, each with own votes) |
| `02-card.png` | nearest unvoted agent pick (Café Bordalo, 240 m NW), AI verdict, OSM hours, mini map (place red, you blue), Waze / Google Maps / Send to car |
| `03-swiping-right.png` | finger drag → "♥ Like" |
| `04-all-details.png` | the full card in a sheet |
| `05-filter-tester-b-liked.png` | filter: around me, 20 km, agent picks, my votes, "Tester B liked" → 6 cards |
| `06-map.png`, `07-map-place.png` | map: places by vote colour, agent tiles, tap → card + vote buttons |
| `08-desktop.png` | desktop: map with the 20 km circle and indexed tiles beside the swipe deck |

Checked in the database after the run: Tester A's ♥ (swipe) and "undecided"
(button) were stored; "don't like" + ↶ undo removed that vote; Tester B's votes
untouched. 147 tests (7 new for the filter), typecheck, lint, build pass.

Found and fixed while testing: MapLibre's worker couldn't load under
Turbopack (no markers on the map) → served from `public/`; header overflowed
on the phone; "been here" radius 150 m marked a café's neighbours → 75 m.

Not proven: on the owner's iPhone (needs the deploy); production has no agent
places yet, so `/review` there stays empty until a run from Claude Code.
