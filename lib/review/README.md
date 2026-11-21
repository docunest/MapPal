# Review app — `/review`

Swipe through the places the agent found (cafes and exploration spots from
`lib/agent` runs), per person, or see them all on a map. Phone first; on a
wide screen (desktop) the map and the cards sit side by side.

- **People are name handles** (docunest hard rules §5): pick or type a name;
  each name keeps its own votes (`mappal_voter`, `mappal_vote`, RLS on).
- **Votes:** swipe → like, ← don't like, ↑ undecided, ↓ never ("super don't
  like"), or the buttons; ↶ undoes. Votes made with no signal wait on the
  phone and go out when it's back online.
- **Filter (⚙︎) before swiping:** around me / the car's last position (or the
  last shared link) / a pin dropped on the map; 5–100 km or anywhere; cafes /
  exploration; agent picks → + ones it didn't pick → everything found
  (including places it never checked); my votes (not voted, ♥, ?, ✕, ⛔); and
  someone else's votes (e.g. "what B liked that I haven't voted on").
- **Card:** photo (Commons or the place's website — never Google), distance
  and direction, the agent's verdict and notes (labelled AI), OSM hours, a
  mini map with the place (red) and you (blue), Waze / Google Maps / Send to
  car (the dock inbox) / OSM links, everyone's votes, "been here" (a GPS fix
  from the car within 75 m — approximate, one fix is enough) and "sent to car".
- **Map:** places coloured by your vote (blue = not voted, grey = not checked
  by the agent, green/amber/red/dark = like/undecided/don't like/never;
  disliked and never hidden by default), links sent to the car (purple),
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
