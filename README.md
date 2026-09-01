# TapeReviewer (Vercel + Supabase)

Personal trading journal — dashboard, P&L calendar, day/trade review, DAS Trader &
generic CSV import, and per-trade session video. This is the **Vercel + Supabase**
rebuild of the original self-hosted (Docker + FastAPI + SQLite + NAS) app.

- **Frontend + API:** Next.js (App Router) on **Vercel** (free Hobby plan).
- **Database:** **Supabase** Postgres (free plan).
- **Video:** linked per trade by **URL** (the free tiers can't host large recordings).
- **Auth:** a single **app password** (env var).

Both platforms are free for personal use. Supabase pauses a free project after ~7 days
of inactivity — just open the dashboard to un-pause.

---

## 1. Create the Supabase project

1. Go to <https://supabase.com> → **New project**. Pick a name and a database password.
2. Open **SQL Editor → New query**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and **Run**.
3. Open **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** secret key → `SUPABASE_SERVICE_ROLE_KEY` (server-only; keep it secret)

## 2. Deploy to Vercel

1. Push this folder to a GitHub repo.
2. On <https://vercel.com> → **Add New → Project** → import the repo.
   (If this app is a subfolder of a larger repo, set **Root Directory** to it.)
3. Add **Environment Variables** (Production + Preview):

   | Name | Value |
   |------|-------|
   | `SUPABASE_URL` | your Supabase Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | your Supabase service_role key |
   | `APP_PASSWORD` | any password you choose (leave unset to make the app public) |

4. **Deploy.** Open the URL, enter the app password, and you're in.

## 3. Local development

```bash
cp .env.local.example .env.local   # fill in the three vars
npm install
npm run dev                        # http://localhost:3000
```

The same Supabase project works for local and prod (or make a second free project for dev).

---

## Using it

- **Add trades:** the **Add Trade** button (manual entry, or drop DAS Trader day-export CSVs).
- **Generic CSV import:** the **Import** page maps arbitrary columns.
- **Videos:** open a day → pick a trade → **Link video URL**. A direct `.mp4`/`.webm`
  URL plays inline; YouTube/Drive links are stored and open in a new tab.
- **Tags, day journal, session verdict, P&L calendar** all work as before.

## What changed from the original

| Original | Now |
|---|---|
| FastAPI + SQLite in Docker | Next.js Route Handlers + Supabase Postgres |
| Videos served from a NAS bind-mount | Video **URL** per trade/day |
| Logo saved to disk | Logo stored as a base64 data URL in the `settings` table |
| `APP_PASSWORD` in `.env` | `APP_PASSWORD` Vercel env var (same `X-App-Password` header) |

The Python business logic (PnL analytics, the DAS round-trip matcher, and the CSV
importer) was ported to TypeScript and **verified byte-for-byte** against the original
on the example CSVs. See [`MIGRATION.md`](MIGRATION.md) for the full log.

## Backup

Your journal lives in Supabase Postgres. Back it up from the Supabase dashboard
(**Database → Backups**) or `pg_dump`. Videos are just URLs — nothing to back up.
