---
name: mappal-context
description: Base project context for MapPal (github.com/docunest/mappal), a family camper map app for Spain and Portugal with scenario-based agent search (groceries, construction stores, activities, sightseeing). Use this skill for ANY task touching MapPal or docunest/mappal — planning, coding, prompts, scenarios, agents, data sources, map UI, regions, caching, sync, offline, deployment, handoff notes — even if the user only says "the map app", "scenarios", "nearby" or names a single feature.
---

# MapPal — shared project context

Load this before any MapPal task. It is the owner's current intent (as of 2026-11-06) and overrides older goals in docs/PLAN.md where they conflict. Your specific task comes in the prompt; this file gives you the background to do it well.

## Repo and first steps

- Repo: github.com/docunest/mappal, branch `main`. Next.js (newer version with breaking changes: read `node_modules/next/dist/docs/` before coding), Prisma, Supabase Postgres.
- Read `AGENTS.md`, `docs/PLAN.md` and the handoff files (see Handoff protocol) first. Live deployment URL is not in the repo; ask the owner.
- Dock backend (`/api/dock/*`) and camper control backend (`/api/camper/*`, `/camper`) are built and out of scope for map work.

## Product goal

A very simple map UI answering repeat questions about nearby places, better than Google Maps' poor suggestions. The owner defines **scenarios** (saved, versioned prompts). One tap shows a validated, ranked shortlist on the map. Users: one family (dad, mum, teenagers, a 6-year-old, a dog) travelling ~20,000 km/year in a camper across Spain and Portugal. Local-language sources (es/pt/ca/gl/eu) matter more than English ones.

## Use cases

1. **Construction stores** — region's top brands (e.g. Leroy Merlin, BAUHAUS, Brico Depôt) plus small local shops that sell hardware (e.g. Chinese bazaars). Near cities, rank big-box stores first. With none nearby, show every local store that is genuinely a construction store; drop mislabelled places.
2. **Groceries** — one button. Prefer biggest, cheapest, best selection over nearest. Show open now / opens later today / open tomorrow.
3. **Closures** (Spanish Sundays and Saturday afternoons, holidays) — keep big stores on the map with a red cross when closed today, surface small open shops nearby, plus a short "thin data but likely real" list. Always read real opening hours; never assume.
4. **Activities** — a generic button with subcategories, each with an owner-written taste profile:
   - Karting/motorsport (dad + son): karting, racing, sports events; only places likely open on arrival.
   - Sightseeing (mum): stunning, often unofficial spots — seaside geysers, natural hot pools, mountain-top hikes, photo spots. Also check camper access (track quality, height/weight/width limits, private/gated/closed) and parking/sleeping nearby. Replaces old goal G1 Scout; reuse the data layer from commit 8a26c65.
5. **Lens** (kid, existing): interesting things 500 m–3 km away (factories, ports, fish markets, railways, bridges, gorges, mines, castles) with deep dives. Keep working; not the current focus.

## Agent pipeline (per scenario × region)

1. **Top-down agent** — turns the scenario prompt into one or more queries using the region's relevant brands and local-language keywords.
2. **Bottom-up agent** — scans OSM tags/names and Google categories for common matching keywords and proposes candidates the brand list missed.
3. **Validator agent** — merges and de-duplicates, then rates each place **real / stale / fake** with stored evidence (web search, Facebook pages, recent reviews, photos). Applies situation rules (big-box vs local, opening hours, likely open on arrival). Output tiers: recommended · closed today · small open alternatives · unverified but likely real. AI verdicts are labelled as AI.

## Scenarios and regions

- Scenarios are versioned prompts (extend the existing `/prompts`). Several are developed in parallel. Loop: **refine prompt → run on a region → fine-tune**.
- Regions tagged **future / current / past**. Results cached per (scenario version, region).
- Past regions are frozen: kept, never re-run (save tokens). A new prompt version re-runs only future and current regions, via a manual trigger showing a cost estimate.
- Pre-generate results for future regions before arrival.

## Data sources

- Own place DB with provider-neutral IDs + lat/lng, cross-referenced to OSM IDs and Google place IDs. Every field keeps its source; the UI shows source tags.
- **Google Places**: valuable (local data, photos, reviews) but **never a hard dependency**. Behind an API key with a cost cap. Use it for enrichment and place previews. The app must work with no Google key.
- **OSM / Overpass (with mirrors) / Nominatim** are the base. Others in parallel where cheap (Wikipedia/Wikidata/Commons, YouTube, Facebook, web) — nice to have, not critical.
- AI providers never receive the family's position history, route or personal data beyond what a query strictly needs.

## Map and UI

- Switchable map layer, Google or OSM, **default OSM**.
- Main screen: map + scenario buttons. Tap → cached result instantly; if nothing is cached, a live run (~20 s with a spinner).
- Tiered list over the map: confidence badges, red crosses for closed places, opening times, Google Maps/Waze nav links. Google photo/review preview on tap.
- Prompt studio (edit → test on a region → review → save version) and region manager (tag regions, pre-generate, see cost/status).
- Location: `?lat=&lng=` in the URL wins; otherwise device GPS.

## Architecture and platforms

- One shared central backend on Vercel (owner said "Vertex"; confirm if unsure) + database (current Supabase Postgres unless a plan argues otherwise). Data is centralised by default.
- **Put as much logic as possible in the web app** and share it across devices; keep native code thin.
- Platforms: desktop browser, iPhone (PWA), Android car head unit (thin wrapper + existing floating button; car screen used mostly for browsing results).
- Devices keep a local copy (semi-decentralised) and sync with the backend. Few users: keep sync and conflicts simple (basic master-master, last-write-wins per record). Don't over-engineer.
- Offline: download a region's results (and OSM tiles where feasible); fall back to them with no internet and show the data's age.

## Build phases

1. Update docs/PLAN.md to this context, resolve decisions D1–D5, get owner approval.
2. Data model: scenarios, regions, place store, result cache, sync.
3. Pipeline v1 for Groceries + Construction stores, proven on acceptance points incl. a Sunday run.
4. One-tap map UI with layer switch and previews.
5. Prompt studio + region manager + pre-generation.
6. Activities (karting, sightseeing).
7. Offline packs and device sync.
8. Extra sources.

## Acceptance points and criteria

Points: Puerto de Sagunto, Avilés, Matosinhos, Pinhão, Garganta del Cares / Poncebos, Arenas de Cabrales, Mértola, Peniche, one Lisbon point, one Madrid point.

- Right top-tier store (or real local stores in rural areas) in the top 3 at every point. Nothing closed shown as open. Fakes and stale entries filtered out, with evidence.
- Cached tap renders in under 3 s; a live run takes about 20 s.
- Past regions never re-run. Works offline for a downloaded region. Works with no Google key.
- Lens: obvious landmark in the top 5 within 3 km; deep dive has description, history and a how-it-works video.

## Working rules

- **Plan first**: anything bigger than a small fix → update docs/PLAN.md and get owner approval before building.
- **Prove it**: every feature on real Spain/Portugal locations with evidence (screenshots or data). If a source is unreachable from your sandbox, say so; don't fake it.
- **Never present partial data as complete or invent results.**
- **Honest sources**: always distinguish lookup data (OSM/Google/Wikipedia) from AI output.
- **Cost-aware**: cache aggressively; never re-run frozen regions; show cost before bulk runs.
- Every change must serve the goals above; if it doesn't, it doesn't belong.

## Handoff protocol (chat ↔ agents)

The repo is the single shared channel. Chat Claude cannot push to the repo; the owner relays between chat and agents.

- docs/PLAN.md — approved plan. Change only with owner approval.
- docs/handoff/INBOX.md — tasks and decisions from the owner or chat. Newest on top, each entry dated with a status: open / in progress / done.
- docs/handoff/STATUS.md — agent reports, newest on top. Each entry: date, task, what changed (commits), evidence (screenshots/data), blockers, questions for the owner.
- docs/handoff/DECISIONS.md — dated one-line decisions with reason. Never re-argue a logged decision without new facts.

Every agent session:
1. Start: read this skill, PLAN.md, INBOX.md, latest STATUS.md entries, DECISIONS.md.
2. Work only on open INBOX items, in order, unless told otherwise.
3. End: mark INBOX items, add a STATUS entry, log any decisions the owner made, commit and push with message "handoff: <summary>".

Chat Claude: when the owner pastes STATUS.md or shares the repo, read it and draft the next INBOX entry as paste-ready text.
