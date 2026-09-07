#!/usr/bin/env node
// Cron-job simulation.
//
// In production, a scheduled job (Vercel Cron / GitHub Action / Supabase
// Edge Function) would run this same logic and POST the digest to a Slack
// webhook instead of console.log (see spec's "out of scope" list — real
// Slack posting is a follow-up phase).
const {
  getReorderSuggestions,
  getPoFollowUps,
  getFulfillmentExceptions,
  getCashFlowProjection,
} = require('../lib/automation');
const pool = require('../db');

const STALE_DAYS = 5;
const FULFILLMENT_HOURS_THRESHOLD = 48;
const CASH_FLOW_WEEKS = 8;

function money(n) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function line(char = '-', len = 48) {
  return char.repeat(len);
}

async function buildDigest() {
  const [reordersAll, followUps, exceptions, cashFlow] = await Promise.all([
    getReorderSuggestions(),
    getPoFollowUps(STALE_DAYS),
    getFulfillmentExceptions(FULFILLMENT_HOURS_THRESHOLD),
    getCashFlowProjection(CASH_FLOW_WEEKS),
  ]);
  const reorders = reordersAll.filter((r) => r.needsReorder);

  const out = [];
  out.push(':: Freakmount Ops — Daily Digest ::');
  out.push(`Generated ${new Date().toISOString()}`);
  out.push('');

  out.push(`REORDER NEEDED (${reorders.length})`);
  out.push(line());
  if (reorders.length === 0) {
    out.push('  Nothing needs reordering today.');
  } else {
    for (const r of reorders) {
      out.push(
        `  ${r.sku.padEnd(12)} ${r.name.padEnd(16)} ${r.daysOfStockLeft ?? '—'} days left  ->  order ${r.suggestedQty} units`
      );
    }
  }
  out.push('');

  out.push(`PO FOLLOW-UPS — stale > ${STALE_DAYS}d (${followUps.length})`);
  out.push(line());
  if (followUps.length === 0) {
    out.push('  No POs are overdue for an update.');
  } else {
    for (const po of followUps) {
      out.push(
        `  PO#${String(po.poId).padEnd(4)} ${po.sku.padEnd(12)} [${po.status}]  ${po.daysSinceUpdate}d since last update  (${po.factoryName})`
      );
    }
  }
  out.push('');

  out.push(`FULFILLMENT EXCEPTIONS — unfulfilled > ${FULFILLMENT_HOURS_THRESHOLD}h (${exceptions.length})`);
  out.push(line());
  if (exceptions.length === 0) {
    out.push('  No orders stuck in fulfillment.');
  } else {
    for (const ex of exceptions) {
      out.push(
        `  Order#${String(ex.orderId).padEnd(4)} ${ex.sku.padEnd(12)} qty ${ex.qty}  ${ex.hoursUnfulfilled}h unfulfilled  (${ex.channel})`
      );
    }
  }
  out.push('');

  out.push(`CASH FLOW — next ${CASH_FLOW_WEEKS} weeks, factory balances due (outflow only)`);
  out.push(line());
  for (const w of cashFlow) {
    out.push(`  ${w.label}   ${money(w.amountDue).padStart(12)}   (${w.poCount} PO${w.poCount === 1 ? '' : 's'})`);
  }
  out.push('');
  out.push(line('='));

  return out.join('\n');
}

if (require.main === module) {
  buildDigest()
    .then((text) => {
      console.log(text);
      return pool.end();
    })
    .catch((err) => {
      console.error('Digest failed:', err);
      pool.end();
      process.exitCode = 1;
    });
}

module.exports = { buildDigest };
