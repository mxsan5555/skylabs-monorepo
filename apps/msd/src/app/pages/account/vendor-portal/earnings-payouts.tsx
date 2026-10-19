import './member-portal.css';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getMemberSettlementDetail, type MemberSettlementDetail, type PurchaseEntitlement, type EntitlementStatus } from '../../../../api/rbac/settlements';
import { getMyVendor } from '../../../../api/rbac/vendors';
import { shortOrderNumber } from '../../../../api/rbac/orders';
import { ApiRequestError } from '../../../../api/rbac/client';
import { formatINR } from '../../../../utils/format';

function payable(e: PurchaseEntitlement): number {
  return e.adjustments.reduce((sum, a) => sum + Number(a.amount), Number(e.memberShareAmount));
}

function isReadyForPayout(e: PurchaseEntitlement): boolean {
  return e.settlementStatus === 'ON_HOLD' && !!e.holdUntil && new Date(e.holdUntil).getTime() <= Date.now();
}

// Sentence-case member voice — same wording style as this page's own "No payouts received yet."
const SETTLEMENT_STATUS_LABEL: Record<string, string> = {
  PENDING_FULFILMENT: 'Pending fulfilment',
  ON_HOLD: 'On hold',
  DISPUTED_BLOCKED: 'Blocked by dispute',
  PROCESSING: 'Processing',
  PAID: 'Paid to you',
  FAILED: 'Failed',
  VOID: 'Void',
};

const SETTLEMENT_STATUS_BADGE: Record<string, 'success' | 'warning' | 'error' | 'info'> = {
  'Pending fulfilment': 'warning',
  'On hold': 'warning',
  'Blocked by dispute': 'error',
  Processing: 'info',
  'Paid to you': 'success',
  Failed: 'error',
  Void: 'error',
};

/** Same reasoning as the Service Queue's `actionLabelFor` (`member-orders-page.tsx`) —
 *  `sky-data-table`'s `actions` prop is one fixed icon/label shared by every row, so the varying
 *  "Continue Service"/"View Record" wording is rendered as a status-style badge column instead;
 *  one constant-labelled icon action performs the actual navigation for every row. */
function voucherActionLabel(entitlementStatus: EntitlementStatus): string {
  return entitlementStatus === 'COMPLETED' || entitlementStatus === 'CANCELLED' || entitlementStatus === 'REFUNDED'
    ? 'View Record'
    : 'Continue Service';
}

const ACTION_BADGE: Record<string, 'success' | 'warning' | 'error' | 'info'> = {
  'Continue Service': 'warning',
  'View Record': 'success',
};

const STATEMENT_COLUMNS = JSON.stringify([
  { key: 'Purchase', label: 'Purchase', secondaryKey: 'Voucher Detail' },
  { key: 'Customer Paid', label: 'Customer Paid' },
  { key: 'Commission', label: 'MSD Fee' },
  { key: 'My Share', label: 'My Share' },
  { key: 'Payout Status', label: 'Payout Status', type: 'status', statusMap: SETTLEMENT_STATUS_BADGE },
  { key: 'Action', label: 'Action', type: 'status', statusMap: ACTION_BADGE },
]);

const STATEMENT_ACTIONS = JSON.stringify([{ icon: 'arrow_forward', label: 'Open', event: 'open-voucher' }]);

function toStatementRow(row: PurchaseEntitlement): Record<string, string> {
  return {
    Purchase: row.orderItem?.itemName ?? '—',
    'Voucher Detail': `Voucher ${row.voucherCode}${row.orderItem ? ` · Order ${shortOrderNumber(row.orderItem.orderId)}` : ''}`,
    'Customer Paid': formatINR(Number(row.grossAmount)),
    Commission: formatINR(Number(row.commissionAmount)),
    'My Share': formatINR(payable(row)),
    'Payout Status': SETTLEMENT_STATUS_LABEL[row.settlementStatus] ?? row.settlementStatus,
    Action: voucherActionLabel(row.entitlementStatus),
    __voucherCode: row.voucherCode,
  };
}

/**
 * Member "Earnings & Payouts" (`/account/vendor-payments`, `vendor-portal.payments`) — the
 * member's own pending/on-hold/eligible/received totals, order-wise statement, and payout
 * history. Read-only: payout controls ("Record Bank Payment") are super-admin-only and never
 * shown here, even if granted — see `member-settlement-detail.tsx`'s own doc comment.
 *
 * Calls the same `GET /settlements/members/:vendorId` the admin Member Settlements detail page
 * uses, scoped to the caller's own vendor id. By default the `vendor` role is NOT granted
 * `accounts.member-settlements:view` (see `permission-matrix.ts` — only `vendor-portal.payments:
 * view`, which has no backing self-service route today), so this will 403 until either a
 * SuperAdmin grants that permission to the vendor role (dynamic RBAC — no code change needed)
 * or a true self-scoped endpoint is added. That is reported as an exact, named backend gap
 * rather than worked around here.
 */
export function EarningsPayouts() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<MemberSettlementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setForbidden(false);
    try {
      const { data: vendor } = await getMyVendor(token);
      const { data } = await getMemberSettlementDetail(token, vendor.id);
      setDetail(data);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 403) {
        setForbidden(true);
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Could not load your earnings.');
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // `<sky-data-table>` only renders once `detail` has loaded (see the JSX below) — `tableRef.current`
  // is still null on this effect's first run at mount, and with no further dependency change it
  // would never re-attach once the table actually appears. `detail` in the dependency array is
  // what makes this effect re-run the moment the table mounts for real.
  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; row: Record<string, unknown> }>).detail;
      if (detail.action !== 'open-voucher') return;
      const voucherCode = detail.row['__voucherCode'];
      if (typeof voucherCode === 'string') navigate(`/account/vendor-orders/verify/${encodeURIComponent(voucherCode)}`);
    };
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => el.removeEventListener('sky-dt-row-action', onRowAction);
  }, [navigate, detail]);

  const totals = detail
    ? detail.statement.reduce(
        (acc, e) => {
          const amount = payable(e);
          if (e.settlementStatus === 'PENDING_FULFILMENT') acc.pending += amount;
          else if (e.settlementStatus === 'PAID') acc.received += amount;
          else if (isReadyForPayout(e)) acc.eligible += amount;
          else if (e.settlementStatus === 'ON_HOLD' || e.settlementStatus === 'DISPUTED_BLOCKED') acc.onHold += amount;
          return acc;
        },
        { pending: 0, onHold: 0, eligible: 0, received: 0 },
      )
    : null;

  const statementRows = useMemo(() => JSON.stringify(detail?.statement.map(toStatementRow) ?? []), [detail]);

  return (
    <div className="admin-page admin-page--wide member-portal">
      <title>Earnings &amp; Payouts · MSD</title>
      <meta name="robots" content="noindex" />
      <header className="page-head">
        <div>
          <h1>Earnings &amp; Payouts</h1>
          <p>Your pending, on-hold, ready-for-payout, and received balances.</p>
        </div>
      </header>

      {forbidden && (
        <p className="empty-state">
          Your account doesn’t have access to earnings data yet — ask your SuperAdmin to grant it.
        </p>
      )}
      {error && <p className="error-state" role="alert">{error}</p>}

      {loading ? (
        <p className="loading-state">Loading your earnings…</p>
      ) : detail && totals ? (
        <>
          <div className="member-payment-cards">
            {[
              { label: 'Service Pending', amount: totals.pending, note: 'Your share awaiting service completion.' },
              { label: 'On Hold', amount: totals.onHold, note: 'Within the hold period or under dispute.' },
              { label: 'Ready for Payout', amount: totals.eligible, note: 'Eligible for the next payout.' },
              { label: 'Received', amount: totals.received, note: 'Already paid to your bank account.' },
            ].map((card) => (
              <sky-card key={card.label} variant="outlined">
                <h2 className="member-card-label">{card.label}</h2>
                <p className="member-card-amount">{formatINR(card.amount)}</p>
                <p className="field-hint">{card.note}</p>
              </sky-card>
            ))}
          </div>
          <sky-card className="member-payment-strip" variant="filled">
            <strong>Total share: {formatINR(detail.statement.reduce((sum, row) => sum + payable(row), 0))}</strong>
            <span>Outstanding: {formatINR(totals.pending + totals.onHold)}</span>
            <span role="status">{totals.eligible > 0 ? `${formatINR(totals.eligible)} ready for payout` : 'Nothing ready for payout yet'}</span>
          </sky-card>

          <section aria-labelledby="my-statement-title">
            <h2 id="my-statement-title" className="section-title">Order-wise statement</h2>
            {detail.statement.length === 0 ? (
              <p className="empty-state">No vouchers yet.</p>
            ) : (
              <sky-data-table
                ref={tableRef as RefObject<HTMLElement>}
                caption="Order-wise statement"
                columns={STATEMENT_COLUMNS}
                rows={statementRows}
                total={detail.statement.length}
                page={1}
                page-size={detail.statement.length}
                actions={STATEMENT_ACTIONS}
              />
            )}
          </section>

          <details className="member-disclosure">
            <summary>Payout History</summary>
            {detail.payoutHistory.length === 0 ? (
              <p className="empty-state">No payouts received yet.</p>
            ) : (
              <div>
                {detail.payoutHistory.map((p) => (
                  <p key={p.id} className="field-hint">
                    {p.transferDate ? new Date(p.transferDate).toLocaleDateString() : new Date(p.createdAt).toLocaleDateString()}
                    {' · '}
                    {formatINR(Number(p.amount))}
                    {' · '}
                    {p.items.length} item{p.items.length === 1 ? '' : 's'}
                    {' · '}
                    {p.reference ?? 'No reference'}
                    {' · '}
                    {p.status}
                  </p>
                ))}
              </div>
            )}
          </details>
        </>
      ) : (
        !forbidden && !error && <p className="empty-state">No earnings data yet.</p>
      )}
    </div>
  );
}

export default EarningsPayouts;
