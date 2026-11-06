# MapPal data rules

Live rules for data sources, prompts, likes and privacy. Owner confirmed on
2026-11-06 that they still apply. They were moved here unchanged from the
2026-10-25 plan (§7a–7d plus the Google cost guardrails in §7); that plan is
now history only (`docs/archive/PLAN-2026-10-25.md`). Code comments point to
the section names below.

## Sources framework
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


## Prompt templates
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


## Source tags and likes
- Each place and each piece of info shows where it came from; AI-written
  text is marked as AI.
- 👍 on a place saves it to the shared family list. 👍/👎 on a source records
  whether it was useful; liked kinds and sources rank higher later; a small
  stats page shows which sources helped.


## DeepSeek privacy rule
DeepSeek may receive: the place name, the place's coordinates, its nearby
address and nearby objects, and public text about it. Never the user's own
position, route, saved list or anything about the family.


## Google Places cost guardrails

Prices checked 2026-10-25, Places API New:

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
