> **Approved plan, 2026-11-06.** This is the owner's updated plan after external review. It is the same text as `.claude/skills/mappal-context/SKILL.md` (minus the skill header), except build phase 1, so keep the two in sync. Live rules for sources, prompts, likes and privacy are in `docs/DATA-RULES.md`; the car dock and camper backends are in `docs/DOCK.md`. The 2026-10-25 plan is history only: `docs/archive/PLAN-2026-10-25.md`.

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

- Hosting: the `docunest-hosting` skill (owner decisions 2026-11-20). MapPal's Vercel project becomes the one shared project; MapPal moves into `docunest/monorepo` in step 1 of `docs/HOSTING.md` there. Data is centralised by default.
- **Put as much logic as possible in the web app** and share it across devices; keep native code thin.
- Platforms: desktop browser, iPhone (PWA), Android car head unit (thin wrapper + existing floating button; car screen used mostly for browsing results).
- Devices keep a local copy (semi-decentralised) and sync with the backend. Few users: keep sync and conflicts simple (basic master-master, last-write-wins per record). Don't over-engineer.
- Offline: download a region's results (and OSM tiles where feasible); fall back to them with no internet and show the data's age.
- **Offline places (approved 2026-11-16, built first):** `/offline` downloads the car's monthly OSM packs (ES, PT, FR, IT, DE — diesel, rest areas, groceries, toilets, water, camper services/aires, height/weight limits, playgrounds, picnic, beaches, cool stuff) as ~2 MB JSON chunks via `/api/offline/<file>` into IndexedDB (resumable, SHA-256 checked); Nearby ⛽/🛒 fall back to it with no signal and show the data's date. MapPal is a Home Screen app (manifest + `public/sw.js`) so it opens with no signal. Offline map tiles and routing come later.

## Build phases

1. Resolve the open decisions listed in docs/handoff/STATUS.md.
2. Data model: scenarios, regions, place store, result cache, sync.
3. Pipeline v1 for Groceries + Construction stores, proven on acceptance points incl. a Sunday run.
4. One-tap map UI with layer switch and previews.
5. Prompt studio + region manager + pre-generation.
6. Activities (karting, sightseeing).
7. Offline packs and device sync.
8. Extra sources.

## Hybrid agent backend — Phase 0: cost test (owner: "Build", 2026-11-21 — built, code in `lib/agent/`)

Design: owner's doc "MapPal Hybrid Agent Backend — Design" (claude.ai artifact). Phase 0 proves that one
stop zone, two categories (cafes, exploration), costs **under 5 % of the owner's weekly Claude allowance**
and that most kept places are real and relevant. Nothing else from the design is built until this passes.

**Who does what**
- Server (MapPal on Vercel, no LLM): reads the latest known location, picks the stop zone, pulls candidates
  from OSM (+ Google Places free tier if the key is set), drops obvious misses by rules, builds compact
  per-place digests (facts + 1 photo), fetches web pages as plain text, caches everything, counts everything.
- Agent (Claude Code with the MapPal MCP connector, on the PC or a cloud session): reads the digests in
  batches, judges vibe / access / real-fake-stale, reads photos and menus, submits verdicts with evidence.

**Steps**
1. `get_travel_state()`: newest position from any source (head-unit GPS log, head-unit bookmark, link shared
   from a phone, CURRENT stop) + destinations (FUTURE stops, newer shared links).
2. `plan_run()` = dry run: chosen zone and why (campsite + 2–3 nearest towns), tiles (geohash-5), candidate
   counts after the rule filter, estimated tokens / pages / Google calls, the caps. Stops for the owner's yes.
3. `next_batch(run, category)`: 5 digests at a time, cheapest first; refuses once a cap is hit.
4. `fetch_page(url)`: server-side text fetch (website, menu page), counted as a browser page, capped.
5. `submit_reviews(run, reviews[])`: verdict real/fake/stale + confidence + evidence, vibe label, access status,
   food tags, price samples. Always labelled AI.
6. `finish_run(run, usage_before_pct, usage_after_pct)`: the owner's `/usage` numbers before and after.
7. `/agent/runs/<id>`: cost log + kept places with photos, 👍/👎 per place for the "real and relevant" score.

**Hard caps (defaults, per run):** 150 k tokens of content served, 1 zone, 25 cafes + 15 exploration spots
deep-checked, 15 pages, 60 images, 40 Google details + 40 photos (inside the free month). The server
enforces them; the agent stops and reports. Tiles (geohash-5) are reported and marked indexed/partial per
category, not capped (a 15 km exploration circle is ~57 tiles).

**Data (additive, `mappal_` prefix, RLS on):** `mappal_agent_run` (plan, caps, counters, usage %, report),
`mappal_agent_review` (place, verdict, confidence, evidence, agent, run); places reuse `mappal_poi` (new
fields in `data` with per-field `fetchedAt`, 30-day freshness). Code in `lib/agent/` (domain / application /
infrastructure, MapPal's own code moves to `domains/mappal` in hosting step 1), thin routes `app/api/agent/…`, MCP at `/api/agent/mcp/<token>` (token per agent, SHA-256 in env).
Skill `recheck-location` in `.claude/skills/`.

**Estimate per location (Claude side):** ~105 k fresh input (dry run 5 k, cafes 25 × 1.6 k, menus 8 × 2.5 k,
exploration 15 × 1.8 k, 6 recency checks × 2 k) + ~25 k output + ~0.5 M cached re-reads. Google ≈ 4 % of the
free month per location, $0. DeepSeek not used. The weekly % is measured (Anthropic shows it only as a %).
As built, the dry run computes it per run: 480 px photos are ~230–410 tokens, so the material is ~50–65 k
tokens; the cached re-reads are the bigger unknown (~1–2 M over ~30–37 turns, as Claude Code re-reads its
context each turn).

**Pass:** < 5 % weekly measured, ≥ 70 % of kept places 👍. Proven first on fixtures at Peniche (cafes) and
Arenas de Cabrales / Poncebos (exploration), then one live run at the owner's real location.

## Brief pipeline (owner 2026-11-21: "Build pipeline")

Agent work = briefs built from versioned layers: charter → output format → location → use-case rules →
known places (negative list) → places to judge. Each layer deterministic and hashed; the agent pulls every
brief at once and can read and change the rules (new version each time, owner can restore). One web app
`/review` with three modes: Config (all layers, versions, tokens), Browse (map + list of what's indexed and
judged, votes, reindex when the owner says so), Swipe. Details: `lib/agent/README.md`.

## Nested use cases + manual run (owner 2026-11-21: "make location prompts nestable… filter by this structure"; "add a manual run")

Use cases form a tree: Food (a group) → Cafes, Cool bars, Restaurants, Fast food; Exploration on its own; anyone
(people in Config, agents with `update_rule`) can add a sub-type under any use case. A sub-type inherits every
setting it leaves out, its parents' text and drop/score rules come first, and a place goes to its most specific
use case. Briefs carry the whole chain (Food › Cool bars, each with version and hash); the negative list covers
the whole tree, so places judged before a split aren't sent again. Browse and the filter pick along the tree
(Food = all food; then narrow). Manual run (Browse → Manual run): the same briefs as one text to paste into any
chat agent, photos as links, and its JSON answer pasted back and saved. The app is light-only (a phone in dark
mode made the text unreadable). Details: `lib/agent/README.md`.

## Review app `/review` (owner 2026-11-21: "build this, start with the phone version")

Swipe through the agent's places per person (name handles, own votes), or see them on a map; phone first,
desktop = the same page with map and cards side by side. Filter first (area: me / car / a pin, 5–100 km;
kind; agent picks → everything found; my votes; someone else's votes). Votes: like / undecided / don't like
/ never. Map: votes, sent-to-car links, "been here" from the car's GPS, the agent's indexed tiles. Details:
`lib/review/README.md`. Next (owner, later): browse the backlog and edit per-category settings.

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


## Discover mode (owner-approved 2026-11-22)
Two modes side by side. *Judge a list*: the server picks from the OSM index by the rules, the agent
judges. *Discover*: the agent names the top N within K km from what it knows and can check (Google
Maps, Instagram, websites); the prompt passes the rules, likes/dislikes/never, known places and strict
no-mistakes rules (a checked link per place). The server matches each answer to the OSM index;
unmatched places are kept as `ext/<hash>` ("not on the map — check the link"). Connector:
preview_discover / discover / submit_discoveries; Manual run has the same switch. Evidence:
docs/evidence/discover/.

## Activities: requirements first (owner-approved 2026-11-22: "Start the build")
Source: the owner's survey (artifact "MapPal Activity Survey", answers 2026-11-22 10:05 UTC).
Principle: the *requirements* are the product. Any agent and any model (Claude, ChatGPT, Gemini…)
gets the same requirements and returns the same answer format; each may use whatever tools it has
(web search, the OSM index, later Instagram). OpenStreetMap is one tool, not the pipeline.

### Pipeline
1. **Requirements** (versioned rules per category, below) + location + dates.
2. **Suggest**: several agents/models independently propose places and events in one format.
3. **Merge**: same place from several agents = one record, listing who suggested it (agreement is a signal).
4. **Verify**: exists, open in this season, price estimate, dog rule; anything unverifiable is marked so.
5. **Store with attributes**; **ranking and filtering happen in Swipe/Browse** (owner: "prioritisation is
   something to filter in tinder mode, not indexing"), never by dropping at suggestion time.

### Category tree (Love = always look for it · Maybe = only when it's really good · No = never)
- **Outdoors with the family.** Love: easy loop hikes, hikes to a big view, gorges, waterfalls, hidden coves,
  show caves, wild hot springs. Maybe: long hikes, river beaches, sea beaches, viewpoints, dinosaur tracks,
  islands, wildlife, thermal spas.
- **On the water.** Love: speedboat/RIB along the coast, renting a boat, big-wave watching, snorkelling.
  Maybe: boat trips, dolphins, kayak/SUP, coasteering, rafting, sailing, fishing trips, jet ski, kitesurf,
  wakeboard. No: surf lessons.
- **Motors and adrenaline (dad and son).** Love: karting, buggy/quad tours, motocross, drift/driving
  experiences, mountain biking, canyoning, caving. Maybe: zip lines, tree-top parks, via ferrata, rock
  climbing, climbing gym, bungee, laser tag, trampoline parks, shooting/archery, pump tracks.
  No: paintball, escape rooms, VR, skydiving, paragliding, cliff jumping.
- **For the 6-year-old.** Love: zoos/aquariums, farms, horse riding, playgrounds, science centres,
  little trains. Maybe: theme parks, water parks, mini golf.
- **Places with a wow.** Love: castles, abandoned places, mines, factory tours, Roman ruins, monasteries,
  interactive museums, unusual photo spots. Maybe: lighthouses and forts.
- **Events.** Love: Christmas villages/markets, New Year, Carnival, Halloween, festas, big markets, medieval
  fairs, rallies/motorsport, surf contests, corridas (all kinds: bulls, running, cars/motorbikes, horses),
  concerts and light shows, fireworks, air shows. Maybe: food festivals, football.
- **Food.** Cafés, restaurants, bars, fast food: No (off by default; kept only for when asked).

### Requirements every suggestion must meet
- **Who:** the whole family with the dog by default. Dog: don't hide, flag "no dogs".
- **Distance (one way, by road):** normal up to 40 km; a must-do up to 120 km, with the reason it's worth it.
- **Season:** check that it runs *in this season and on the dates* (not only today's hours). Closed for the
  season → leave it out.
- **Window:** scan today → 2 months ahead (owner: "we stay a different amount of time at each place and plan up to 2 months"); filter by date in Swipe. Events: dates, place, whether it recurs.
- **Price:** for the whole family (owner: "price per family with some marker how confident"), the tier and how
  sure (●●● published · ●●○ similar/range · ●○○ guess): Free · € <€40 · €€ <€120 · €€€ <€240 · €€€€ €240+
  (the survey's per-person bands × 4). Expensive is allowed (e.g. a €300
  boat rental); it must just be visible. A guess is required even when exact prices aren't published.
- **Per run:** up to 25 per category.
- **No mistakes:** only real, currently operating places/events, each with a link the agent checked;
  unverifiable → say so, don't pad.

## Lithuanian reading game `skaitymas` (owner: "Build already", 2026-11-24; built)

Runner: **Ponas** (`docunest/ANDROID-APPS` → `ponas/games/skaitymas`). Backend: `domains/reading`
here (table `reading_attempt`, RLS on). Details: `domains/reading/README.md`.

Levels (one game, a menu with eight tiles; ids are what the logs and summary use):

| id | Branch | Level | What the child does |
|---|---|---|---|
| 1 | A owner | Syllables | Hears a pair (86: consonant+vowel, diphthongs), taps it among 3→9 tiles. Decoys: random → same consonant/vowel → reversed and sound-alike. |
| 2 | A owner | Letter tiles | Picture + word sound; builds the 5-letter word from its letters + 2–4 decoys; each tap says the letter; instant feedback; the right letter pulses after 2 misses (hint). |
| 3 | A owner | Writing | Writes each letter in a big area; recognised letters fill cells. JS recogniser (no Google services on the tablet), generous: top 3, accent marks forgiven. Hint sound after 3 tries, letter given after 5. |
| 4 | A owner | Camera | **Not built**: needs camera access in the APK and a DeepSeek route here. |
| 11 | B Montessori | Sound game | First (later also last) sound of a pictured word, among 3–4 letters. |
| 12 | B Montessori | Moveable alphabet | Builds the word freely from red/blue letters, then checks; wrong letters go back. |
| 13 | B Montessori | Pink series | Reads a short phonetic word (no sound), taps its picture. |
| 14 | B Montessori | Blue series | Same with the 5-letter words. |
| 15 | B Montessori | Green series | Hears a word, picks its letter group (uo, ie, au, ai, ei, ui, dž). |

All levels: 10 rounds per visit, about 10 minutes per session, difficulty moves to keep ~80–85 %
first-try success, words cycle as a deck with misses returning a few rounds later, mistakes get a
soft sound and another try. No answer is shown while answering.

Content: `data.js` in the game. Audio pre-generated offline (Mbrola lt1 / espeak-ng, no API key:
owner "make API keys optional"); photos from Wikimedia Commons, bundled, credits in `img/credits.json`.
Logs: every answer → `POST /api/reading/attempts` (no token: trusted devices). Summary: `/reading`,
behind the normal MapPal login.

### Word management (owner "Go, build it", 2026-11-25; building)

Design: `domains/reading/DESIGN.md`. In short: the words move to the backend (one list for all
games); a parent mode in the MapPal web app (`/reading/words`) lists every word with photo,
status (Naujas / Mokomės / Extra pamokos / Išmokta), difficulty, grade (1–3 suns or a plain grey
bomb) and lesson count; a word screen picks the photo (or uploads/takes one) and the voice per
clip kind (word, letter by letter, syllables) from Azure Ona, Ona HD, Leonas or the parent's
recording, then approves the word. Games keep a heavy offline cache and auto-update; everything
works with one word.

Later: Level 4 camera, MCP for the analysis agent, gamification module.
