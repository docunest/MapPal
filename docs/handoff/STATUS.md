# STATUS — agent reports to the owner

Newest on top. Each entry: date, task, what changed (commits), evidence
(screenshots/data), blockers, questions for the owner.

## 2026-11-21 — Review app `/review` + Caldas da Rainha run

- **Task:** INBOX "Review app"; and the owner's "Run for Caldas da Rainha" (run in this session's local copy — the live address isn't in the repo).
- **What changed:** `/review` (components/review, lib/review, routes `app/api/review/*`), tables `mappal_voter` + `mappal_vote` (migration `20261121180000_review_votes`, RLS on). Agent runs now keep the unchecked survivors (`backlog`, ≤ 400 per category) and a photo URL (Commons/website only). MapLibre worker served from `public/` (copied on install). Details: `lib/review/README.md`.
- **Caldas da Rainha run (local):** 154 cafes + 232 exploration spots on the map → 25 + 15 checked → 18 + 11 kept (Óbidos aqueduct, Columbeira prehistoric caves, Cesaredas waterfall, Alfeizerão castle, Malaica craft-beer taproom, Local Café tapas…); 5.7 k tokens served; weekly % not measurable from a cloud session.
- **Evidence:** `docs/evidence/review-app/README.md` (phone + desktop screenshots). 147 tests, typecheck, lint, build pass.
- **Not proven:** the owner's iPhone; production has no agent places until a run from Claude Code (local runs don't reach the live database).
- **Next (owner, later):** backlog browser and per-category settings.

## 2026-11-21 — Hybrid agent Phase 0: cost-test backend

- **Task:** INBOX "Hybrid agent Phase 0", owner's design doc + "Build".
- **What changed:** `lib/agent/` (domain / application / infrastructure, README), MCP connector `/api/agent/mcp/<token>` (9 tools: get_travel_state, plan_run, start_run, next_batch, fetch_page, fetch_image, submit_reviews, finish_run, get_run), run pages `/agent/runs`, 👍/👎 API, skill `.claude/skills/recheck-location`, migration `20261121160000_agent_phase0` (`mappal_agent_run`, `mappal_agent_review`, `mappal_agent_tile`, `mappal_travel_fix`, RLS on). Road ahead requests now record the car's position/destination. Shared MCP protocol moved to `lib/mcp/server.ts` (grocery uses it too). Google daily caps 30 → 50 (monthly unchanged, free tier). `OVERPASS_ENDPOINTS` / `MAPPAL_USER_AGENT` env overrides.
- **Evidence:** `docs/evidence/agent-phase0/README.md` — live end-to-end run at Peniche: 128 + 171 places on the map → 25 + 15 checked → 16 + 8 kept, 10.4 k tokens served, caps stop the run ("CAP HIT"), guards refuse unapproved/unsent work. 140 tests, typecheck, lint, build pass.
- **Not proven:** the weekly % (needs the owner's `/usage`), Google enrichment (no key here), the connector from the owner's Claude Code, Overpass from Vercel for the 15 km exploration query.
- **Questions for the owner:** none blocking. Run "recheck location" in Claude Code with the connector and give `/usage` before and after.

## 2026-11-20 — Grocery list module (G6) + security updates

- **Task:** owner: a grocery list app for the family (planning, dictation, store view, live sync, long-term items, DeepSeek, MCP/skill, one token link) — then "It must be the same vercel project" and "Do security updates". Logged in DECISIONS.md.
- **What changed** (branch `claude/grocery-list-app-5k8nfx`, **not on `main` yet**):
  - `/grocery` module as DDD domain `domains/grocery` (domain / application / infrastructure / ui / test, `index.ts` the only public surface) + thin routes `app/grocery`, `app/api/grocery`, `public/grocery`, `Grocery*` models (`grocery_*` tables, RLS on), migrations `20261120190000_grocery_list` + `20261120210000_grocery_rls`, `isGrocery` in `proxy.ts`. Boundary guarded by `test/boundaries.test.ts` and ESLint. MCP takes per-agent tokens (Claude, ChatGPT), not the family token. Docs: `domains/grocery/README.md`, prompts `domains/grocery/docs/PROMPTS.md`, skill `domains/grocery/docs/skill/`.
  - Security: Next 16.4.2 → 16.4.6 (5 advisories), Prisma CLI deps pinned via `overrides` (effect, deepmerge-ts), typescript-eslint/minimatch. `npm audit`: 12 → 0.
  - Checked against `.claude/skills/mappal-context`: DeepSeek calls now count against MapPal's shared cap `deepseek:grocery` (200/day, 3,000/month, on `/sources`) and the shared token counters; AI-filed products show ✨; offline banner shows when the list was last synced; live URL kept out of the repo.
- **Evidence:** `domains/grocery/docs/evidence/` (local production build, two emulated iPhones, synthetic history, AI off). 110 tests, lint, typecheck, build pass. Also running on the branch's Vercel preview (same `map-pal` project): page, token check, DB, seed catalog, parse, MCP OK; AI reported off there (`DEEPSEEK_API_KEY` apparently not set for Preview).
- **Not proven:** DeepSeek parsing/shortlist live (no key in the sandbox or on Preview; unit-tested with a fake model); real iPhone Safari Home Screen install; Claude/ChatGPT connector setup. Not tied to Spain/Portugal places (it holds no locations); item names are Lithuanian with some es/pt aliases.
- **Fix (same day):** the Home Screen icon opened the MapPal login — `/grocery` carried MapPal's manifest (start page `/`). Now `/grocery` sends no manifest and keeps the token in the address as `?t=` (old `#t=` links are rewritten), so iPhone saves `/grocery?t=…` as the start page. Owner: delete the old icon and add it again.
- **Owner feedback (same day):** unique icon per app (MapPal pin, grocery checklist, camper van, car — `/app-icons/`, root favicon moved into MapPal's metadata so other pages don't inherit it; `/camper` and `/car` also drop MapPal's manifest); small 2.5 s "+ item" toast with ↶; catalog v2 (+52 everyday items: beef/pork mince, steaks, stewing beef, hake, sardines, cured ham, curd cheese, camper toilet fluid, dog treats; Settings lists the whole catalog by section).
- **Owner feedback 2:** store rows no longer move when ticked (fixed name order); sections collapse ~1 s after their last tick (tap header to open/close); dictation always opens an opt-out review (everything ticked except what is already on the list, with "pirkta prieš N d."); DeepSeek lists a named dish's ingredients grouped under the dish (`forDish`). Evidence: `12-review-recipe.png` (DeepSeek reply simulated in the browser — no key), `13-store-section-collapsed.png`.
- **Owner feedback 3:** MCP tokens managed in the app (⚙️ → Asistentai): issue many, each named, revoke any; stored as SHA-256 in `grocery_agent_token` (RLS on), link shown once; the two earlier tokens (claude, chatgpt) moved into the table. Removed a broken MCP field from Settings (it showed `/api/mcp/<family token>`). Evidence `14-settings-agents.png`.
- **Owner feedback 4:** REST API for OpenAPI actions at `/api/grocery/v1` (listItems, addItems, markBought, removeItems, finishShopping, suggestItems, searchCatalog) with a public OpenAPI 3.1 schema at `/api/grocery/v1/openapi.json` (validated with openapi-spec-validator); same per-assistant keys as MCP (Bearer / X-API-Key / ?key=); MCP and REST share `application/agentActions.ts`. Fixed: marking a name that is on the list twice now picks the open line.
- **Owner feedback 5:** trips close by themselves 3 h after the last tick (`GROCERY_TRIP_HOURS`), store view shows when + a small "Baigti dabar"; Plan shows "Paskutinį kartą pirkta" (tap to re-add) and "Išvalyti" (clear groceries, undo); catalog review (6-year-old: no baby items, dog not cat, wet wipes → hygiene/camping; fixed two dog items catalog v2 had put under Pharmacy; migration `20261120230000_grocery_catalog_review`); DeepSeek balance in Settings, low warning below 0.50 USD (shared default); 'noriu blynų ir kavos' no longer drops kava.
- **Owner feedback 6:** auto-update: page carries its build (`app-version` meta), API replies carry the live one (`x-app-version`); open phones reload when they differ and it's safe (tested: one reload per new build, waits while a sheet is open). Design: Radix Themes chosen; mock round 2 (list-first, ≤6 store zones + Kita, offline warning only) at the owner's artifact — waiting for go + icon/accent pick.
- **Merged to `main`** on the owner's "Merge" (and standing permission, docunest-hosting §1).

## 2026-11-16 — Offline places in the web app, Home Screen app, diesel-only fuel

- **Task:** owner: "Can I have the same [offline data] as webapp?" → approved plan (Home Screen app + Offline page + Nearby fallback; manual download tap) and "diesel only" for the web Fuel tab. Logged in DECISIONS.md.
- **What changed** (branch `claude/gps-doctor-auto-fix-c1c8ww`, **not on `main` yet — needs the owner's go to deploy**):
  - Data: the car's monthly OSM packs (docunest/ANDROID-APPS, `dock/tools/poi-packs`, release `dock-poi`) now also carry the places as JSON chunks of 1/4° cells (`"web"` in `poi-manifest.json`): ES 3.8 MB, PT 0.9, FR 6.5, IT 5.5, DE 9.0 — 26 MB, largest chunk 1.9 MB.
  - `/api/offline/<file>`: passes on the manifest and chunks only (GitHub sends no CORS); `?sha=` makes each version a cacheable URL, 409 when the release moved on.
  - `lib/offline/store.ts`: IndexedDB, per-chunk resume, SHA-256 check, update = fresh download of that country, `navigator.storage.persist()`.
  - `/offline` (☰ → 📦 Offline places): countries, Download / update (same button updates; amber when newer data is out), remove, nearest from here for all four groups.
  - Nearby ⛽ / 🛒 with no signal → offline list with the data date ("no opening hours"); restaurants say they aren't offline.
  - Home Screen app: `app/manifest.ts`, icons, `public/sw.js` (pages network-first, last good copy offline; hashed assets cache-first), proxy lets the app files load without a session.
  - Fuel: diesel stations only (drops `fuel:diesel=no` and CNG/LNG/H2/electric-only; keeps LPG-noted ones — 334 normal stations in PT), badge "Diesel ✓", no LPG/AdBlue badges, Google prices diesel only. Same rule in the car packs and Road ahead.
- **Evidence:** production build + Playwright (iPhone 13, logged-in session, position A1 Pombal 39.915,-8.640): all 5 countries downloaded in 6 s from a local server, 43 MB storage, service worker registered; then **network off** and reload: `/offline` and Nearby render from the phone — `docs/evidence/offline-places-no-signal-pombal.png`, `docs/evidence/offline-nearby-fuel-no-signal-pombal.png` (Galp 450 m, Alves Bandeira 620 m, COPOMBAL/Repsol 630 m…; lookups 3–11 ms). Not yet tried on the owner's iPhone (Safari) — needs the deploy.
- **Questions for the owner:** deploy to production (merge to `main`)? The Road ahead API (`/api/dock/road`) waits on the same branch.

## 2026-11-06 — Phases 2–3 built: scenarios, stops, place store, pipeline v1

- **Task:** INBOX "Build phases 2–3", after the owner's decisions (region = stop + radius, DeepSeek with the owner's key + usage warning, aim free, recommended defaults for the rest — logged in DECISIONS.md).
- **What changed** (branch `claude/scenarios-v1`, merged to `main`):
  - DB (additive migration `20261106170704_scenarios`, applied by the app at startup): `Stop` (point + radius, FUTURE/CURRENT/PAST, soft delete + updatedAt for later sync), `Scenario` + `ScenarioVersion` (prompt + config), `ScenarioPlan` (top-down output cached per version × ISO region), `ScenarioResult` (cache per version × stop), `Poi` (place store: provider-neutral id, OSM ref, Google id only, per-field sources, per-scenario AI checks).
  - Pipeline `lib/scenarios/`: top-down (DeepSeek → brands + local keywords; no coordinates sent; falls back to seed brands), bottom-up (one Overpass query; proposes chains missing from the brand list), validator (dedupe, tiers, real/stale/unverified from map evidence, AI checks for uncertain matches, drops stale/mislabelled places with the reason), render-time tiers in local time (recommended · closed today ❌ · small open alternatives · unverified).
  - Seed scenarios Groceries and Construction stores (`lib/scenarios/defaults.ts`; prompts from PLAN.md use cases, brand seeds per country — owner to refine).
  - API: `/api/scenarios`, `/api/scenarios/:slug/{versions,run,at}`, `/api/stops`, `/api/stops/:id`, `/api/ai/usage`. Test page `/scenarios` (buttons + tiered list, evidence, OSM/Google Maps/Waze links; no map — that's phase 4).
  - DeepSeek: tokens recorded per day, call cap `deepseek:agent` 300/day · 4,000/month, balance from DeepSeek's `/user/balance`, warning below 2 USD / 15 CNY (`DEEPSEEK_LOW_BALANCE`), shown on `/scenarios`.
  - `opening_hours` helper moved to `lib/openingHours.ts` (old import path kept).
- **Evidence:**
  - `docs/evidence/scenarios-v1.md`: both scenarios at all 10 acceptance points, Thursday and Sunday morning local time, from real OSM data captured today (`test/fixtures/scenarios/`, 15 km radius). Screenshots: `docs/evidence/scenarios-groceries-sagunto.png`, `scenarios-construction-sagunto.png` (local DB, same data).
  - Groceries, top 3 on Thursday: a hypermarket or big chain at every town point (Sagunto Carrefour/Mercadona/Consum; Avilés Alcampo/Carrefour/Supercor; Matosinhos Auchan/Continente/Pingo Doce; Lisbon Auchan/Continente/Pingo Doce; Peniche Auchan Supermercado/Pingo Doce/Intermarché; Mértola Lidl; Arenas and Poncebos Masymas/BM). Pinhão: local shops (nearest big store ~10 km, shown on Sunday).
  - Sunday: big stores with Sunday-closed hours move to "Closed today ❌" (e.g. Sagunto Mercadona/Lidl, Avilés Carrefour/Mercadona, Arenas Masymas) and open small shops surface.
  - Construction stores: big-box first near cities (Sagunto Leroy Merlin 2.8 km; Avilés Brico Dépôt 4.5 km — the nearest Leroy Merlin is ~18 km, outside the radius, checked on OSM; Matosinhos Leroy Merlin/Maxmat/Brico Dépôt; Lisbon Leroy Merlin; Madrid Bricor/Leroy Merlin/Leroy Merlin Exprés). Rural: Ferretería Cabrales (Arenas, Poncebos), local hardware in Peniche.
  - Stale entries dropped with reasons (e.g. 22 at Sagunto groceries: "no hours or contact and not touched for N years").
  - DB flow checked on a local Postgres: stop created and named from Nominatim, run stored, cached tap answered in 6 ms, a PAST stop refuses to re-run after a new scenario version and keeps its old result.
  - Tests: 59 pass (13 new in `test/scenarios.test.ts`, incl. a Spanish Sunday); `next build`, lint, typecheck clean.
- **Not proven / limits (please read):**
  - AI was **off** in all evidence (no DeepSeek key in the sandbox): top-down used seed brands, uncertain places (bazaars) show as "unverified" instead of AI-checked. The AI path is unit-tested with a fake model only. First real check: tap a scenario on the live app and look at "How this was found".
  - No web search (free tier), so "real" rests on map evidence; "fake" verdicts only come from the AI check (match yes/no), not from existence checks.
  - Big stores with no mapped opening hours are listed as "Hours unknown — check before driving" (never as open). Many big stores lack hours in OSM — Google hours would fill this, but Google is optional and not wired into scenarios yet.
  - Brand tags can't tell a hypermarket from the same chain's small format (e.g. Madrid: some "Alcampo" points are small city supermarkets but are labelled Hypermarket). A "mapped as a point → smaller" rule was tried and removed: real Continente/Auchan hypermarkets are often mapped as points too.
  - Pinhão and Mértola construction: no verified store within 15 km (only unverified/bazaar entries) — shown as such, not padded.
  - Not measured on Vercel: cached tap < 3 s, live run ~20 s. Offline (phase 7) not built. Works with no Google key (Google isn't used by scenarios).
  - Scenario API needs a family login; agents can't reach it with the admin secret yet.
- **Blockers:** none for phase 4. The sandbox only reaches one Overpass mirror (maps.mail.ru, ~1 in 3 requests), so captures are slow here; production uses the normal mirrors.
- **Questions for the owner:**
  1. Try `/scenarios` on the live app at a real stop (with your DeepSeek key set): are the top 3 right? The brand tiers in `lib/scenarios/defaults.ts` are a first guess — tell me what to move.
  2. Go ahead with phase 4 (one-tap map UI)?
  3. Still open from the decision list: should AGENTS.md goals G1–G3 be rewritten to match PLAN.md?

## 2026-11-06 — Answer plan questions + open decisions for the new plan

- **Task:** owner's answers to the three questions in the entry below, plus the list of open decisions (PLAN.md build phase 1).
- **What changed (commit "handoff: answer plan questions"):**
  - New `docs/DOCK.md`: car dock backend (old §8) and the migrations note, moved unchanged. Camper section: the old plan had no camper spec, so it holds the AGENTS.md G5 text plus pointers to the code (`app/api/camper/`, `lib/camper/auth.ts`, `/camper`). Nothing else was written for it.
  - New `docs/DATA-RULES.md`: old §7a–7d moved unchanged. I also moved the Google Places cost guardrails from old §7, because `lib/sources/usage.ts` cites them and they are a live cost rule.
  - Code comments now point to `docs/DATA-RULES.md`, in `prisma/schema.prisma`, `lib/sources/types.ts`, `lib/sources/usage.ts`, `lib/prompts/store.ts`, `lib/prompts/placeholders.ts`, `lib/feedback.ts` and `components/nearby/ExplainPanel.tsx`. Only comments changed.
  - `AGENTS.md`: G4 and G5 point to `docs/DOCK.md`.
  - `docs/PLAN.md`: phase 1 is "Resolve the open decisions listed in docs/handoff/STATUS.md." The header note now points to DATA-RULES.md and DOCK.md.
  - Skill: it already existed on `main`, so I didn't recreate it. Phase 1 now reads "Follow docs/PLAN.md". Apart from that line, its body still matches PLAN.md (checked with diff).
  - `DECISIONS.md`: four entries for the answers above.
- **Evidence:** no references to `docs/PLAN.md §…` remain outside `docs/archive/` and `docs/handoff/` (checked with grep).
- **Blockers:** none.
- **Open decisions for the new plan (questions for the owner).** My recommendation follows each "→". Facts about third-party terms are from memory, so verify them before relying on them.
  1. **Backend host.** The app is deployed on Vercel today. "Vertex" usually means Vertex AI, Google Cloud's AI-model platform; it isn't a web host. → Keep Vercel for the app. If you meant Vertex AI, that belongs under question 2.
  2. **LLM provider(s) for the three agents** (top-down, bottom-up, validator), plus a monthly AI budget. Today only DeepSeek is wired in (optional, labelled AI). The options are Claude, DeepSeek, or Gemini via Vertex AI, and they can be mixed (a cheap model for queries, a stronger one for the validator). → Tell me which provider(s) and a monthly cap.
  3. **Google key and monthly budget.** Who owns the key, and what's the cap? The old rule was "stay inside the free tier, $0". The new plan adds photo/review previews and a Google map layer, which use more calls. Two Google terms limit the design: Google Places content may only be shown on a Google map, and only place IDs may be stored long term (coordinates for a short time). So ratings, reviews and photos can't go into the result cache or offline packs. → Show Google content live, only on tap. When a Google preview opens, show it on a Google map. Keep cached results and offline packs to OSM data and our own data.
  4. **Web evidence for the validator.** Which web search API, and its budget? Facebook has no public API for searching pages, and scraping it breaks its terms. → One paid search API with a monthly cap. Facebook only when a page shows up in search results.
  5. **Where batch runs happen** (pre-generating future regions, re-runs after a new prompt version). The options are Vercel cron/background jobs, GitHub Actions, or your PC. → Vercel for live taps, plus a scheduled runner for batches. The choice depends on the run length and cost of 2 and 4.
  6. **What a "region" is.** It could be a province or comarca, a fixed grid tile, or a radius around a planned stop. This choice sets the cache keys, the cost estimates and the offline pack size. → A fixed grid (for example about 10 km cells), so caches line up across trips.
  7. **Sync approach.** Devices keep a local copy (IndexedDB in the PWA and in the head-unit WebView) with last-write-wins per record. The `mappal_*` tables have no row-level security today. → Sync only through MapPal's own API routes (token or login), never with the Supabase client from devices. Sync scenarios, region tags, likes and cached results.
  8. **Offline map tiles.** OSM's public tile servers forbid bulk downloading, so region packs need another source: a downloadable vector-tile extract (e.g. Protomaps/OpenFreeMap PMTiles), a paid provider whose terms allow offline use, or no offline map (list and pins only). iPhone PWA storage is also limited. → Start with no offline map in phase 7 (list plus pins on a plain background), then add vector-tile extracts if it proves useful.
  9. **Database size.** We stay on Supabase Postgres, but which plan and what size limit? The place store and result cache grow with every region. → Measure after phase 3. Decide then.
  10. **AGENTS.md goals G1–G3 are now out of date.** The new plan replaces G1 Scout with Activities → Sightseeing and reshapes G2 into scenarios. Should I rewrite the goals section of AGENTS.md to match PLAN.md?

## 2026-11-06 — Replace PLAN.md with the updated plan

- **Task:** owner asked to replace the old plan with the updated plan (the mappal-context skill text, reviewed externally).
- **What changed (this commit):**
  - `docs/PLAN.md` now holds the skill body word for word, under a short note on top saying where it came from and where the old plan went.
  - Old plan copied unchanged to `docs/archive/PLAN-2026-10-25.md`. It still holds the car dock backend spec (§8) and the sources/prompts/likes/privacy sections (§7a–7d) that code comments cite. Its edit history stays under `docs/PLAN.md` in git log.
  - `AGENTS.md`: the G4 pointer "See docs/PLAN.md §8" now points to the archived file.
  - `DECISIONS.md`: logged the replacement.
- **Evidence:** a diff check confirmed the PLAN.md body matches the skill body exactly.
- **Blockers:** none.
- **Questions for the owner:**
  1. Build phase 1 says "resolve decisions D1–D5". The only D1–D5 on record are the old plan's (now in the archive): indexing runner, DB space, selfie signal, AI kid answers, prototype code. Are those the ones to resolve, or do you have a new D1–D5 list?
  2. The car dock (G4) and camper control (G5) backends are not described in the new plan beyond "out of scope for map work". OK to leave their spec in the archive, or should it move into its own doc (e.g. `docs/DOCK.md`)?
  3. Code comments in `lib/` and `components/` still say "docs/PLAN.md §7a–7d". Leave them, or update them to the archive path?

## 2026-11-06 — Handoff setup

- **Task:** set up the shared handoff between owner, chat Claude and coding agents.
- **What changed:**
  - `64912f0` added `docs/handoff/INBOX.md`, `STATUS.md`, `DECISIONS.md` (headers only).
  - `473c123` added `.claude/skills/mappal-context/SKILL.md`, the owner's text written as given, including the Handoff protocol section.
  - `docs/PLAN.md` is unchanged and is still the approved plan.
- **Evidence:** both commits are on `origin/main`. Checked that commit `8a26c65` (named in the skill as the data layer to reuse) exists: "WIP (unapproved prototype): live Nearby/Lens/Scout data layer".
- **Blockers:** none. INBOX has no open items yet.
- **Questions for the owner:**
  1. The skill's build phase 1 says "resolve decisions D1–D5". `docs/PLAN.md` already has D1–D5 (indexing runner, DB space, selfie signal, AI kid answers, prototype code), written for the old goals. Are these the same D1–D5, or will the PLAN.md update replace them with new ones?
  2. Should phase 1 (update `docs/PLAN.md` to the new skill context) be the first INBOX item?
