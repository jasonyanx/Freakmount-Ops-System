// Automation logic — the four functions that replace manual spreadsheet
// checking with real queries against the SQLite schema.
//
// Date/time math is done in JS (not SQL date functions) on purpose: dates
// are stored as plain ISO-8601 TEXT, so this logic reads the same way
// whether the underlying engine is SQLite or Postgres — only the SQL
// query shapes (SELECT/JOIN/aggregate) would need to change on a DB swap,
// per db/index.js's migration note.
const db = require('../db');

const DAY_MS = 24 * 60 * 60 * 1000;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(n) {
  return new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(fromISO, toISO) {
  return (new Date(toISO) - new Date(fromISO)) / DAY_MS;
}

function hoursBetween(fromISO, toISO) {
  return (new Date(toISO) - new Date(fromISO)) / (60 * 60 * 1000);
}

/**
 * 1. Reorder suggestions.
 *
 * For each SKU: daily run rate from the last 30 days of sales, a reorder
 * point derived from lead time + safety stock, and how much (if any) to
 * order right now.
 */
function getReorderSuggestions() {
  const skus = db.prepare('SELECT * FROM skus ORDER BY sku').all();
  const since = daysAgoISO(30);
  const now = todayISO();

  const soldStmt = db.prepare(
    `SELECT COALESCE(SUM(qty), 0) AS total_sold
     FROM sales_orders
     WHERE sku_id = ? AND order_date >= ?`
  );

  // Latest snapshot per warehouse for the SKU (avoids double-counting if
  // multiple historical snapshots exist for the same warehouse).
  const inventoryStmt = db.prepare(
    `SELECT warehouse, qty_on_hand, qty_in_transit
     FROM inventory_snapshots i1
     WHERE sku_id = ?
       AND snapshot_date = (
         SELECT MAX(snapshot_date) FROM inventory_snapshots i2
         WHERE i2.sku_id = i1.sku_id AND i2.warehouse = i1.warehouse
       )`
  );

  return skus.map((sku) => {
    const { total_sold } = soldStmt.get(sku.id, since);
    const dailyRunRate = total_sold / 30;

    const inventoryRows = inventoryStmt.all(sku.id);
    const qtyOnHand = inventoryRows.reduce((sum, r) => sum + r.qty_on_hand, 0);
    const qtyInTransit = inventoryRows.reduce((sum, r) => sum + r.qty_in_transit, 0);
    const available = qtyOnHand + qtyInTransit;

    const reorderPoint = dailyRunRate * (sku.lead_time_days + sku.safety_days);
    const suggestedQty = Math.max(0, Math.round(reorderPoint - available));
    const daysOfStockLeft = dailyRunRate > 0 ? available / dailyRunRate : null;

    return {
      skuId: sku.id,
      sku: sku.sku,
      name: sku.name,
      dailyRunRate: Number(dailyRunRate.toFixed(2)),
      qtyOnHand,
      qtyInTransit,
      available,
      reorderPoint: Number(reorderPoint.toFixed(1)),
      suggestedQty,
      daysOfStockLeft: daysOfStockLeft === null ? null : Number(daysOfStockLeft.toFixed(1)),
      needsReorder: suggestedQty > 0,
      asOf: now,
    };
  });
}

/**
 * 2. PO follow-ups — open POs nobody has touched in a while.
 */
function getPoFollowUps(staleDays) {
  const rows = db
    .prepare(
      `SELECT po.id, po.status, po.factory_name, po.qty, po.last_updated,
              sku.sku AS sku, sku.name AS sku_name
       FROM purchase_orders po
       JOIN skus sku ON sku.id = po.sku_id
       WHERE po.status NOT IN ('received', 'cancelled')`
    )
    .all();

  const now = todayISO();

  return rows
    .map((po) => ({
      poId: po.id,
      sku: po.sku,
      skuName: po.sku_name,
      factoryName: po.factory_name,
      status: po.status,
      qty: po.qty,
      lastUpdated: po.last_updated,
      daysSinceUpdate: Math.floor(daysBetween(po.last_updated, now)),
    }))
    .filter((po) => po.daysSinceUpdate > staleDays)
    .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);
}

/**
 * 3. Fulfillment exceptions — orders stuck unfulfilled too long.
 *
 * Stands in for what a real Shipmonk API poll would flag once 3PL
 * integration exists (see spec's "out of scope" list).
 */
function getFulfillmentExceptions(hoursThreshold) {
  const rows = db
    .prepare(
      `SELECT so.id, so.qty, so.channel, so.order_date,
              sku.sku AS sku, sku.name AS sku_name
       FROM sales_orders so
       JOIN skus sku ON sku.id = so.sku_id
       WHERE so.fulfillment_status = 'unfulfilled'`
    )
    .all();

  const now = new Date().toISOString();

  return rows
    .map((so) => ({
      orderId: so.id,
      sku: so.sku,
      skuName: so.sku_name,
      qty: so.qty,
      channel: so.channel,
      orderDate: so.order_date,
      hoursUnfulfilled: Math.floor(hoursBetween(so.order_date, now)),
    }))
    .filter((so) => so.hoursUnfulfilled > hoursThreshold)
    .sort((a, b) => b.hoursUnfulfilled - a.hoursUnfulfilled);
}

/**
 * 4. Cash flow projection — outstanding factory balances due, bucketed by
 * week.
 *
 * NOTE: this is outflow only. Sales inflow forecasting is explicitly out
 * of scope for this phase (see spec §"Explicitly out of scope"); a real
 * cash flow view would net this against expected sales revenue.
 */
function getCashFlowProjection(weeks) {
  const rows = db
    .prepare(
      `SELECT id, balance_due, balance_due_date
       FROM purchase_orders
       WHERE balance_due_date IS NOT NULL AND balance_due > 0`
    )
    .all();

  const now = todayISO();
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const start = new Date(Date.now() + i * 7 * DAY_MS);
    const end = new Date(Date.now() + (i * 7 + 6) * DAY_MS);
    return {
      weekIndex: i,
      label: `${start.toISOString().slice(0, 10)} – ${end.toISOString().slice(0, 10)}`,
      amountDue: 0,
      poCount: 0,
    };
  });

  for (const row of rows) {
    const daysOut = daysBetween(now, row.balance_due_date);
    // Anything already overdue (negative daysOut) is pulled into the
    // current week's bucket rather than dropped.
    const weekIndex = Math.max(0, Math.floor(daysOut / 7));
    if (weekIndex < weeks) {
      buckets[weekIndex].amountDue += row.balance_due;
      buckets[weekIndex].poCount += 1;
    }
  }

  return buckets.map((b) => ({ ...b, amountDue: Number(b.amountDue.toFixed(2)) }));
}

module.exports = {
  getReorderSuggestions,
  getPoFollowUps,
  getFulfillmentExceptions,
  getCashFlowProjection,
};
