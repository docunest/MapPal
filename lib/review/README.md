# Review app — `/review`

Swipe through the places the agent found (every use case from `lib/agent`
pulls: Food › Cafes / Cool bars / Restaurants / Fast food, Exploration…), per person, or see them all on a map. Phone first; on a
wide screen (desktop) the map and the cards sit side by side.

- **People are name handles** (docunest hard rules §5): pick or type a name;
  each name keeps its own votes (`mappal_voter`, `mappal_vote`, RLS on).
- **Votes:** swipe → like, ← don't like, ↑ undecided, ↓ never ("super don't
  like"), or the buttons; ↶ undoes. Votes made with no signal wait on the
  phone and go out when it's back online.
- **Filter (⚙︎) before swiping:** around me / the car's last position (or the
  last shared link) / a pin dropped on the map; 5–100 km or anywhere; kind
  along the use-case tree (Food = every food sub-type, then narrow to Cool
  bars…; the same chips sit on top of the Browse list); places judged before
  a split are re-sorted into the sub-type whose current rules select them; agent picks → + ones it didn't pick → everything found
  (including places it never checked); my votes (not voted, ♥, ?, ✕, ⛔); and
  someone else's votes (e.g. "what B liked that I haven't voted on").
- **Card:** photo (Commons or the place's website — never Google), distance
  and direction, the agent's verdict and notes (labelled AI), OSM hours, a
  mini map with the place (red) and you (blue), Waze / Google Maps / Send to
  car (the dock inbox) / OSM links, everyone's votes, "been here" (a GPS fix
  from the car within 75 m — approximate, one fix is enough) and "sent to car".
- **Index areas (cells):** the place index is stored per cell — a box of
  about 30 × 20 km read once from OpenStreetMap and refreshed after 30 days.
  "▦ Index areas" on the map (or Show/Hide in Browse → Index & agent) draws
  them: green = stored (with place count and age), amber = older than 30 days,
  red = failed, grey dashed = not indexed (no places there until indexed).
- **Map:** places coloured by your vote (blue = not voted, grey = not checked
  by the agent, green/amber/red/dark = like/undecided/don't like/never;
  disliked and never hidden by default), links sent to the car (purple dots with 🚐),
  the agent's indexed tiles (shaded squares: green = done, amber = partial),
  the search circle. "Search here" makes the map centre the area.
  The filter shows whether the agent has indexed the area yet.

Code: `domain/` (filter, types — pure), `application/queries.ts`,
`infrastructure/repo.ts`; routes `app/api/review/{places,layers,voters,votes}`;
UI `components/review/`. MapLibre's worker is served from
`public/maplibre-gl-worker.mjs`, copied on install
(`scripts/copy-maplibre-worker.mjs`) because Turbopack can't bundle it.

Alive? `/review` loads behind the family login; `GET /api/review/voters`
answers; tests: `node --import tsx --test test/review.test.ts`.


## Map points
A cell's number is every stored OpenStreetMap thing in it (food & drink, car parks, campsites, towns, things to explore), not people and not only places to judge. `cellsAround` returns `byLayer` per cell; Index & agent shows the totals. Browse shows a banner when its filter hides unjudged places, with *Show everything*.
