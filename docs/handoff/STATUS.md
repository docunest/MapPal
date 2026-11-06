# STATUS — agent reports to the owner

Newest on top. Each entry: date, task, what changed (commits), evidence
(screenshots/data), blockers, questions for the owner.

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
