# MapPal

A family points-of-interest indexer. You draw a region on a map, pick categories
(waterfalls, factories, ...), and the app breaks the region into tiles and scans
each tile × category independently — so coverage is explicit instead of hoping
an LLM didn't skip the "boring" parts of a region in favor of top-10 lists.

## How it works (MVP)

1. **Draw a region** on the map (polygon tool, bottom-right of the map).
2. On submit, the region's shape is tiled into **H3 hexagons** (~5km edge by
   default) and one **ScanJob** row is created per (tile × category) — this is
   the coverage ledger that makes "did we actually check this area" answerable.
3. Click **Scan pending tiles** to run jobs. Each job queries **OpenStreetMap
   via the Overpass API** for that category's tags within the tile, and upserts
   any matches as `Place` rows with a `PlaceSource` recording exactly where
   they came from.
4. The map shows tile outlines + discovered places, filterable by category.
   `/coverage?regionId=...` shows the full job ledger: which tiles × categories
   are DONE/PENDING/ERROR, with candidate counts.

Categories live as code (`lib/categories/*.ts`) — each one is OSM tag filters +
include/exclude rules + search phrase templates for later web-search
collectors. Two are seeded: `waterfalls` and `factories` (the latter covers
both "what's that factory" drive-by spotting and disused/urbex sites).

## What's intentionally not built yet

This is Phase 1 of the plan (one region's worth of structured-data scanning).
Not yet implemented:
- LLM verification/enrichment pass (season, access notes, hidden-gem scoring)
- Non-OSM collectors: web search, Wikiloc/AllTrails, Wikipedia, Instagram-assist
- Route mode (corridor search along a driving route)
- Popularity vs. quality scoring / hidden-gem flagging

The schema (`prisma/schema.prisma`) already has the fields for these
(`popularityScore`, `qualityScore`, `isHiddenGem`, `confidence`, etc.) so
adding them later is additive, not a rewrite.

## Running locally

Requires Postgres running and reachable via `DATABASE_URL` (see `.env`).

```bash
npm install
npx prisma migrate dev   # first time / after schema changes
npx tsx prisma/seed.ts   # creates family login(s) — edit FAMILY_USERS in prisma/seed.ts first
npm run dev
```

Open http://localhost:3000, log in, draw a region, pick categories, hit Scan.

### Auth

Deliberately minimal: a handful of family users share one login table, and
everyone sees the same shared dataset (no per-user data separation). Edit
`prisma/seed.ts` to add/remove family members, then rerun the seed script.
Change the seeded password after first login (no self-service "change
password" flow yet — update it via the seed script and rerun, or directly in
the DB).

### Multi-device sync

There's nothing device-specific to sync: all data lives in the shared
Postgres database, so logging in from any device shows the same regions,
tiles, and places. "Syncing" is just "there's a server."

## Known limitation in sandboxed/restricted network environments

The Overpass collector calls `overpass-api.de` directly. If you're running
this inside a network-restricted sandbox, that host needs to be on the
allowed-domains list, or collector requests will fail with connection resets.

## Deploying

Point `DATABASE_URL` at a real Postgres instance (Neon, Supabase, Railway,
your own box, ...) and deploy the Next.js app anywhere that runs Node (Vercel,
a VM, etc.). Run `npx prisma migrate deploy` against the production DB before
first use, and `npx tsx prisma/seed.ts` once to create logins.
