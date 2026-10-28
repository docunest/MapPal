# MapPal plan — Spain & Portugal camper app

Status: **draft, waiting for owner approval** (2026-10-25). Nothing below is
built for real until the decisions at the end are made. Goals are in
`AGENTS.md`; this file says how we get there and how we prove it.

## 1. Why the current app fails the goals

| Goal | What the app does today (main branch) | Gap |
| --- | --- | --- |
| G1 Scout stops | Draw a region → tile → "Scan" → only *waterfalls* and *factories* from OSM | No photo spots, no fame/hidden-gem signal, no access/route check, no photos |
| G2 Nearby | Nothing | No food/fuel/groceries at all |
| G3 Lens | Nothing | No "around me" cards, no deep dive |

It's a batch indexer you have to drive by hand, so none of the three jobs
can be done by just opening the app.

## 2. Evidence gathered so far (real data, 2026-10-25)

Probes ran from the cloud sandbox. **OpenStreetMap (Overpass) was unreachable
from there on every attempt**, so all Lens probes below are
*Wikipedia-only*: a worst case, not the final result.

**G3 Lens, Wikipedia-only, 2.5 km radius:**
- **Matosinhos (PT):** Leixões port, Ponte móvel de Leça (moving bridge), Boa
  Nova lighthouse, Fort of São Francisco do Queijo, Leixões station. Good
  kid material. **Missing: the fish auction (lota)**, which is only in OSM.
- **Avilés old town (ES):** palaces, stations, theatre. Fine, but the probe
  point was in the old town, not by the steelworks.
- **Puerto de Sagunto (ES): 1 result — a failure.** The Spanish Wikipedia
  *has* "Central térmica de Sagunto" 1.5 km away, but it was dropped: the
  classifier only reads English descriptions. The famous blast furnace
  (Alto Horno nº 2) isn't geotagged in Wikipedia there at all → **OSM data is
  mandatory**, and classification must read es/pt/ca/gl text.
- **Pinhão / Douro (PT):** station + a river only. The Douro railway line and
  the quintas need OSM.
- **Deep dive** (tested on an ironworks with articles in two languages):
  article + history sections + Wikidata facts (opened, closed, product) +
  16 photos + YouTube links, including "how steel is made" (derived
  automatically from Wikidata's "ironworks"). In ~0.5 s.

**G1 fame signal (hidden gem vs everyone's selfie):** Wikidata sitelinks work
as a proxy: Eiffel Tower **191**, a local power station **1**. That's a
proxy for "written about everywhere", not Instagram counts (see decision D3).

**G2 Nearby: not proven yet.** It needs OSM, which was unreachable from the
sandbox. No results were invented.

**Conclusion from the evidence:** calling public OSM servers live at the
moment you need an answer is too fragile (unreachable, 504s, 7–20 s), and
Wikipedia alone misses exactly the industrial/port things the kid asks
about. → **Pre-index Spain + Portugal from OSM extracts into our own
database**, and use Wikipedia/Wikidata as enrichment.

## 3. Acceptance tests (how we prove it helps)

Real proof comes from **your family's own trips**, so step 1 collects them:

- **G1:** she names 2 areas she already scouted by hand, plus her keep/reject
  list with reasons ("blocked road", "too touristy", "great selfie").
  Pass = Scout's top 30 for that area contains **≥ 60 % of her keepers**,
  famous/touristy ones are labelled as such, and the access verdict agrees
  with her on **≥ 80 %** of spots where she knows the road situation.
- **G2:** 5 places where finding food, fuel or groceries was annoying.
  Pass = in each, the nearest open fuel (with diesel/LPG flag where mapped),
  ≥ 3 groceries and ≥ 3 food options show **in under 2 s**, nothing closed
  shown as open.
- **G3:** 5–10 things the kid actually asked about on drives, with rough
  location. Pass = each appears in Lens's **top 5** from within 3 km, and its
  deep dive has a description, history and at least one how-it-works video
  link.
- Fixed Iberian regression points (run automatically on every change):
  Puerto de Sagunto (blast furnace), Avilés (ArcelorMittal + fish market),
  Matosinhos (lota + Leixões), Pinhão (Douro line), Garganta del Cares /
  Poncebos (gorge + "car stops here, then hike"), Arenas de Cabrales (rural
  essentials), Mértola (Alentejo, sparse), Peniche (port, fish auction).

## 4. Architecture (recommended)

```
 Geofabrik spain + portugal .osm.pbf (~1.7 GB, weekly)
        │  runner (your PC or GitHub Actions — decision D1)
        ▼
 osmium tag filter → classify (G1/G2/G3 kinds, es/pt/ca/gl aware)
        → precompute Scout access verdicts from the full road network
        → enrich: Wikidata fame + photos, es/pt/en Wikipedia links
        ▼
 Supabase Postgres (mappal_poi + PostGIS index)     ← the app reads this
        ▼
 App: Nearby (instant DB query) · Lens (DB + Wikipedia deep dive)
      · Scout (DB + fame + precomputed access) · saved family trip list
```

- **Why precompute access in the runner:** the "is this road private /
  gated / a 4×4 track / height-limited" check needs the road network around
  every spot. That's slow and fragile live; offline it's a few minutes of
  processing per weekly run.
- **Coverage ledger stays:** a per-province report of what got indexed
  (counts per category). That's the original app's "did we actually look
  everywhere" idea, applied to all of Iberia.
- **Live calls that remain:** only Wikipedia/Wikidata for deep-dive text and
  photos (proven reliable above), and routing for drive times.

## 5. Phases

| # | What | Needs you? | Output / proof |
| --- | --- | --- | --- |
| 0 | Goals in `AGENTS.md`, this plan | approve | this file ✅ |
| 1 | Benchmark set from your trips (§3) | ~30 min of family input | fixtures + automated acceptance tests |
| 2 | Iberia index pipeline on the runner | runner access (D1), DB space (D2) | coverage report per province; exact row counts and DB size |
| 3 | Nearby + Lens + Scout screens on the index | — | regression points + your benchmarks pass, with screenshots |
| 4 | Field test on the road, fix what's wrong | your feedback | — |
| 5 | Optional extras, only if wanted (D3/D4): AI kid explanations and photo "what's that?", popularity from Google Places, offline mode for no-signal areas, "stops along tomorrow's drive" | approve each | — |

## 6. Decisions needed from you

- **D1 — Indexing runner.** (a) **Your PC**: run a Claude session on it (the
  Claude Desktop app, or `claude remote-control` in a terminal) so an agent
  can download and process the extracts there. Good for the first run and
  for anything needing a real browser. Downside: it must be on, with decent
  internet (~1.7 GB per refresh; painful on camper mobile data).
  (b) **GitHub Actions on a weekly schedule**: free for this size, runs
  while you're on the road, no PC needed. *Recommendation: (b) for the
  recurring index, (a) whenever a real browser or heavy experiment is
  needed.* Running a live OSM server on your PC isn't recommended: the app
  would break whenever the PC is off or offline.
- **D2 — Database space.** Rough estimate (to be measured in phase 2):
  300–400 MB for all three goals across Iberia. Supabase free tier is 500 MB
  and is **shared with your other apps** → which plan are you on?
- **D3 — "Not everyone's selfie" signal.** (a) Free and legal: Wikidata/
  Wikipedia fame + Commons photo counts, plus one-tap "check on Instagram /
  Google Maps" on every spot, so she verifies a shortlist instead of hunting.
  (b) Add Google Places review counts (strongest "everyone goes here"
  signal; needs an API key, may cost beyond the free tier). (c) Automating
  Instagram in a real browser with her account: **not recommended**, it
  breaks Instagram's terms and can get the account banned.
- **D4 — AI answers for the kid** ("explain it to me", follow-up questions,
  photo "what's that?"): needs an Anthropic API key on the deployment; costs
  cents per question. Yes or no?
- **D5 — Prototype code.** Before this plan existed, I wrote uncommitted
  prototype code in the cloud session (live Nearby/Lens/Scout/deep-dive APIs,
  access check, saved-spots table, optional AI endpoints). It's what produced
  the evidence above. Keep it as the starting point for phase 3 (pushed as
  WIP to the branch), or discard it?

## 7. First build: Nearby (draft, waiting for approval)

Owner's direction (2026-10-25): build Nearby first, as two modes.

**UI** — two tabs at the top:
- **Utilities**: Fuel · Restaurants · Groceries only. Nearest first, "open
  now" filter, diesel/LPG flags, one-tap navigate (Google Maps / Waze).
  Tap a place → details, with Google rating/reviews/hours/fuel prices when
  available.
- **Sightseeing**: photo grid of interesting things within ~3 km ("Factory ·
  1.2 km", "Fish market · 600 m"). Tap → live deep dive (Wikipedia story,
  history, facts, photos, YouTube how-it's-made); Google rating/reviews as
  fallback when there's no Wikipedia article.

**Location**: `?lat=&lng=` in the URL wins (used by the Android button);
otherwise the browser's GPS.

**Data — no pre-indexing for Nearby.** Small-radius live queries:
OpenStreetMap (free, primary), Wikipedia/Wikidata (free), Google Places
(secondary/fallback). Risk: public OSM servers are slow/flaky (seen in
testing) → mirrors + short timeouts + Google fallback for Utilities.

**Google Places cost guardrails** (prices checked 2026-10-25, Places API New):

| Use | SKU | Free / month | After free |
| --- | --- | --- | --- |
| Find the Google place for an OSM place | Text Search IDs Only | unlimited | $0 |
| Rating, hours (tap) | Place Details Enterprise | 1,000 | $20 / 1,000 |
| Reviews, fuel prices (tap) | Place Details Enterprise + Atmosphere | 1,000 | $25 / 1,000 |
| Fallback list when OSM is empty | Nearby Search Pro | 5,000 | $32 / 1,000 |

1. **Hard daily quotas set in Google Cloud console** per API (e.g. Details
   30/day, Nearby 150/day) — Google itself refuses beyond that, so the
   monthly total stays inside the free tier → expected bill **$0**.
2. **App-side counter** in our DB per SKU per day/month; stops calling Google
   before the console quota, shows "Google limit reached today".
3. **Budget alert** at $1 in Google Cloud billing (email only; the quotas are
   the real cap).
4. Google is only called on a **tap**, never for every list item on load;
   only the needed fields are requested (field masks), place IDs cached
   (allowed by Google's terms), content not stored.

**Android**: small native app with a **floating button** (overlay, needs the
"display over other apps" permission). Tap → current GPS fix → opens the
web app at `?lat=&lng=`. Delivered as an APK to install directly (not Play
Store), built by GitHub Actions.

**Proof / acceptance** — run on real points and screenshot: Arenas de
Cabrales and Mértola (rural), Matosinhos (port: lota, bridge, lighthouse),
Puerto de Sagunto (blast furnace), one Lisbon and one Madrid city point, plus
the owner's 5 hard-to-find-food/fuel places. Pass: fuel + ≥3 restaurants +
≥3 groceries in each, under ~3 s, nothing closed shown as open; Sightseeing
shows the obvious landmark in the first row.

**Build order**: N1 web Utilities + Sightseeing on free data → N2 Google
secondary source with guardrails (needs API key) → N3 Android floating
button.

### 7a. Pluggable sources framework (built first, before features)
- Every data tool is one module implementing a common `Source` interface:
  id, label, type (map data / encyclopedia / photos / reviews / AI),
  cost (free / paid), what it can answer (utilities list, sights list,
  place details, explain), timeout, and its own usage caps.
- A source is on when its key is configured and it's enabled in the app.
  Paid sources count every call in the DB (per day and month) and stop at
  their cap.
- Results from all enabled sources are merged; **every field keeps its
  source** (id + link). The UI shows source tags from that, and likes use it.
- Adding a new tool = one new module + registering it; no UI changes.
- First sources: OpenStreetMap (places), Nominatim (addresses), Wikipedia
  (es/pt/ca/gl/eu/en), Wikidata (facts), Commons (photos), Google Places
  (optional, capped at the free tier), DeepSeek (optional, labelled AI).

### 7b. Prompt templates — shared, editable by the owner and by agents
- Stored in the DB (one shared set for all users), seeded once from code
  defaults; after that the DB is the source of truth (same pattern as
  categories).
- Edited in the app at `/prompts`, with a **preview of exactly what will be
  sent** to the AI. Agents edit through the same API with the admin secret.
- Every save is a new version recording who made it (person or agent); any
  version can be restored.
- Templates can only use place-level placeholders: place name, place
  coordinates, nearby address, nearby objects, public source text, language.
  **There is no placeholder for the user's position, route or family**, so
  that can't leak by accident.

### 7c. Source tags and likes
- Each place and each piece of info shows where it came from; AI-written
  text is marked as AI.
- 👍 on a place saves it to the shared family list. 👍/👎 on a source records
  whether it was useful; liked kinds and sources rank higher later; a small
  stats page shows which sources helped.

### 7d. DeepSeek privacy rule
DeepSeek may receive: the place name, the place's coordinates, its nearby
address and nearby objects, and public text about it. Never the user's own
position, route, saved list or anything about the family.

## 8. Car dock backend (G4 — owner asked for it directly, 2026-10-26)

The head unit (rooted Android 10, docunest/android-apps `dock/`) replaces
the stock floating dock: app shortcuts + places to drive to. MapPal stores
and resolves the places.

- **Send from phone, any time** — `POST /api/dock/inbox` with the Google
  Maps share (`{"text": "<whatever the share sheet gave>"}` or `{"url": …}`).
  Short links (`maps.app.goo.gl`) are expanded server-side; coordinates come
  from the URL (`!3d!4d` place pin, `q=`, `ll=`, Waze/Apple/geo:/OSM), then
  the Google page itself, then a Nominatim search of the place name.
  `locatedBy` records which ("link" / "search" / "none") and the head unit
  marks searched pins as approximate.
- **Head unit long-polls** `GET /api/dock/items?since=…&wait=1`: the server
  holds the request until something changes (checks every 1 s, ≤25 s) and
  answers with `next` (when to ask again) — rhythm set by env
  `DOCK_LONGPOLL_SECONDS`, `DOCK_LONGPOLL_CHECK_MS`, `DOCK_POLL_DELAY_MS`,
  no APK update needed. Measured: link answered 1.1 s after sending.
  Cost note: a waiting request keeps a Vercel function alive; if that shows
  up on the bill, set `DOCK_LONGPOLL_SECONDS=0` + `DOCK_POLL_DELAY_MS=15000`.
  Upgrade path: Supabase Realtime Broadcast (needs the anon key + RLS on
  the mappal_* tables first — they're unrestricted today).
- **Bookmark here** — `POST /api/dock/items {lat,lng,clientId}`; named from
  OSM (nearest named campsite/beach/viewpoint) then Nominatim reverse.
- **Auth** — one shared token (`lib/dock/auth.ts`, committed default,
  `DOCK_INBOX_TOKEN` env overrides). Owner's call: 2 users, ~3 weeks.
- History is never deleted automatically; the head unit sorts new/unopened
  first, then recently used.

Evidence (2026-10-26, live): `maps.google.com/?q=Playa+de+las+Catedrales,+Ribadeo,+Lugo&ftid=…`
→ 43.5543, −7.1574 (search); bookmark at 43.4901, −3.5368 → "Camping Playa Joyel".
Real `maps.app.goo.gl` links (13, harvested from Stack Overflow) all resolve
to the right place, including directions links and id-only links
(`/maps/place//data=…!1s0x…:0x…` → Google's place data, e.g. "LORAMAR",
Lora del Río). The server fetches as a desktop browser — a phone user agent
gets an `intent://` app redirect instead of the map link.
Parser tests: `test/dock.test.ts` (Noja, Lagoa, Ribadeo, Lisboa, Sevilla,
València, Porto, A Coruña, Granada).

### 8a. Dock app version + logs (draft, waiting for approval — 2026-10-28)

Why: the dock now has a GPS doctor, Wi-Fi doctor and self-updates; when
something goes wrong on the road nobody can see it from here. Goal: know
which build each head unit runs, and read what the app recorded (Wi-Fi
drops and their cause, GPS glitches, update results, crashes) without
anyone copying screenshots — an agent can `curl` it in a later session.

- **Version tracking, no extra requests** — every dock API call already
  goes to MapPal; it adds headers `X-Dock-Device` (random install id),
  `X-Dock-Version`, `X-Dock-Android`, `X-Dock-Root`. Server upserts
  `mappal_dock_device` (id, version, android, root, firstSeen, lastSeen,
  versionSince) — written at most once a minute per device or when the
  version changes, so the long-poll doesn't hammer the database.
- **Logs** — `POST /api/dock/logs` `{device, version, entries: [{at, kind,
  level, msg, data}]}` (≤ 200 entries / 64 KB per call). Kinds: `crash`
  (uncaught exception + stack, saved to a file and sent on next start),
  `update` (check / install result / failure reason), `wifi` (drop + cause,
  back, no-internet spell, frozen link, rejoin tries, Android auto-join
  state), `gps` (glitches, doctor runs), `service` (start / boot).
  The app keeps a local queue (≤ 2000 entries, survives restarts and no
  signal), sends every 5 min when online, at once for crashes and failed
  updates. Table `mappal_dock_log` (device, at, receivedAt, version, kind,
  level, msg, data json), rows older than 60 days dropped on insert.
- **Reading** — `GET /api/dock/logs?device=&kind=&since=&limit=` (dock token
  or login) for agents; the `/dock` page gets a Devices box (build, last
  seen, Android, root) and the latest log lines with a kind filter.
- **Privacy** — logs contain coordinates (GPS glitches) and Wi-Fi names.
  They stay in MapPal's own database with the same access as the places
  (dock token or login) and are never sent anywhere else. Note the dock
  token is committed in the repo, so repo access = log access, as for
  places today.
- **Cost** — one small request per 5 min while the car is on; a few KB/day.

Acceptance: (1) after an update, `/dock` and the API show the new build
within a minute; (2) a test crash on the emulator appears in the logs
after restart; (3) a Wi-Fi drop recorded by the Wi-Fi doctor can be read
with `curl`; (4) entries made offline arrive after the network returns,
including across an app restart; (5) wrong token → 401, nothing stored.

### Migrations (2026-10-26)
Production's database was missing tables from two deploys although the build
runs `prisma migrate deploy` — that step isn't reaching the runtime database on
Vercel. Now every server start applies pending migrations itself
(`instrumentation.ts` → `lib/migrate.ts`, same `_prisma_migrations`
bookkeeping as the Prisma CLI, advisory lock so concurrent instances don't
race). After adding a migration run `npm run migrations:bundle`
(`test/migrations.test.ts` fails if you forget). Supabase's dashboard
"Last migration" only counts Supabase-CLI migrations, so it stays empty.
