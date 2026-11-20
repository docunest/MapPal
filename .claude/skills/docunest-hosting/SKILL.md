---
name: docunest-hosting
description: HARD RULE for every docunest project (github.com/docunest/*). All the owner's apps share ONE hosting setup ("old school hosting"). There is one repo (docunest/monorepo), one Next.js app, one Vercel project, one Supabase Postgres, one login and one set of env vars/API keys. The only separation is a per-app domain section whose code must not mix with other apps. Load it BEFORE creating or changing any app, page, API route, backend, database table, migration, env var, secret, token, login, Vercel project, Supabase project, GitHub repo, CI workflow or deployment, and before choosing a framework. Also load it when the owner says "new app", "build me an app", "deploy", "host", "database", "backend", "API key", or names any of their apps (MapPal, Grocery/Pirkiniai, Reelbox, Ponas, Dock, Camper, BatteryPro, heater).
---

# docunest shared hosting: hard rule

Owner decision, 2026-11-20 (repeated many times, so do not re-ask): **every app
shares the same repo, deployment, database, login and tokens, like one
old-school hosting account. Only the domain code is separated.** It applies to
every session and every docunest repo. If a request seems to need something
outside these rules, stop and ask the owner. Do not work around them.

## The rules

1. **One repo: `docunest/monorepo`.** Every app with a server or a web UI is
   a *section* of it. Do not create a GitHub repo for an app.
   - `docunest/ANDROID-APPS` holds only device shells: APKs, Expo, Tizen, the
     head unit, kid tablet, and static GitHub Pages bundles. Their server side
     is a monorepo section.
   - `docunest/shared-supabase` is the table-prefix registry.
   - `docunest/claude` holds the canonical copy of this skill.
2. **One app, one framework: Next.js (App Router)** at the monorepo root, with
   one `package.json`, one build and one router. Do not add a second framework
   or server (no new NestJS/Express/Vite server, no `apps/<x>` with its own
   `package.json`). Next.js here is a newer version with breaking changes, so read
   `node_modules/next/dist/docs/` before writing code. `proxy.ts` replaces
   `middleware.ts`.
3. **One deployment: one Vercel project** in the owner's one Vercel account.
   Production deploys from `main`. Never create another Vercel project, and
   never use another host (Netlify, Railway, Fly, a VPS…) for app code.
4. **One database: the shared Supabase Postgres** (the project MapPal uses),
   `public` schema. Never create another database, Supabase project or schema
   per app.
5. **One login**, provided by `core`: email + password (bcrypt) and single-use
   magic links. Users live in `core_user`, the same family accounts as MapPal.
   Apps reuse it and never build their own user table.
   - Per-device tokens are allowed (car dock, camper screen, family link) but
     are stored only as SHA-256 hashes. An env var `<APP>_TOKEN` overrides one.
6. **One set of env vars / API keys** on the one Vercel project. Reuse the
   shared ones and don't ask the owner for new accounts or keys when a shared
   one fits:
   - `DATABASE_URL` is pooled (6543, `?pgbouncer=true`). `DIRECT_URL` is
     direct (5432, for migrations).
   - `AUTH_SECRET`, `ADMIN_SEED_SECRET` (the `x-admin-secret` header).
   - `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` (default `deepseek-flash`), `GOOGLE_MAPS_API_KEY`.
   - App-only settings are named `<APP>_*` (e.g. `GROCERY_TOKEN`,
     `REELBOX_DATA_KEY`) and listed in `.env.example`.
   - Never commit a secret value.
   - Paid APIs are capped per app (see MapPal's `lib/sources/usage.ts`), so one
     app can't burn the shared budget.

## Domain separation (the only wall)

Each app is identified by `<app>`, its registered prefix (`grocery`,
`reelbox`, `mappal`, …). `core` is the shared platform.

```
app/                       one Next.js router
  page.tsx                 hub: one tile per app
  login/ …                 core pages
  <app>/…                  the app's pages      → https://<host>/<app>
  api/core/…               auth, health, admin
  api/<app>/…              the app's API        → https://<host>/api/<app>/…
domains/
  core/                    db client, auth, migrations runner, env, AI/Google clients with caps, UI kit
  <app>/                   all of the app's code: lib/, components/, migrations/*.sql, test/, README.md, docs/
```

- Files in `app/<app>/` and `app/api/<app>/` are thin. They import only from
  `domains/<app>` and `domains/core`.
- `domains/<app>` may import `domains/core` and npm packages, **never another
  `domains/<other>`**. `domains/core` never imports an app.
- ESLint `no-restricted-imports` plus a test enforce this. A violation fails CI.
- An app reads and writes **only its own `<app>_*` tables** and `core_*` through
  core helpers. It never touches another app's tables.
- If two apps need the same thing, move it into `core`, as its own reviewed
  change, and keep it generic. Don't copy code between apps.
- Removing an app means deleting `domains/<app>`, `app/<app>`, `app/api/<app>`,
  its `<APP>_*` env vars and its `<app>_*` tables. Nothing else breaks.

## Database rules

- Every table, enum, index, sequence and function carries its prefix: `<app>_`, or `core_`.
- **Before using a new prefix**, check the registry and open PRs in
  `docunest/shared-supabase`, then add a row there.
- Migrations are plain SQL in `domains/<app>/migrations/NNN_name.sql`. The core
  runner applies them on deploy (and lazily on first request) and records them
  in `core_migrations` (app, name, applied_at).
- **Never run `prisma migrate dev|reset`, `prisma db push`, or `supabase db reset`
  against the shared DB.** They treat other apps' tables as drift and can drop
  them.
  - `_prisma_migrations` belongs to MapPal only, until MapPal is migrated.
  - Prisma may be used as a query client, or to *generate* SQL
    (`prisma migrate diff --script`) that you save as a migration file.
- Never `DROP`/`ALTER`/`TRUNCATE` another app's prefix, even "to clean up".

## Adding a new app (checklist)

1. Pick `<app>`. Register the prefix in `docunest/shared-supabase`.
2. Create `domains/<app>/` (README with what/why, `migrations/`, tests),
   `app/<app>/` and `app/api/<app>/`.
3. Use core login. Add a device token only if a device can't log in.
4. Reuse the shared keys. New `<APP>_*` vars go in `.env.example` and in
   `/api/core/health`'s "missing" list.
5. Add a tile on the hub page.
6. Prove it works on the deployed URL (screenshots or data), as each
   app's own AGENTS.md demands.
7. Not allowed: a new repo, Vercel project, database, Supabase project, login
   system or framework.

## Current state and migration (as of 2026-11-20)

The target above is **not built yet**. Full plan: `docs/HOSTING.md` in
`docunest/monorepo`. Until a step is done, its app keeps running where it is.
Never create anything new outside the target to "bridge" the gap.

| App | Today | Target |
|---|---|---|
| shared shell | `monorepo` `master` is still a NestJS starter | Next.js root app + `domains/core` (step 1) |
| Grocery / Pirkiniai | `apps/grocery` on branch `claude/grocery-list-app-5k8nfx`, own Next.js Vercel project, `grocery_*` | `domains/grocery` (step 2) |
| Reelbox API + shared login | NestJS `apps/api` on branch `claude/bold-goldberg-fbzfhr`, own Vercel project, `core_*`, `reelbox_*` | `domains/core` auth + `domains/reelbox` (step 3) |
| MapPal (+ Dock, Camper backends) | separate repo `docunest/MapPal`, own Vercel project, Prisma, `mappal_*` | `domains/mappal` by an owner-approved plan (step 4). Until then: an allowed exception that already shares the DB, users and keys |
| Reelbox/Ponas/Dock/Camper clients | `docunest/ANDROID-APPS` | stay there (device shells) |
| BatteryPro (AI chat PWA, heater) | static GitHub Pages, no backend | stays static. Any backend becomes a section |
| `mapply`, `base2`, `chatgpt` | legacy | don't build there |

If you are the first session that needs the shared shell (step 1), follow
`docs/HOSTING.md`, and check with the owner which existing Vercel project becomes
"the one".

## Before you finish

- Did you create a repo, Vercel project, DB, schema, login or framework? Undo
  it and ask the owner.
- Did one app import another app's code or touch its tables? Fix it.
- New tables are prefixed and the prefix is registered.
- New env vars are `<APP>_*` and documented. No secrets in git.
- If this skill changed: the canonical copy is in `docunest/claude`
  (`skills/docunest-hosting/`), and every repo copy in
  `.claude/skills/docunest-hosting/` must be identical.
