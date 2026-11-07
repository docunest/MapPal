# Car dock and camper control backends

MapPal is also the backend for two apps in docunest/android-apps. Both are
built and out of scope for map work. Owner approved G4 on 2026-10-26 and G5
on 2026-11-01. The dock section and the migrations note were moved here
unchanged from the 2026-10-25 plan (§8); that plan is now history only
(`docs/archive/PLAN-2026-10-25.md`).

## Car dock backend (G4)

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
- **On the phone** — main app, third tab **🚐 Car places** (`/?tab=car`,
  next to Utilities / Sightseeing; `components/nearby/CarPlacesTab.tsx`):
  the same list and map as the car, same "within 300 km or sent / driven to
  in the last 3 days, pinned and new always" view measured from the phone
  (`lib/dock/near.ts`, mirrors the head unit's `Near.kt`; `All` shows
  everything), Waze / Google Maps buttons per place. `/dock` keeps sending a
  link by hand and the share-shortcut debug log.
- **Phone without logging in** — `/car#t=<dock token>`: the same Car places
  view, signed in by the dock token (kept in the browser, removed from the
  address bar), like `/camper#t=`. The page is a public shell (`proxy.ts`);
  its data needs the token. Utilities / Sightseeing still need the login.
- **Place photos** — `GET /api/dock/items/<id>/photo` (dock token or
  session): the image itself. Wikipedia first (es/pt/ca/gl/eu/en geosearch,
  only an article within 400 m that shares a distinctive word with the name,
  `lib/dock/photo.ts`), else Google's first photo (Text Search IDs → Place
  Details `photos` → Place Photo, capped `google:place-photo` 30/day,
  900/month). `Cache-Control: private, max-age=30 days`: the head unit keeps
  it as a file and the phone browser caches it — **owner's call
  (2026-11-07)** to keep photos 30 days on the devices, although Google's
  terms only allow caching coordinates; MapPal itself stores nothing. No
  photo → 404, remembered 7 days. Credit in `X-Photo-Credit`.

Evidence (2026-10-26, live): `maps.google.com/?q=Playa+de+las+Catedrales,+Ribadeo,+Lugo&ftid=…`
→ 43.5543, −7.1574 (search); bookmark at 43.4901, −3.5368 → "Camping Playa Joyel".
Real `maps.app.goo.gl` links (13, harvested from Stack Overflow) all resolve
to the right place, including directions links and id-only links
(`/maps/place//data=…!1s0x…:0x…` → Google's place data, e.g. "LORAMAR",
Lora del Río). The server fetches as a desktop browser — a phone user agent
gets an `intent://` app redirect instead of the map link.
Parser tests: `test/dock.test.ts` (Noja, Lagoa, Ribadeo, Lisboa, Sevilla,
València, Porto, A Coruña, Granada).

## Camper control backend (G5)

The Z1 wall screen (docunest/android-apps → `camper/`) pushes its state to
`/api/camper/state` and long-polls `/api/camper/commands`; the `/camper` page
shows status and controls from anywhere. Token: only its SHA-256 is in the repo.

No written spec existed beyond this (text from `AGENTS.md` G5). The behaviour
is defined by the code: `app/api/camper/` (`state`, `commands`, `history`),
`lib/camper/auth.ts` (device token and separate browser-link token, both
stored as SHA-256 only; `CAMPER_TOKEN` env replaces the device token) and the
`/camper` page.

## Migrations (2026-10-26, applies to all backends)
Production's database was missing tables from two deploys although the build
runs `prisma migrate deploy` — that step isn't reaching the runtime database on
Vercel. Now every server start applies pending migrations itself
(`instrumentation.ts` → `lib/migrate.ts`, same `_prisma_migrations`
bookkeeping as the Prisma CLI, advisory lock so concurrent instances don't
race). After adding a migration run `npm run migrations:bundle`
(`test/migrations.test.ts` fails if you forget). Supabase's dashboard
"Last migration" only counts Supabase-CLI migrations, so it stays empty.
