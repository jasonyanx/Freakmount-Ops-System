import {
  getReorderSuggestions,
  getPoFollowUps,
  getFulfillmentExceptions,
  getCashFlowProjection,
} from '../lib/automation';

// Server-rendered on every request — this is a live ops dashboard, not a
// static page. Node runtime (not edge) since `pg` needs real TCP sockets.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const STALE_DAYS = 5;
const FULFILLMENT_HOURS_THRESHOLD = 48;
const CASH_FLOW_WEEKS = 8;

function money(n) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default async function DashboardPage() {
  const [reorders, followUps, exceptions, cashFlow] = await Promise.all([
    getReorderSuggestions(),
    getPoFollowUps(STALE_DAYS),
    getFulfillmentExceptions(FULFILLMENT_HOURS_THRESHOLD),
    getCashFlowProjection(CASH_FLOW_WEEKS),
  ]);
  const reorderNeeded = reorders.filter((r) => r.needsReorder);

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1>Freakmount Ops</h1>
          <div className="subtitle">Purchasing · production · fulfillment · cash flow</div>
        </div>
        <div className="meta">
          As of{' '}
          {new Date().toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </div>
      </header>

      <div className="grid">
        <ReorderCard rows={reorderNeeded} />
        <PoFollowUpCard rows={followUps} />
        <FulfillmentExceptionsCard rows={exceptions} />
        <CashFlowCard weeks={cashFlow} />
      </div>

      <p className="footer-note">
        Cash flow shown is outstanding factory balances only (outflow) — sales inflow
        forecasting is a follow-up phase. Fulfillment exceptions simulate a Shipmonk API
        poll; real 3PL/Aftership integration is also a follow-up phase.
      </p>
    </div>
  );
}

function badgeClass(count, warnAt, alertAt) {
  if (count >= alertAt) return 'alert';
  if (count >= warnAt) return 'warn';
  return '';
}

function ReorderCard({ rows }) {
  return (
    <section className="card">
      <div className="card-header">
        <h2>Reorder needed</h2>
        <span className={`count-badge ${badgeClass(rows.length, 1, 3)}`}>{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="empty-state">Every SKU has enough stock to clear its reorder point.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Days left</th>
              <th>Suggested qty</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.skuId}>
                <td>
                  <div className="mono">{r.sku}</div>
                  <div style={{ color: '#566', fontSize: 12 }}>{r.name}</div>
                </td>
                <td className={`num ${r.daysOfStockLeft !== null && r.daysOfStockLeft < 30 ? 'text-alert' : 'text-warn'}`}>
                  {r.daysOfStockLeft === null ? '—' : `${r.daysOfStockLeft}d`}
                </td>
                <td className="num">{r.suggestedQty.toLocaleString('en-US')} units</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function PoFollowUpCard({ rows }) {
  return (
    <section className="card">
      <div className="card-header">
        <h2>PO follow-ups</h2>
        <span className={`count-badge ${badgeClass(rows.length, 1, 3)}`}>{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="empty-state">No open POs are overdue for an update.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>PO</th>
              <th>SKU</th>
              <th>Status</th>
              <th>Days stale</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((po) => (
              <tr key={po.poId}>
                <td className="mono">PO#{po.poId}</td>
                <td className="mono">{po.sku}</td>
                <td>
                  <span className="pill">{po.status}</span>
                </td>
                <td className="num text-alert">{po.daysSinceUpdate}d</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function FulfillmentExceptionsCard({ rows }) {
  return (
    <section className="card">
      <div className="card-header">
        <h2>Fulfillment exceptions</h2>
        <span className={`count-badge ${badgeClass(rows.length, 1, 3)}`}>{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="empty-state">No orders stuck unfulfilled.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>SKU</th>
              <th>Qty</th>
              <th>Hours unfulfilled</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((ex) => (
              <tr key={ex.orderId}>
                <td className="mono">#{ex.orderId}</td>
                <td className="mono">{ex.sku}</td>
                <td className="num">{ex.qty}</td>
                <td className="num text-alert">{ex.hoursUnfulfilled}h</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function CashFlowCard({ weeks }) {
  const total = weeks.reduce((sum, w) => sum + w.amountDue, 0);
  return (
    <section className="card">
      <div className="card-header">
        <h2>Cash flow — next {weeks.length} weeks</h2>
        <span className="count-badge">{money(total)}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Week</th>
            <th>Amount due</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.weekIndex}>
              <td className="mono" style={{ fontSize: 12 }}>
                {w.label}
              </td>
              <td className={`num ${w.amountDue > 0 ? '' : ''}`}>
                {w.amountDue > 0 ? money(w.amountDue) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
