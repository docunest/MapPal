---
name: docunest-hosting
description: HARD RULES for every docunest project (github.com/docunest/*). Covers shared hosting, upkeep, devices, non-functional needs, security and how to report to the owner. All apps share one repo (docunest/monorepo), one Next.js app, one Vercel project (MapPal's), one Supabase Postgres and one set of keys. Each app is a DDD domain section that never mixes with another. Each device runs exactly one app. Daily security upkeep runs without asking. Work is merged and deployed without asking once refined. Every build ends with one sentence plus a link or version. Load it BEFORE any work in a docunest repo. Always load it for any app, feature, page, API, table, migration, env var, token, login, device/Android/iPhone/head-unit work, sync or real-time, build, deploy, merge, dependency or security update. Also load it when the owner names an app (MapPal, Grocery/Pirkiniai, Reelbox, Ponas, Dock, Camper, BatteryPro, heater).
---

# docunest: hard rules for every session

These are the owner's standing decisions (2026-11-20). Do not ask the owner to
restate or re-confirm any of them. Everything here is the default for **every**
app unless the owner explicitly says otherwise for that app.

## 0. Scope and rule changes (read first)

- **The session's goal sets the scope.** Do only what the owner asked in this
  session. Don't start side work the owner didn't ask for (audits, upkeep,
  touching other repos, refactors) without asking first, even if this skill
  allows it elsewhere.
- **Catch new standing requirements.** If the owner says something that sounds
  like a rule for all work ("always", "never", "from now on", "every app",
  "by default"), or something that contradicts this skill, stop and ask one
  question: *"Add this to the docunest-hosting skill?"* (yes / no / only for
  this app).
  - On yes, update the canonical copy, then all repo copies (see the end of
    this file).
  - Never silently follow or silently ignore a conflicting instruction.

## 1. Talking to the owner

- **Results, not process.** Simple words, short. No thought process, no
  20-page reports. Offer details instead of giving them: end with
  *"Ask 'explain' for details."* when there is more to say.
- **Never bury a question.** If you need the owner, the question goes first,
  alone, answerable in one tap (use the question tool with a recommended
  option). Don't put it in the middle of a summary.
- **Every build or deploy ends with ONE sentence:** did it work, and where the
  result is.
  - Web: the clickable production URL of the page that changed.
  - Android: app name, **version number** (`versionName`/`versionCode`) and
    the release/APK link.
  - iPhone/Tizen: version plus how to get it (link, Expo Go link, `.wgt`
    release).
  - Failed: say what failed in the same sentence and what you're doing about
    it.
- **Merge permission is standing.** Once work is refined with the owner and
  proven (tests pass, it runs on the real deployment or device), merge it to
  the default branch and let it deploy. Don't ask "shall I merge?". Ask only
  if the owner hasn't agreed the *what* yet.
  - Small fixes and upkeep need no agreement.
  - Bigger features need the agreed plan (see each app's `docs/PLAN.md`).

## 2. Upkeep (part of every task)

> **Status: PAUSED.** Don't run upkeep or the scheduled task until the owner
> approves this skill and says "upkeep on". Then delete this line.

Every repo has an `upkeep.json` at its root:
`{"lastAudit": "<ISO time>", "result": "<one line>"}`.

- **At the start of any session in a docunest repo**, read it. If it's missing
  or older than **24 h**, run the audit before (or alongside) the task:
  1. For each npm project in the repo (each `package-lock.json`), run `npm audit`.
     Fix security issues: `npm audit fix`, bump to the patched version, or use
     `overrides` for transitive deps.
     - Use `--force`/major bumps only if tests and the build still pass.
     - Also bump outdated framework *patch* versions (Next.js, React, Prisma)
       when they carry security fixes.
  2. Android (Gradle): check the AGP, Kotlin and library versions for known
     CVEs. Bump patch versions with security fixes.
  3. Prove it: tests, typecheck, lint, build. For a web app, check the
     deployed URL after merging.
  4. Merge and deploy **without pinging the owner**. Rebuild and release an APK
     only if the fix touches what ships in it.
  5. Update `upkeep.json` and commit as `upkeep: <summary>`.
  6. Tell the owner only if a fix can't be applied safely. Say that in one
     sentence at the end.
- A **daily scheduled task** ("docunest daily upkeep", 03:17 Europe/Madrid)
  does the same across all repos even when nobody is working.
- Legacy repos (`mapply`, `base2`, `chatgpt`) are excluded.
- Every feature includes its upkeep:
  - tests that guard it;
  - deps pinned to patched versions;
  - no abandoned packages;
  - its README says how to check it's alive (health URL, version).

## 3. Same architecture everywhere

| Layer | Rule |
|---|---|
| Repo | **`docunest/monorepo`** for all server and web code. `docunest/ANDROID-APPS` only for device apps (one folder per device app). `docunest/shared-supabase` is the table-prefix registry. `docunest/claude` holds this skill (canonical copy). No new repos. |
| Framework | **One Next.js app** (App Router) at the monorepo root: one `package.json`, one build, one router. No second server or framework (no new NestJS/Express/Vite server). Next.js here is newer than your training: read `node_modules/next/dist/docs/` first. `proxy.ts` replaces `middleware.ts`. |
| Deploy | **One Vercel project: MapPal's existing one** (it has the domain and keys devices already use). Production deploys from the default branch. No other Vercel project or host. |
| Database | **One Supabase Postgres** (MapPal's project), `public` schema. No new DB, schema or Supabase project. |
| Keys | One set of env vars on the one Vercel project (see §7). Reuse, don't add accounts. |
| Real-time | Supabase Realtime + poll fallback (see §6). |
| Native | Thin. As much logic as possible in the shared web app, so a fix doesn't need an app update. |

### DDD: each app is a bounded context

```
app/                         one router: thin route files only
  <app>/…                    pages       → https://<host>/<app>
  api/<app>/…                API         → https://<host>/api/<app>/…
  api/core/…                 health, identity, admin
domains/
  core/                      shared kernel: db, migrations runner, identity, env, realtime, AI/Google clients with caps, UI kit
  <app>/
    index.ts                 the ONLY public surface other code may import
    domain/                  entities, value objects, rules: pure TS, no IO, no framework
    application/             use cases (one file per action) that call domain + ports
    infrastructure/          db repositories (<app>_* tables), external APIs, realtime channels
    ui/                      React components
    migrations/NNN_name.sql
    test/                    domain rules tested without DB or network
    README.md                what it does, how to check it's alive
```

- `domains/<app>` imports only `domains/core` and npm packages. **Never another
  `domains/<other>`.** `core` never imports an app. ESLint
  `no-restricted-imports` plus a boundary test enforce this, and CI fails on a
  violation.
- Route files call application use cases. No business logic in `app/`.
- An app reads and writes only its own `<app>_*` tables. Apps talk to each
  other only through a published API route or a core event/realtime channel,
  never through each other's tables or code.
- If two apps need the same thing, move it into `core` as its own change and
  keep it generic. No copy-paste between apps.
- Removing an app means deleting its folders, its `<APP>_*` env vars and its
  `<app>_*` tables. Nothing else breaks.
- Device apps (Kotlin/JS) follow the same idea: a feature per package/folder,
  no reaching into another feature's internals.

## 4. Devices: one app per device

**Each device has exactly ONE docunest app installed.** It contains everything
that device needs. Add features to that device's app; never ask the owner to
install a second app on a device. Separate APKs per *device* are fine (car,
tablet and camper each have their own).

| Device | Who | Facts that shape the app | Its one app |
|---|---|---|---|
| **iPhone** ×2, same model | owner and partner | Main screens. The owner's iPhone is also the car's internet (hotspot `<OWNER>’s iPhone`, curly apostrophe, 172.20.10.x). Mobile data in rural Spain/Portugal: often weak or none. | The shared web app as a Home Screen app (one URL, hub with all apps). Native only case by case (below). |
| **Mac** | owner | Dev machine and desktop browser. Holds private research in `~/projects/ksw-headunit-research`. | Browser: the same web app. |
| **BMW head unit** (KSW, Android 10/API 29, Snapdragon msm8953, rooted, SELinux permissive, ADB over Wi-Fi on the hotspot) | car, used while driving | Wide landscape screen, glanceable, big touch targets, **no typing**. Internet only via the iPhone hotspot (drops often). Waze is the navigator. See `monorepo/docs/ksw/`. | `ANDROID-APPS/dock` (floating dock, places, self-updates from GitHub releases). |
| **Kid tablet** (7", Allwinner A133, 2 GB RAM / ~1.1 GB free, Android 14 Go, **32-bit only**, weak GPU, background apps killed) | kid | Lithuanian. Tiny memory: light HTML/JS, no heavy frameworks, no full-screen redraw loops. | `ANDROID-APPS/ponas` launcher (games inside). |
| **Camper Z1 wall screen** (Android) | camper | Always on, pushes camper state, takes commands. Check exact specs in its folder or with the owner before heavy UI. | Camper control app. Backend `/api/camper/*`. |
| **Samsung projector** (Tizen) | family | Remote-control D-pad navigation, no typing, signed `.wgt` installs from a PC. | Reelbox Tizen build. |

**iPhone native: case by case, simplicity wins.** Before building, *check
feasibility* and write the result in the app's README. Example: Reelbox video
can't be a plain web app because Xtream panels send no CORS headers. If native
is needed, use Expo Go (no App Store, no developer account). Don't start a
native build without that check.

## 5. Security for a personal app

These apps are used by the owner's family on 2–3 of their own devices. They
are **not** a public product. Match security to that:

- **Trusted devices.** A device that already holds a token is trusted. Don't add
  2FA, passwords on top, extra secrets per device, rate-limit theatre or
  "production hardening" the owner didn't ask for.
- **Users are name handles.** If an app needs users, ask for a name. The name
  *is* the account.
  - Renaming creates a new account, and impersonation is acceptable.
  - Apps with per-user data show a **list of accounts and a switcher**, so the
    owner can check any user's view.
  - A device can be a user too ("car", "phone").
  - Don't build email/password logins for new work. Older apps (MapPal,
    `apps/api`) have them from earlier sessions: leave them alone unless the
    owner asks.
- **Device access:** one family key, given to each device once (link or QR) and
  remembered there. Existing per-device tokens (dock, camper, grocery link) stay
  as they are.
- **Agents/MCP:** each agent or integration gets its own token, so it can be
  revoked alone.
- **The only must-dos** (cheap, because several repos are **public**: MapPal,
  ANDROID-APPS, BatteryPro):
  - Never commit secret values. Git holds only SHA-256 hashes; values live in
    Vercel env or on the device.
  - Every table gets `ENABLE ROW LEVEL SECURITY` with no policies, so the
    public Supabase API can't read it. The server's `DATABASE_URL` role
    bypasses RLS, so nothing else changes.
  - AI providers get only what the query needs, never location history or
    personal data.

## 6. Non-functional requirements (all apps)

- **Offline first.** Life on the road means patchy signal. Every app keeps
  working with what it last loaded, shows the data's age, queues writes, and
  syncs when back online.
  - Web: service worker plus IndexedDB.
  - Android: local cache.
- **Sync:** per-record `updatedAt`, last write wins. Keep it simple for a few
  users. No CRDTs unless the owner asks.
- **Real-time** (phone→car places, live grocery list, camper commands):
  - **Supabase Realtime Broadcast** on channel `<app>:<topic>`. Send a small
    "changed" ping, and clients refetch through the app's API. Don't use
    Postgres Changes, since tables are RLS-locked.
  - **Fallback:** poll (or the existing long-poll) when the socket can't connect,
    every 15–30 s while the screen is visible.
  - Target: **≤ 2 s** phone→device when both are online.
  - Long-polls on Vercel cost function time, so prefer Realtime.
- **Speed:** a cached screen shows in < 1 s, a fresh one in < 3 s on the
  iPhone. A live AI/search run shows a spinner and stays ≤ ~20 s.
- **Glanceable where it matters:** car and projector need big targets, no
  typing, one tap or D-pad.
- **Updates without reinstalling.** Logic lives in the web app, so most changes
  need no APK. Each app shows its version.
  - Android APKs self-update from GitHub releases and keep one signing key, so
    an update installs over the old app.
- **No hard dependency on paid APIs.** Google and AI are optional enrichments,
  and the app works without their keys.
- **Costs: free tiers only** (Vercel Hobby, Supabase free, Google's free
  allowance, small AI caps). Anything that would cost money needs the owner's
  yes first. Paid APIs have per-app daily and monthly caps (pattern:
  MapPal `lib/sources/usage.ts`).
- **Observability:**
  - `/api/core/health` shows `{ ok, db, missing env, version }`.
  - Devices can post debug logs (pattern: `/api/dock/logs`).
  - Never delete user history automatically unless the app says so.
- **Languages:** UI in the user's language (Lithuanian for kid and grocery).
  Place data uses local names (es/pt/ca/gl/eu).

## 7. Database and env rules

- Every table, enum, index, sequence and function carries its prefix: `<app>_`,
  or `core_`. Register the prefix in `docunest/shared-supabase` before using it.
- Migrations are plain SQL in `domains/<app>/migrations/`, applied on deploy
  and lazily on first request, and recorded in `core_migrations`.
- **Never** run `prisma migrate dev|reset`, `prisma db push` or `supabase db reset` against the shared DB:
  they can drop other apps' tables.
  - `_prisma_migrations` is MapPal's until it moves.
  - Prisma is fine as a client or to *generate* SQL.
- Never `DROP`/`ALTER`/`TRUNCATE` another app's prefix.
- Shared env:
  - `DATABASE_URL` is pooled (6543, `?pgbouncer=true`). `DIRECT_URL` is
    direct (5432).
  - `AUTH_SECRET`, `ADMIN_SEED_SECRET`.
  - `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` (default `deepseek-flash`), `GOOGLE_MAPS_API_KEY`.
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY` (realtime only).
  - App-only settings are `<APP>_*` and listed in `.env.example`.

## 8. Shared context: switching phone, PC, cloud and voice

The owner works mostly from the phone (cloud sessions, voice chat) and
sometimes from the PC. Any new session, in any mode, must be able to catch up
without the owner re-explaining.

- **Where:**
  - **Voice/chat inbox: a Google Doc named "docunest inbox"** in the owner's
    Google Drive.
    - The owner refines plans there by talking to Claude in chat or voice,
      through the Google Drive connector.
    - Agents read it at session start through the same connector, connected at
      claude.ai/customize/connectors. If a session lacks the connector, say so
      in one line and continue from the repo.
    - Format: one section per item, headed `[new] <date> <app>: <title>`. An
      agent that takes an item changes the tag to `[taken <date>]` and copies it
      into the repo.
  - **Repo memory: the private repo `docunest/claude`, folder `context/`.** It
    is the durable record for cloud and PC sessions.
    - `NOW.md`: one page with the current focus, agreed decisions, next steps,
      open questions for the owner, and a "Needs PC" list. Newest on top. Every
      session reads it first.
    - `INBOX.md`: items taken from the Google Doc, or given in a session, that
      aren't done yet. Each has a date, a status (new / in progress / done) and
      a short text.
    - `projects/<app>.md`: a running log per app with date, what changed
      (commit links), state and what's next.
  - **Setup, not done yet:** the first session that has the Google Drive
    connector creates the doc, checks that it can write to it, checks that chat
    can edit it, and records the doc link in `NOW.md`. Until then the repo
    alone is used.
- **Session start:** read `context/NOW.md`, the open items in `INBOX.md`
  and in the Google Doc, and `projects/<app>.md` for the app at hand.
- **Session end, and before the owner switches device or mode:**
  - update `NOW.md` and the app log;
  - mark the INBOX items you handled;
  - commit straight to `main` of `docunest/claude` as `context: <summary>`.
    Context files need no review.
  - When the work needs the PC, write the exact next step in `NOW.md` under
    "Needs PC" so the PC session starts from it.
- Keep entries short: facts, links and decisions. No transcripts.

## 9. New app or feature checklist

1. Which device(s) use it? Put it in **that device's one app**. On phones,
   that means a section of the web app.
2. Register the `<app>` prefix if needed. Create the DDD folders (§3).
3. Identity per §5, real-time and offline per §6, keys per §7.
4. Prove it on real data and the real deployment/device. Merge. Deploy.
5. Reply with the one-sentence result and link/version (§1).
6. Not allowed: a new repo, Vercel project, DB, login system, framework, or a
   second app on a device.

## 10. Current state and migration (2026-11-20)

The target is **not built yet**. The plan is `docs/HOSTING.md` in
`docunest/monorepo`. Until a step is done, its app keeps running where it is.

| App | Today | Target step |
|---|---|---|
| MapPal + Dock/Camper backends | own repo `docunest/MapPal`, **the Vercel project that becomes the shared one** | 1: monorepo becomes the Next.js root app with `domains/core` + `domains/mappal`, and MapPal's Vercel project is repointed to the monorepo (same domain, devices don't change) |
| Grocery / Pirkiniai | `apps/grocery`, branch `claude/grocery-list-app-5k8nfx`, own Vercel project | 2: `domains/grocery`, then delete its project |
| Reelbox API | NestJS `apps/api`, branch `claude/bold-goldberg-fbzfhr`, own Vercel project | 3: `domains/reelbox`, then delete its project |
| Device apps | `docunest/ANDROID-APPS` (dock, ponas, reelbox) | stay. One app per device |
| BatteryPro | static PWA on GitHub Pages | stays static. Any backend becomes a section |
| `mapply`, `base2`, `chatgpt` | legacy | don't build there |

Until step 1 is done, new web/server work goes into MapPal's repo as its own
DDD folder, so it moves with MapPal in step 1. It must not create a new
project.

## Before you finish

- `context/NOW.md` and the app log in `docunest/claude` are updated.
- Upkeep ran if it was due and active, and `upkeep.json` is updated.
- No new repo, project, DB, login system or framework, and no second app on a
  device.
- No cross-domain imports or table access. Tables are prefixed and registered,
  with RLS on.
- No secret values in git.
- Merged and deployed if refined and proven.
- The last line is one sentence: done or not, plus the link or version.
- If you changed this skill: edit `docunest/claude` →
  `skills/docunest-hosting/SKILL.md` first, then copy it unchanged into every
  repo's `.claude/skills/docunest-hosting/`.
