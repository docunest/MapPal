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

## Connect Claude Code

```
claude mcp add --transport http mappal-agent https://<MapPal host>/api/agent/mcp/<agent token>
```

Then: "recheck location" (the skill runs the steps).

## Tokens

One per agent. Only SHA-256 hashes are in git (`infrastructure/auth.ts`, a
default for "claude"). `MAPPAL_AGENT_TOKENS=name:sha256hex,…` on Vercel
replaces the list; remove a name to revoke that agent. Make a token:

```
node -e 'const c=require("crypto");const t=c.randomBytes(24).toString("base64url");console.log(t, c.createHash("sha256").update(t).digest("hex"))'
```

## Caps (per run)

150 k tokens of material, 25 cafes + 15 exploration spots, 15 pages, 60 images,
40 Google details + 40 Google photos. Override with `MAPPAL_AGENT_CAP_TOKENS`,
`MAPPAL_AGENT_CAP_CAFES`, `…_EXPLORATION`, `…_PAGES`, `…_IMAGES`,
`…_GOOGLE_DETAILS`, `…_GOOGLE_PHOTOS`, `…_BATCH_SIZE`. Google also stays under
the shared monthly SKU caps (`lib/sources/usage.ts`, inside the free tier).
Google content goes to the agent live and is never stored here.

## Is it alive?

- `POST /api/agent/mcp/<token>` with `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`
  → 9 tools; a wrong token → 401.
- `/agent/runs` (family login) lists runs with their cost.
- Tests: `node --import tsx --test test/agent.test.ts` (real OSM captures for
  Peniche and Arenas de Cabrales in `test/fixtures/agent/`).
