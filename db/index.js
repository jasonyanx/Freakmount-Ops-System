// Database connection.
//
// This is the ONLY file that should need to change to migrate to
// Postgres/Supabase later: swap `better-sqlite3` for `pg` or
// `@supabase/supabase-js`, keep exporting a `db` object with the same
// `.prepare(sql).all(...params)` / `.get(...)` / `.run(...)` shape (or
// adapt `lib/automation.js`'s call sites, which is the only other file
// that touches SQL).
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Resolved from process.cwd() rather than __dirname: Next.js bundles this
// module into its server build (a different directory tree at build time),
// so a __dirname-relative path would point at a location where
// schema.sql/freakmount.db don't exist. The app is always run from the
// project root (npm scripts, `next dev`/`next start`), so cwd is reliable.
const DB_PATH = path.join(process.cwd(), 'db', 'freakmount.db');
const SCHEMA_PATH = path.join(process.cwd(), 'db', 'schema.sql');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Ensure the schema exists every time we connect (idempotent — all
// statements are `CREATE TABLE IF NOT EXISTS`).
const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schema);

module.exports = db;
