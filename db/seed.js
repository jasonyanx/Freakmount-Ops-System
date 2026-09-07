// Seed data for local dev / demoing the dashboard.
//
// Deliberately includes:
//   - a PO stale enough to trigger the follow-up flag
//   - a sales order stuck unfulfilled long enough to trigger the exception flag
//   - a SKU low enough on stock (relative to its run rate) to trigger a
//     reorder suggestion
const db = require('./index');

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgoISO(n) {
  return new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10);
}

function daysFromNowISO(n) {
  return new Date(Date.now() + n * DAY_MS).toISOString().slice(0, 10);
}

function hoursAgoISOTimestamp(n) {
  return new Date(Date.now() - n * 60 * 60 * 1000).toISOString();
}

const seed = db.transaction(() => {
  // Wipe existing rows so `npm run seed` is safe to re-run.
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
    db.prepare(`DELETE FROM ${table}`).run();
  }

  const insertSku = db.prepare(
    `INSERT INTO skus (id, sku, name, lead_time_days, safety_days, unit_cost)
     VALUES (@id, @sku, @name, @lead_time_days, @safety_days, @unit_cost)`
  );

  const skus = [
    { id: 1, sku: 'FM-TOTE-01', name: 'Canvas Tote', lead_time_days: 45, safety_days: 14, unit_cost: 4.2 },
    { id: 2, sku: 'FM-MUG-02', name: 'Ceramic Mug', lead_time_days: 60, safety_days: 21, unit_cost: 2.1 },
    { id: 3, sku: 'FM-CAP-03', name: 'Trucker Cap', lead_time_days: 30, safety_days: 10, unit_cost: 3.75 },
  ];
  skus.forEach((s) => insertSku.run(s));

  // ---- Purchase orders -----------------------------------------------
  const insertPo = db.prepare(
    `INSERT INTO purchase_orders
       (id, sku_id, factory_name, qty, status, order_date, expected_ship_date,
        deposit_paid, balance_due, balance_due_date, last_updated)
     VALUES (@id, @sku_id, @factory_name, @qty, @status, @order_date, @expected_ship_date,
             @deposit_paid, @balance_due, @balance_due_date, @last_updated)`
  );

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
  pos.forEach((po) => insertPo.run(po));

  // ---- Production events / QC / shipments (light coverage) -----------
  const insertEvent = db.prepare(
    `INSERT INTO production_events (po_id, event_type, event_date, notes)
     VALUES (?, ?, ?, ?)`
  );
  insertEvent.run(1, 'materials_sourced', daysAgoISO(65), 'Canvas fabric sourced from local supplier.');
  insertEvent.run(1, 'production_started', daysAgoISO(40), 'Line started, no updates since.');
  insertEvent.run(3, 'production_complete', daysAgoISO(10), 'Ready for QC.');
  insertEvent.run(6, 'production_complete', daysAgoISO(4), 'Ready for QC.');

  const insertQc = db.prepare(
    `INSERT INTO qc_reports (po_id, inspection_date, pass_fail, defect_rate, notes)
     VALUES (?, ?, ?, ?, ?)`
  );
  insertQc.run(3, daysAgoISO(4), 'pass', 0.8, 'V-Trust: minor stitching defects, within tolerance.');
  insertQc.run(6, daysAgoISO(2), 'pass', 1.2, 'V-Trust: passed with notes on print alignment.');

  const insertShipment = db.prepare(
    `INSERT INTO shipments (po_id, destination_warehouse, carrier, eta, actual_arrival, status)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  insertShipment.run(3, 'US', 'Maersk', daysFromNowISO(4), null, 'in_transit');
  insertShipment.run(4, 'US', 'Maersk', daysAgoISO(58), daysAgoISO(55), 'delivered');

  // ---- Inventory snapshots (US / CA / CN), dated today ---------------
  const insertInventory = db.prepare(
    `INSERT INTO inventory_snapshots (sku_id, warehouse, qty_on_hand, qty_in_transit, snapshot_date)
     VALUES (?, ?, ?, ?, ?)`
  );
  const today = daysAgoISO(0);
  // Tote: sells fast, low remaining stock -> should trigger a reorder suggestion.
  insertInventory.run(1, 'US', 120, 0, today);
  insertInventory.run(1, 'CA', 30, 0, today);
  insertInventory.run(1, 'CN', 0, 400, today);
  // Mug: healthy stock relative to its slower run rate.
  insertInventory.run(2, 'US', 900, 0, today);
  insertInventory.run(2, 'CA', 300, 0, today);
  insertInventory.run(2, 'CN', 0, 1000, today);
  // Cap: healthy stock.
  insertInventory.run(3, 'US', 500, 0, today);
  insertInventory.run(3, 'CA', 150, 0, today);
  insertInventory.run(3, 'CN', 0, 300, today);

  // ---- Sales orders: ~30 days of history per SKU ----------------------
  const insertSale = db.prepare(
    `INSERT INTO sales_orders (sku_id, qty, channel, order_date, ship_by_date, fulfillment_status)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

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
      insertSale.run(skuId, qty, channel, orderDate, daysAgoISO(daysAgo - 2), 'delivered');
    }
  }

  // Recent orders, mostly fulfilled...
  insertSale.run(1, 14, 'shopify', daysAgoISO(0), daysFromNowISO(2), 'shipped');
  insertSale.run(2, 3, 'amazon', daysAgoISO(0), daysFromNowISO(2), 'shipped');
  insertSale.run(3, 2, 'shopify', daysAgoISO(0), daysFromNowISO(2), 'unfulfilled');

  // ...except this one, stuck unfulfilled for days -> fulfillment exception flag.
  insertSale.run(1, 25, 'amazon', daysAgoISO(4), daysAgoISO(1), 'unfulfilled');

  // ---- Landed costs ----------------------------------------------------
  const insertLanded = db.prepare(
    `INSERT INTO landed_costs (po_id, fob_cost, freight, duty, insurance, other)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  insertLanded.run(4, 10500, 900, 315, 60, 40);
  insertLanded.run(3, 7500, 700, 225, 45, 30);
});

seed();

console.log('Seed complete: 3 SKUs, 7 POs, 30 days of sales history, inventory across US/CA/CN.');
