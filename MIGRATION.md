# TapeReviewer → Vercel + Supabase migration log

Tracks the conversion of the self-hosted (Docker + FastAPI + SQLite + NAS) TapeReviewer
into a **Vercel + Supabase** app, both on their free tiers.

## Decisions (locked with the owner)

| Topic | Choice | Notes |
|-------|--------|-------|
| Frontend | Keep the existing React/Vite SPA, mounted inside **Next.js (App Router)** on Vercel | Client-only catch-all route; react-router still drives in-app routing. Minimal churn. |
| Backend | **Rewrite FastAPI endpoints as Next.js Route Handlers** using `@supabase/supabase-js` | All Python business logic (analytics, DAS parser, CSV import, batches) ported to TypeScript. |
| Database | SQLite → **Supabase Postgres** | Schema ported to Postgres dialect (`supabase/schema.sql`). |
| Video | NAS file mount → **paste an external URL** per trade / per day | Free tiers can't host large session recordings. Store a URL (YouTube unlisted, Drive, self-hosted). |
| Auth | Single **app password** via env var | Matches today's behavior; checked server-side in every route via `X-App-Password`. |
| Logo | Filesystem → **base64 data URL stored in the `settings` table** | Avoids paid storage; served inline. |

## Free-tier fit

- **Vercel Hobby** — free for personal/non-commercial: static hosting + serverless route handlers, Git auto-deploy.
- **Supabase Free** — free Postgres + auto REST; pauses after ~7 days idle (just un-pause). ~500MB DB is plenty for a trade journal.

## Architecture

```
Browser ── Next.js (Vercel) ─┬─ /[[...slug]]  → client SPA (react-router)
                             └─ /api/*         → Route Handlers → supabase-js → Supabase Postgres
```

Data access pattern: tables are small (personal use), so route handlers fetch whole
tables via supabase-js and compute analytics in TypeScript — a direct port of how the
Python did it in memory. No raw SQL at runtime.

## Task checklist

- [x] Pull & study the original repo (FastAPI API surface + React SPA)
- [x] Confirm approach with owner (video / backend / auth)
- [x] Scaffold Next.js project, copy SPA in
- [x] Port Postgres schema (`supabase/schema.sql`)
- [x] Server libs: supabase client, auth, analytics, csv/das import, batches, services, brand
- [x] Route handlers for every `/api/*` endpoint
- [x] Adapt SPA: video-by-URL (replace NAS picker), settings, api helper
- [x] Next shell: layout, global CSS, client catch-all page, fonts
- [x] `npm install` + `next build` green (typecheck passes)
- [x] Verified ported logic byte-for-byte vs. original Python on the example CSVs
- [ ] Owner: create Supabase project, run schema, set env vars, deploy to Vercel

## Verification (ports vs. original Python)

Ran the original Python and the TypeScript ports over the example data and diffed:

| Module | Result |
|--------|--------|
| DAS round-trip matcher (`examples/das/*.csv`) | 667 execs → **110 trades**, net **$936.46** — **0 field mismatches** across all trades |
| Analytics (summary + July calendar) | KPIs, `start_weekday`, weekly totals, `month_net_pnl` all **identical** |
| Generic CSV importer (`examples/sample_trades.csv`) | preview rows (dates, PnL, ROI) **identical** |

Note: rounding uses round-half-up in TS vs. Python's banker's rounding; no divergence
appeared on real data (exact-`.5` cents are vanishingly rare with float PnL).

## Endpoint parity (FastAPI → Next.js route handler)

| Original FastAPI | Next.js route |
|---|---|
| `GET /api/health` | `app/api/health/route.ts` |
| `GET/PATCH /api/settings` | `app/api/settings/route.ts` |
| `POST/DELETE /api/settings/logo` | `app/api/settings/logo/route.ts` |
| `GET /api/dashboard` | `app/api/dashboard/route.ts` |
| `GET /api/calendar` | `app/api/calendar/route.ts` |
| `GET /api/days/{d}` | `app/api/days/[day]/route.ts` |
| `GET/PATCH /api/days/{d}/journal` | `app/api/days/[day]/journal/route.ts` |
| `PATCH /api/days/{d}/media` | `app/api/days/[day]/media/route.ts` |
| `POST /api/trades` | `app/api/trades/route.ts` |
| `GET/PATCH/DELETE /api/trades/{id}` | `app/api/trades/[id]/route.ts` |
| `PATCH /api/trades/{id}/video` | `app/api/trades/[id]/video/route.ts` |
| `PATCH /api/trades/{id}/marker` | `app/api/trades/[id]/marker/route.ts` |
| `GET/POST /api/tags`, `GET /api/tags/stats`, `PATCH/DELETE /api/tags/{id}` | `app/api/tags/**` |
| `POST /api/import/das`, `.../commit` | `app/api/import/das/**` |
| `POST /api/import/csv`, `.../commit` | `app/api/import/csv/**` |
| `GET/DELETE /api/imports`, `DELETE /api/imports/{id}` | `app/api/imports/**` |
| `GET /api/media/list`, `GET /media/{path}` | **Dropped** — replaced by URL model |

## Deploy steps (for the owner) — see README.md
