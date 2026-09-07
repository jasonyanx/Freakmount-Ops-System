// Database connection — Postgres via `pg` (works with Supabase, Vercel
// Postgres/Neon, or any other Postgres host — just point DATABASE_URL at it).
//
// This is the ONLY file that should need to change if the host changes
// again later: keep exporting a `pool` with the standard `pg` `.query(text,
// params)` (returns a Promise<{rows}>) shape, or adapt lib/automation.js's
// call sites, which is the only other file that touches SQL.
//
// Schema is NOT applied automatically here (unlike the old better-sqlite3
// version) — running DDL on every serverless cold start is wasteful and can
// race across concurrent invocations. Instead, `npm run seed` (db/seed.js)
// applies db/schema.sql once before loading data; run it against
// DATABASE_URL whenever the schema changes or a fresh database needs it.
const { Pool } = require('pg');

// Next.js loads .env/.env.local automatically for `next dev`/`build`/`start`,
// but db/seed.js and scripts/daily-digest.js run as plain `node` scripts —
// load it here too so DATABASE_URL is available in both contexts. Safe to
// call unconditionally: dotenv never overwrites variables already set in
// the environment (e.g. by Vercel).
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Point it at a Postgres database (Supabase, ' +
      'Vercel Postgres/Neon, or local) — see README.md for setup.'
  );
}

// Local/self-hosted Postgres typically has no TLS cert to verify; hosted
// providers (Supabase, Neon, etc.) require SSL but hand out certs that
// `rejectUnauthorized: true` can't verify from the app side.
const isLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

module.exports = pool;
