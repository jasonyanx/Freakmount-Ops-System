# Freakmount Ops ERP — Phase 1

Internal ops dashboard: purchase order tracking, QC, factory payments/cash
flow, and fulfillment monitoring, built to remove the most repetitive manual
work first. See the original build spec for full context and the phased
roadmap.

## Stack

- Next.js (App Router)
- Postgres via `pg` (works with Supabase, Vercel Postgres/Neon, or any
  other Postgres host — see deploy notes below)
- Plain SQL schema (`db/schema.sql`)

## Getting started

1. Get a Postgres database. Easiest options:
   - Local: `createdb freakmount` (needs a local Postgres server running)
   - Hosted: a free [Supabase](https://supabase.com) or
     [Neon](https://neon.tech) project, or Vercel's own Postgres storage
     add-on (Vercel dashboard → your project → Storage)
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to that database's
   connection string.
3. Install, seed, run:

```bash
npm install
npm run seed   # applies db/schema.sql and loads sample data
npm run dev    # http://localhost:3000
```

## Deploying to Vercel

1. Import this repo into Vercel ([vercel.com/new](https://vercel.com/new)).
2. Add a Postgres database — either Vercel's own Storage tab (Neon-backed)
   or a Supabase project — and copy its connection string into the
   project's **Environment Variables** as `DATABASE_URL`. (Vercel's own
   Postgres add-on names its variable `POSTGRES_URL`; if you use that,
   also add a `DATABASE_URL` env var with the same value, since that's
   the name this app reads.)
3. Deploy.
4. Once deployed, initialize the schema and seed data by running
   `DATABASE_URL=<that connection string> npm run seed` from your machine
   (pointed at the same database) — the app itself never writes data in
   this phase, so nothing seeds it automatically.

## Scripts

| Script | Does |
|---|---|
| `npm run seed` | Applies `db/schema.sql` and (re)loads seed data (`db/seed.js`) — safe to re-run, wipes and reloads |
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run digest` | Prints the daily ops digest to the console (`scripts/daily-digest.js`) — stands in for a scheduled job that would post the same digest to Slack |

## Automation logic

All four dashboard cards are backed by real SQL queries in `lib/automation.js`:

1. **Reorder suggestions** — run rate (last 30 days) vs. reorder point (lead time + safety stock) vs. available stock (on-hand + in-transit)
2. **PO follow-ups** — open POs untouched for N+ days
3. **Fulfillment exceptions** — orders unfulfilled for N+ hours (stands in for a Shipmonk API poll)
4. **Cash flow projection** — factory balances due, bucketed by week (outflow only — see limitations below)

## What's intentionally out of scope for this phase

1. Authentication / login
2. Real 3PL API integration (Shipmonk, Shared Warehouse Ltd) — inventory and sales data is seeded, not synced
3. Aftership integration for returns
4. Forms/UI to create or edit POs — note that `id` columns are `SERIAL`, so a later create-PO form can just omit `id` on insert and let Postgres assign it
5. Sales inflow forecasting in the cash flow projection (outflow only)
6. Real Slack posting from `daily-digest.js` (currently prints to console)
