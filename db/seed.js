// Seed data for local dev / demoing the dashboard, and for initializing a
// fresh Postgres database (applies db/schema.sql, then loads sample data).
//
// Run with DATABASE_URL pointed at whichever database you want seeded —
// local Postgres for dev, or the Supabase/Vercel Postgres instance backing
// a deployment.
//
// Deliberately includes:
//   - a PO stale enough to trigger the follow-up flag
//   - a sales order stuck unfulfilled long enough to trigger the exception flag
//   - a SKU low enough on stock (relative to its run rate) to trigger a
//     reorder suggestion
const fs = require('fs');
const path = require('path');
const pool = require('./index');

// Resolved from process.cwd() rather than __dirname: Next.js bundles this
// module into its server build (a different directory tree at build time)
// when app/api/seed/route.js imports it — see db/index.js's identical note.
const SCHEMA_PATH = path.join(process.cwd(), 'db', 'schema.sql');
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgoISO(n) {
  return new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10);
}

function daysFromNowISO(n) {
  return new Date(Date.now() + n * DAY_MS).toISOString().slice(0, 10);
}

async function seedDatabase() {
  const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  await pool.query(schemaSql);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Wipe existing rows (children before parents) so this is safe to
    // re-run against the same database.
    for (const table of [
      'returns',
      'landed_costs',
      'shipments',
      'qc_reports',
      'production_events',
      'sales_orders',
      'inventory_snapshots',
      'purchase_orders',
      'skus',
    ]) {
      await client.query(`DELETE FROM ${table}`);
    }

    // ---- SKUs -----------------------------------------------------------
    const skus = [
      { id: 1, sku: 'FM-TOTE-01', name: 'Canvas Tote', lead_time_days: 45, safety_days: 14, unit_cost: 4.2 },
      { id: 2, sku: 'FM-MUG-02', name: 'Ceramic Mug', lead_time_days: 60, safety_days: 21, unit_cost: 2.1 },
      { id: 3, sku: 'FM-CAP-03', name: 'Trucker Cap', lead_time_days: 30, safety_days: 10, unit_cost: 3.75 },
    ];
    for (const s of skus) {
      await client.query(
        `INSERT INTO skus (id, sku, name, lead_time_days, safety_days, unit_cost)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [s.id, s.sku, s.name, s.lead_time_days, s.safety_days, s.unit_cost]
      );
    }
    // Explicit ids were inserted above without advancing the `skus_id_seq`
    // sequence — bring it in sync so any future INSERT without an explicit
    // id (e.g. a create-SKU form in a later phase) doesn't collide.
    await client.query(`SELECT setval('skus_id_seq', (SELECT MAX(id) FROM skus))`);

    // ---- Purchase orders --------------------------------------------------
    const pos = [
      {
        // Stale: in_production but untouched for 40 days -> PO follow-up flag.
        id: 1,
        sku_id: 1,
        factory_name: 'Guangzhou Canvas Co.',
        qty: 3000,
        status: 'in_production',
        order_date: daysAgoISO(70),
        expected_ship_date: daysFromNowISO(5),
        deposit_paid: 4200,
        balance_due: 8400,
        balance_due_date: daysFromNowISO(10),
        last_updated: daysAgoISO(40),
      },
      {
        id: 2,
        sku_id: 2,
        factory_name: 'Zibo Ceramics Ltd.',
        qty: 5000,
        status: 'confirmed',
        order_date: daysAgoISO(12),
        expected_ship_date: daysFromNowISO(50),
        deposit_paid: 2625,
        balance_due: 7875,
        balance_due_date: daysFromNowISO(30),
        last_updated: daysAgoISO(2),
      },
      {
        id: 3,
        sku_id: 3,
        factory_name: 'Dongguan Headwear',
        qty: 2000,
        status: 'shipped',
        order_date: daysAgoISO(50),
        expected_ship_date: daysAgoISO(3),
        deposit_paid: 1875,
        balance_due: 5625,
        balance_due_date: daysFromNowISO(4),
        last_updated: daysAgoISO(3),
      },
      {
        id: 4,
        sku_id: 1,
        factory_name: 'Guangzhou Canvas Co.',
        qty: 2500,
        status: 'received',
        order_date: daysAgoISO(120),
        expected_ship_date: daysAgoISO(60),
        deposit_paid: 3500,
        balance_due: 0,
        balance_due_date: null,
        last_updated: daysAgoISO(55),
      },
      {
        id: 5,
        sku_id: 2,
        factory_name: 'Zibo Ceramics Ltd.',
        qty: 1000,
        status: 'sent',
        order_date: daysAgoISO(3),
        expected_ship_date: daysFromNowISO(65),
        deposit_paid: 0,
        balance_due: 2100,
        balance_due_date: daysFromNowISO(2),
        last_updated: daysAgoISO(3),
      },
      {
        id: 6,
        sku_id: 3,
        factory_name: 'Dongguan Headwear',
        qty: 1500,
        status: 'qc_passed',
        order_date: daysAgoISO(35),
        expected_ship_date: daysFromNowISO(1),
        deposit_paid: 1406,
        balance_due: 4219,
        balance_due_date: daysFromNowISO(20),
        last_updated: daysAgoISO(1),
      },
      {
        id: 7,
        sku_id: 1,
        factory_name: 'Guangzhou Canvas Co.',
        qty: 1800,
        status: 'draft',
        order_date: daysAgoISO(1),
        expected_ship_date: null,
        deposit_paid: 0,
        balance_due: 0,
        balance_due_date: null,
        last_updated: daysAgoISO(1),
      },
    ];
    for (const po of pos) {
      await client.query(
        `INSERT INTO purchase_orders
           (id, sku_id, factory_name, qty, status, order_date, expected_ship_date,
            deposit_paid, balance_due, balance_due_date, last_updated)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          po.id,
          po.sku_id,
          po.factory_name,
          po.qty,
          po.status,
          po.order_date,
          po.expected_ship_date,
          po.deposit_paid,
          po.balance_due,
          po.balance_due_date,
          po.last_updated,
        ]
      );
    }
    await client.query(`SELECT setval('purchase_orders_id_seq', (SELECT MAX(id) FROM purchase_orders))`);

    // ---- Production events / QC / shipments (light coverage) -------------
    const events = [
      [1, 'materials_sourced', daysAgoISO(65), 'Canvas fabric sourced from local supplier.'],
      [1, 'production_started', daysAgoISO(40), 'Line started, no updates since.'],
      [3, 'production_complete', daysAgoISO(10), 'Ready for QC.'],
      [6, 'production_complete', daysAgoISO(4), 'Ready for QC.'],
    ];
    for (const [po_id, event_type, event_date, notes] of events) {
      await client.query(
        `INSERT INTO production_events (po_id, event_type, event_date, notes) VALUES ($1, $2, $3, $4)`,
        [po_id, event_type, event_date, notes]
      );
    }

    const qcReports = [
      [3, daysAgoISO(4), 'pass', 0.8, 'V-Trust: minor stitching defects, within tolerance.'],
      [6, daysAgoISO(2), 'pass', 1.2, 'V-Trust: passed with notes on print alignment.'],
    ];
    for (const [po_id, inspection_date, pass_fail, defect_rate, notes] of qcReports) {
      await client.query(
        `INSERT INTO qc_reports (po_id, inspection_date, pass_fail, defect_rate, notes) VALUES ($1, $2, $3, $4, $5)`,
        [po_id, inspection_date, pass_fail, defect_rate, notes]
      );
    }

    const shipmentRows = [
      [3, 'US', 'Maersk', daysFromNowISO(4), null, 'in_transit'],
      [4, 'US', 'Maersk', daysAgoISO(58), daysAgoISO(55), 'delivered'],
    ];
    for (const [po_id, destination_warehouse, carrier, eta, actual_arrival, status] of shipmentRows) {
      await client.query(
        `INSERT INTO shipments (po_id, destination_warehouse, carrier, eta, actual_arrival, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [po_id, destination_warehouse, carrier, eta, actual_arrival, status]
      );
    }

    // ---- Inventory snapshots (US / CA / CN), dated today ------------------
    const today = daysAgoISO(0);
    const inventory = [
      // Tote: sells fast, low remaining stock -> should trigger a reorder suggestion.
      [1, 'US', 120, 0],
      [1, 'CA', 30, 0],
      [1, 'CN', 0, 400],
      // Mug: healthy stock relative to its slower run rate.
      [2, 'US', 900, 0],
      [2, 'CA', 300, 0],
      [2, 'CN', 0, 1000],
      // Cap: healthy stock.
      [3, 'US', 500, 0],
      [3, 'CA', 150, 0],
      [3, 'CN', 0, 300],
    ];
    for (const [sku_id, warehouse, qty_on_hand, qty_in_transit] of inventory) {
      await client.query(
        `INSERT INTO inventory_snapshots (sku_id, warehouse, qty_on_hand, qty_in_transit, snapshot_date)
         VALUES ($1, $2, $3, $4, $5)`,
        [sku_id, warehouse, qty_on_hand, qty_in_transit, today]
      );
    }

    // ---- Sales orders: ~30 days of history per SKU ------------------------
    // Daily run rate targets (units/day) per SKU, tuned against the stock
    // above so the Tote is the one that needs reordering.
    const dailyPattern = {
      1: [9, 11, 8, 10, 12, 9, 10], // ~10/day -> reorder point ~10*(45+14)=590 vs 150 available
      2: [3, 2, 4, 3, 2, 3, 3], // ~3/day -> reorder point ~3*(60+21)=243 vs 1200 available
      3: [2, 1, 2, 2, 1, 2, 2], // ~1.7/day -> reorder point ~1.7*(30+10)=68 vs 650 available
    };

    for (let daysAgo = 29; daysAgo >= 1; daysAgo--) {
      const orderDate = daysAgoISO(daysAgo);
      for (const skuId of [1, 2, 3]) {
        const pattern = dailyPattern[skuId];
        const qty = pattern[daysAgo % pattern.length];
        const channel = daysAgo % 3 === 0 ? 'amazon' : 'shopify';
        await client.query(
          `INSERT INTO sales_orders (sku_id, qty, channel, order_date, ship_by_date, fulfillment_status)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [skuId, qty, channel, orderDate, daysAgoISO(daysAgo - 2), 'delivered']
        );
      }
    }

    // Recent orders, mostly fulfilled...
    const recentSales = [
      [1, 14, 'shopify', daysAgoISO(0), daysFromNowISO(2), 'shipped'],
      [2, 3, 'amazon', daysAgoISO(0), daysFromNowISO(2), 'shipped'],
      [3, 2, 'shopify', daysAgoISO(0), daysFromNowISO(2), 'unfulfilled'],
      // ...except this one, stuck unfulfilled for days -> fulfillment exception flag.
      [1, 25, 'amazon', daysAgoISO(4), daysAgoISO(1), 'unfulfilled'],
    ];
    for (const [sku_id, qty, channel, order_date, ship_by_date, fulfillment_status] of recentSales) {
      await client.query(
        `INSERT INTO sales_orders (sku_id, qty, channel, order_date, ship_by_date, fulfillment_status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [sku_id, qty, channel, order_date, ship_by_date, fulfillment_status]
      );
    }

    // ---- Landed costs ------------------------------------------------------
    const landedCosts = [
      [4, 10500, 900, 315, 60, 40],
      [3, 7500, 700, 225, 45, 30],
    ];
    for (const [po_id, fob_cost, freight, duty, insurance, other] of landedCosts) {
      await client.query(
        `INSERT INTO landed_costs (po_id, fob_cost, freight, duty, insurance, other)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [po_id, fob_cost, freight, duty, insurance, other]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { seedDatabase };

// CLI usage: `npm run seed` / `node db/seed.js`. When imported instead (see
// app/api/seed/route.js, which reuses the shared pool across requests), the
// caller owns the pool's lifecycle — importing this file must not print to
// stdout or close the pool out from under it.
if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('Seed complete: 3 SKUs, 7 POs, 30 days of sales history, inventory across US/CA/CN.');
      return pool.end();
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      pool.end();
      process.exitCode = 1;
    });
}
