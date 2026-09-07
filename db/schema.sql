-- Freakmount Ops ERP — core schema
--
-- Written in plain, portable SQL so it can move to Postgres/Supabase later
-- with minimal changes. Notes on the SQLite -> Postgres path:
--   * `id INTEGER PRIMARY KEY` is SQLite's rowid-alias autoincrement; in
--     Postgres this becomes `id SERIAL PRIMARY KEY` (or `GENERATED ALWAYS AS
--     IDENTITY`).
--   * All dates/timestamps are stored as ISO-8601 TEXT ('YYYY-MM-DD' or
--     full timestamp) rather than SQLite-only date types, so they compare
--     lexicographically the same way in both engines and cast cleanly to
--     Postgres DATE/TIMESTAMP.
--   * Booleans are stored as INTEGER 0/1 (SQLite has no native boolean);
--     Postgres will treat these as SMALLINT or you can swap to BOOLEAN.
--   * No SQLite-only pragmas, triggers, or functions are used.

CREATE TABLE IF NOT EXISTS skus (
  id              INTEGER PRIMARY KEY,
  sku             TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  lead_time_days  INTEGER NOT NULL,
  safety_days     INTEGER NOT NULL,
  unit_cost       REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id                  INTEGER PRIMARY KEY,
  sku_id              INTEGER NOT NULL REFERENCES skus(id),
  factory_name        TEXT NOT NULL,
  qty                 INTEGER NOT NULL,
  status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN (
                          'draft', 'sent', 'confirmed', 'in_production',
                          'qc_passed', 'shipped', 'received', 'cancelled'
                        )),
  order_date          TEXT NOT NULL,
  expected_ship_date  TEXT,
  deposit_paid        REAL NOT NULL DEFAULT 0,
  balance_due         REAL NOT NULL DEFAULT 0,
  balance_due_date    TEXT,
  last_updated        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS production_events (
  id          INTEGER PRIMARY KEY,
  po_id       INTEGER NOT NULL REFERENCES purchase_orders(id),
  event_type  TEXT NOT NULL,
  event_date  TEXT NOT NULL,
  notes       TEXT
);

CREATE TABLE IF NOT EXISTS qc_reports (
  id               INTEGER PRIMARY KEY,
  po_id            INTEGER NOT NULL REFERENCES purchase_orders(id),
  inspection_date  TEXT NOT NULL,
  pass_fail        TEXT NOT NULL CHECK (pass_fail IN ('pass', 'fail')),
  defect_rate      REAL,
  notes            TEXT
);

CREATE TABLE IF NOT EXISTS shipments (
  id                     INTEGER PRIMARY KEY,
  po_id                  INTEGER NOT NULL REFERENCES purchase_orders(id),
  destination_warehouse  TEXT NOT NULL,
  carrier                TEXT,
  eta                    TEXT,
  actual_arrival         TEXT,
  status                 TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS inventory_snapshots (
  id                INTEGER PRIMARY KEY,
  sku_id            INTEGER NOT NULL REFERENCES skus(id),
  warehouse         TEXT NOT NULL,
  qty_on_hand       INTEGER NOT NULL DEFAULT 0,
  qty_in_transit    INTEGER NOT NULL DEFAULT 0,
  snapshot_date     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sales_orders (
  id                  INTEGER PRIMARY KEY,
  sku_id              INTEGER NOT NULL REFERENCES skus(id),
  qty                 INTEGER NOT NULL,
  channel             TEXT NOT NULL,
  order_date          TEXT NOT NULL,
  ship_by_date        TEXT,
  fulfillment_status  TEXT NOT NULL DEFAULT 'unfulfilled'
                        CHECK (fulfillment_status IN ('unfulfilled', 'shipped', 'delivered'))
);

CREATE TABLE IF NOT EXISTS returns (
  id                 INTEGER PRIMARY KEY,
  order_id           INTEGER NOT NULL REFERENCES sales_orders(id),
  status             TEXT NOT NULL DEFAULT 'requested',
  label_created      INTEGER NOT NULL DEFAULT 0,
  aftership_synced   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS landed_costs (
  id          INTEGER PRIMARY KEY,
  po_id       INTEGER NOT NULL REFERENCES purchase_orders(id),
  fob_cost    REAL NOT NULL DEFAULT 0,
  freight     REAL NOT NULL DEFAULT 0,
  duty        REAL NOT NULL DEFAULT 0,
  insurance   REAL NOT NULL DEFAULT 0,
  other       REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_po_sku ON purchase_orders(sku_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory_snapshots(sku_id);
CREATE INDEX IF NOT EXISTS idx_sales_sku ON sales_orders(sku_id);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales_orders(fulfillment_status);
