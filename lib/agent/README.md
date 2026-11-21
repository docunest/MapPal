# MapPal hybrid agent — Phase 0 cost test

Plan: `docs/PLAN.md` → "Hybrid agent backend — Phase 0". Owner's design doc:
"MapPal Hybrid Agent Backend — Design".

An outside agent (Claude Code with this MCP connector, on the PC or in a cloud
session) checks **cafes** and **exploration spots** around the family's latest
known location. The server does the cheap part with no AI (OpenStreetMap,
Google Places free tier if the key is set, Wikipedia/Commons, plain web
fetches), counts everything it hands the agent, and stops the run at hard caps.
The agent judges and sends verdicts back. Every run keeps a cost log.

```
lib/agent/
  domain/          pure rules: zone, cafe/exploration rules, caps + token maths,
                   travel state, digest text, review format, HTML/image parsing
  application/     use cases: travel, planRun (dry run), runFlow (start, batches,
                   pages, images, reviews), finish (cost log, pass test), mcp
  infrastructure/  OSM queries, enrichment (Google/Wikipedia/Commons/website),
                   web fetch, travel sources, repo (mappal_agent_* tables), tokens
  index.ts         the only surface routes and pages import
```

Routes: `app/api/agent/mcp/[token]` (connector), `app/api/agent/reviews/[id]`
(👍/👎), pages `/agent/runs` and `/agent/runs/<id>`. Skill:
`.claude/skills/recheck-location/`. Tables: `mappal_agent_run`,
`mappal_agent_review`, `mappal_agent_tile`, `mappal_travel_fix` (RLS on).
Places also land in `mappal_poi` (position, ids, the agent's labels).

## The brief pipeline

The agent's work is a **brief**: six layers, each built only from stored data
(same inputs → same text and hash), every brief recording the versions and
hashes it used (`mappal_brief`).

1. **Charter** — the master rules (versioned, `mappal_rule` "charter").
2. **Output format** — the JSON the agent returns ("output-format"; the server checks it with `domain/review.ts`).
3. **Location** — the best guess and the zone (from the hints and the place index).
4. **Use case** — what the family wants (text) + the rules as data (`domain/profile.ts`: select / drop / score / page size …), one per use case ("usecase:cafes", "usecase:exploration", more can be added).
5. **Known places** — the negative list: everything of this use case in the area already judged (any time) or in an open brief (24 h); same name within the rule's dedupe distance counts as the same place. "More" = pull again → the next page.
6. **Places to judge** — the next page after the rules and the negative list, with facts (OSM, Wikipedia/Commons cached 30 days; Google live, never stored) and one photo each.

Connector tools: `get_travel_state`, `set_location`, `index_area`, `preview_briefs` (free) →
owner's yes → `get_briefs` (every brief at once) → `submit_results` → `finish_run`; plus
`fetch_page`, `fetch_image`, `get_run`, and the rules: `get_rules`, `rule_history`,
`update_rule` (a new version, with a note; takes effect at once), `restore_rule`.
The same tools over REST: `POST /api/agent/v1/<tool>` with `Authorization: Bearer <token>`.

People manage the same rules on `/review` → **Config** (edit, history, restore,
new use case, tokens). **Browse** shows what's indexed and judged on a map and
list (votes per person) and has the reindex buttons; **Swipe** is the cards.

## Location: every hint, one best guess

`get_travel_state` (and the review app's "Best guess") combine every hint:
the owner's pin (`set_location`), the car's GPS log, the car's route requests
(Road ahead), car bookmarks, links shared from a phone, the current stop.
Each source has a trust weight, halved every 12 h; a hint that would need
impossible driving (> 90 km/h + 50 km) from the last reliable fix is set
aside as an outlier; the estimate is the weighted centre of the hints near
the strongest one, with an accuracy circle that grows with age. The agent
sees every hint with its weight and note, and can override with
`set_location` or `plan_run` lat/lng. Hints are history (4 weeks), drawn on
`/agent/debug`.

## Place index: OpenStreetMap read once, kept in the database

`mappal_osm_cell` / `mappal_osm_place`: one Overpass call per geohash-4 cell
(≈ 30 × 20 km in Iberia; four quarters if the whole cell fails), every cafe,
exploration spot, parking, campsite and town in it stored; refreshed after 30
days. `plan_run` fills missing cells around its target first (≤ ~80 s), then
reads the database. `index_area` (agent) and "Index around…" on
`/agent/debug` fill bigger areas (100 km ≈ 40–60 cells), nearest first,
~90 s per call. A failed cell shows red on the map with its error.

## Correlation id, debug map, budget log

Every run's id (`run_…`, index jobs `idx_…`) is on every event in
`mappal_agent_event`: location hints and estimate, target, zone, cells
fetched (count, time, error), rule results, each place served (text/photo
tokens, Google, pages), pages, images, reviews, caps, finish.
`/agent/runs/<id>` → "Under the hood": all of it on a map (hints, estimate
circle, zone circles, cells, candidates coloured by fate: dropped / over the
cap / to check / kept / not kept) and as a filterable timeline.
`/agent/budget`: measured numbers only — tokens served, Claude's own tokens
(from its transcript via `.claude/skills/recheck-location/usage.mjs`), the
`/usage` week % before → after, and Claude tokens per 1 % of the week.

## Connect Claude Code

Make a token on `/agent/tokens` (shown once, copy the command):

```
claude mcp add --transport http mappal-agent https://<MapPal host>/api/agent/mcp/<agent token>
```

Then: "recheck location" (the skill runs the steps).

## Tokens

One per agent, issued and revoked on `/agent/tokens`; only the SHA-256 is
stored (`mappal_agent_token`). `MAPPAL_AGENT_TOKENS=name:sha256hex,…` on
Vercel can add more. There is no built-in token any more.

## Caps (per run)

150 k tokens of material, 25 cafes + 15 exploration spots, 15 pages, 60 images,
40 Google details + 40 Google photos. Override with `MAPPAL_AGENT_CAP_TOKENS`,
`MAPPAL_AGENT_CAP_CAFES`, `…_EXPLORATION`, `…_PAGES`, `…_IMAGES`,
`…_GOOGLE_DETAILS`, `…_GOOGLE_PHOTOS`, `…_BATCH_SIZE`. Google also stays under
the shared monthly SKU caps (`lib/sources/usage.ts`, inside the free tier).
Google content goes to the agent live and is never stored here.

## Is it alive?

- `POST /api/agent/mcp/<token>` with `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`
  → 14 tools; a wrong token → 401.
- `/agent/debug` shows the index cells and the location hints.
- Tests: `node --import tsx --test test/agent.test.ts`.
