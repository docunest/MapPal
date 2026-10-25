<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# MapPal — product goals (read before any work)

MapPal is for one family living **camp life in a camper van in Spain and
Portugal** — weeks and months on the road, not a one-week "see Venice"
holiday. It succeeds only if it is **at least as good as the hours of hand
research it replaces**. Everything built here must serve one of these three
jobs; if a change doesn't, it doesn't belong.

## G1 — Scout travel stops (for the partner who plans the route)
Today she spends hours hand-browsing Instagram and Google Maps to find stops.
- Find places worth stopping at, with a focus on **cool photo/selfie spots
  that not everyone already has a photo of** — hidden gems over top-10 lists.
- **Check the route is actually possible**: not private, gated, closed or
  blocked for tourists; drivable in a camper (track quality, height/weight/
  width limits); where to park; where to sleep nearby.
- Show enough (photos, fame, access) to decide without opening five apps.

## G2 — Nearby essentials (for the driver)
- Open the app → immediately see **food, fuel, groceries** around me,
  **reasonably filtered** (open now, real places, nearest first; camper needs
  like diesel/LPG, water, dump stations, campsites).
- Works in rural areas: widen the search when nothing is close.

## G3 — Lens (for the kid)
- Within **500 m – 3 km of where we are**, show app-style cards: "you might
  be seeing… this steel factory, this fish market".
- Tap a card/photo → **deep dive**: description, history, YouTube videos,
  how it works / how what's made there is made. Factories, railways, gorges,
  bridges, mines, ports, castles are the interesting things.

## Region and languages
Spain and Portugal first. Local sources matter more than English ones:
Spanish, Portuguese, Catalan, Galician and Basque Wikipedias, OSM tags with
local names. Test against real Iberian places, not elsewhere.

## Working rules for agents
- **Plan first.** For anything bigger than a small fix, write/update the plan
  in `docs/PLAN.md` and get the owner's approval before building.
- **Prove it against the goals.** Each feature needs evidence on real
  Spain/Portugal locations (see the acceptance tests in `docs/PLAN.md`), not
  just "it compiles". Never present partial data as complete.
- Keep the app honest about where data comes from (static OSM/Wikipedia
  lookup vs AI) — existing convention, see `prisma/schema.prisma`.
