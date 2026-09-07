# Freakmount Ops ERP — Phase 1

Internal ops dashboard: purchase order tracking, QC, factory payments/cash
flow, and fulfillment monitoring, built to remove the most repetitive manual
work first. See the original build spec for full context and the phased
roadmap.

## Stack

- Next.js (App Router)
- better-sqlite3 (no native engine download required, unlike Prisma)
- Plain SQL schema (`db/schema.sql`) written to be portable to Postgres/Supabase

## Getting started

```bash
npm install
npm run seed   # creates db/freakmount.db and loads sample data
npm run dev    # http://localhost:3000
```

## Scripts

| Script | Does |
|---|---|
| `npm run seed` | (Re)creates the schema and loads seed data (`db/seed.js`) |
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
4. Forms/UI to create or edit POs
5. Sales inflow forecasting in the cash flow projection (outflow only)
6. Migration to Postgres/Supabase — the schema is written to make this easy; swap `db/index.js`'s driver and adjust `lib/automation.js` if needed
7. Real Slack posting from `daily-digest.js` (currently prints to console)
