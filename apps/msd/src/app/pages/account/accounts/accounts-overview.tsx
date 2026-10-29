import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilledButton, TextButton } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getAccountsOverview, type AccountsOverview } from '../../../../api/rbac/accounts';
import { listMemberSettlements, type MemberSettlementRow } from '../../../../api/rbac/settlements';
import { ApiRequestError } from '../../../../api/rbac/client';
import { formatINR } from '../../../../utils/format';
import { CardGrid } from '../../../components/card-grid/card-grid';

/** Rows for the "Members ready for payout" preview table — `__vendorId` is a non-column, hidden
 *  field the row action reads (same convention `orders.tsx` uses), carrying the real vendor id
 *  the detail page needs. */
function toReadyRow(row: MemberSettlementRow): Record<string, string | number> {
  return {
    Member: row.businessName ?? 'Draft member',
    'Bank Reference': row.bankReferenceMasked ?? 'Not on file',
    'Branch / City': [row.primaryBranchName, row.primaryBranchCity].filter(Boolean).join(' · ') || '—',
    'Ready for Payout': formatINR(Number(row.readyForPayout)),
    __vendorId: row.vendorId,
  };
}

const READY_COLUMNS = JSON.stringify([
  { key: 'Member', label: 'Member' },
  { key: 'Bank Reference', label: 'Bank Reference' },
  { key: 'Branch / City', label: 'Branch / City' },
  { key: 'Ready for Payout', label: 'Ready for Payout' },
]);

const READY_ACTIONS = JSON.stringify([{ icon: 'visibility', label: 'View', event: 'view-member' }]);

/** Small, read-only preview of `GET /settlements/members?status=ready` — the full, searchable,
 *  server-paginated list still lives on `/account/accounts/member-settlements`. Row click/"View"
 *  navigates by the real `vendorId` (a non-column field — never the magic `__view_detail__`
 *  action, which `sky-data-table` intercepts natively to open its own generic drawer instead of
 *  ever reaching this row-action handler). */
function MembersReadyForPayout({ token }: { token: string | null }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<MemberSettlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    listMemberSettlements(token, { status: 'ready', pageSize: 10 })
      .then(({ data }) => setRows(data))
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load members ready for payout.'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const tableRows = useMemo(() => JSON.stringify(rows.map(toReadyRow)), [rows]);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; row: Record<string, unknown> }>).detail;
      const vendorId = detail.row['__vendorId'];
      if (detail.action === 'view-member' && typeof vendorId === 'string') {
        navigate(`/account/accounts/member-settlements/${vendorId}`);
      }
    };
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => el.removeEventListener('sky-dt-row-action', onRowAction);
  }, [navigate]);

  if (error) {
    return (
      <p className="error-state" role="alert">
        {error} <TextButton onClick={load}>Retry</TextButton>
      </p>
    );
  }
  if (!loading && rows.length === 0) {
    return <p className="empty-state">No member is currently ready for payout.</p>;
  }

  return (
    <sky-data-table
      ref={tableRef as RefObject<HTMLElement>}
      caption="Members ready for payout"
      columns={READY_COLUMNS}
      rows={tableRows}
      total={rows.length}
      page={1}
      page-size={10}
      loading={loading}
      actions={READY_ACTIONS}
    />
  );
}

/**
 * Super-Admin "Accounts Overview" — every number from `GET /accounts/overview`, derived live
 * from `PurchaseEntitlement`/dispute aggregates server-side (see
 * `settlement.service.ts#getAccountsOverview` / `dispute.service.ts#getDisputeAttentionSummary`)
 * — never computed client-side. Built on `CardGrid` + `sky-tile-card`/`sky-cta-banner`, the one
 * proven "cards in a row" pattern already working elsewhere (e.g. `vendor-detail-page.tsx`'s
 * setup-progress grid) — the previous `.widget-grid`/`.stat-card` markup referenced CSS classes
 * that do not exist anywhere in this repo, which is why this page rendered as a bare vertical
 * stack of unstyled text instead of a card layout.
 */
export function AccountsOverviewPage() {
  const { token, can } = useAuth();
  const navigate = useNavigate();
  const canReviewPayouts = can('accounts.member-settlements', 'view');

  const [data, setData] = useState<AccountsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    getAccountsOverview(token)
      .then(({ data }) => setData(data))
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load the Accounts overview.'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="admin-page admin-page--wide">
      <title>Accounts Overview · MSD</title>
      <meta name="robots" content="noindex" />
      <header className="page-head">
        <div>
          <h1>Accounts Overview</h1>
          <p>Customer collections, MSD commission and member payments.</p>
        </div>
        <div className="page-head__actions">
          {canReviewPayouts && (
            <FilledButton onClick={() => navigate('/account/accounts/member-settlements')}>Review Payouts</FilledButton>
          )}
        </div>
      </header>

      {error && (
        <p className="error-state" role="alert">
          {error} <TextButton onClick={load}>Retry</TextButton>
        </p>
      )}

      {loading ? (
        <p className="loading-state">Loading overview…</p>
      ) : !data ? null : (
        <>
          <CardGrid layout="compact">
            <sky-tile-card
              color="primary"
              icon="payments"
              iconStyle="surface"
              headline={formatINR(Number(data.collections))}
              text="Customer Collections — payments received from customers."
              href="/account/accounts/customer-payments"
            />
            <sky-tile-card
              color="secondary"
              icon="percent"
              iconStyle="surface"
              headline={formatINR(Number(data.commission))}
              text="MSD Commission — platform share before expenses."
            />
            <sky-tile-card
              color="tertiary"
              icon="account_balance_wallet"
              iconStyle="surface"
              headline={formatINR(Number(data.memberLiability))}
              text="Member Dues — unpaid member share."
              href="/account/accounts/member-settlements"
            />
          </CardGrid>

          {Number(data.readyForPayout) > 0 && (
            <sky-cta-banner
              color="primary"
              icon="task_alt"
              iconStyle="surface"
              headline={`${formatINR(Number(data.readyForPayout))} ready for payout`}
              text={`${data.readyForPayoutMemberCount} member${data.readyForPayoutMemberCount === 1 ? '' : 's'} eligible right now — hold period has passed, no open dispute.`}
              ctaLabel="Review Payouts"
              ctaHref="/account/accounts/member-settlements?status=ready"
            />
          )}

          <section aria-labelledby="member-dues-breakdown-title">
            <h2 id="member-dues-breakdown-title" className="section-title">Member dues breakdown</h2>
            <CardGrid layout="compact">
              <sky-tile-card
                color="surface-high"
                icon="hourglass_top"
                iconStyle="surface"
                headline={formatINR(Number(data.pendingFulfilment))}
                text="Pending Fulfilment — not yet started, completed, or shipped."
                href="/account/accounts/member-settlements"
              />
              <sky-tile-card
                color="surface-high"
                icon="lock_clock"
                iconStyle="surface"
                headline={formatINR(Number(data.onHold))}
                text="On Hold — includes amounts currently blocked by an open dispute; not double-counted elsewhere."
                href="/account/accounts/member-settlements"
              />
              <sky-tile-card
                color="secondary"
                icon="task_alt"
                iconStyle="surface"
                headline={formatINR(Number(data.readyForPayout))}
                text="Ready for Payout — hold period has passed, no open dispute."
                href="/account/accounts/member-settlements?status=ready"
              />
            </CardGrid>
          </section>

          <sky-tile-card
            color="surface-high"
            icon="account_balance"
            iconStyle="surface"
            headline={formatINR(Number(data.paid))}
            text="Already Paid to Members — settled via a recorded bank transfer."
            href="/account/accounts/member-settlements"
          />

          <section aria-labelledby="members-ready-title">
            <h2 id="members-ready-title" className="section-title">Members ready for payout</h2>
            <MembersReadyForPayout token={token} />
          </section>

          {data.disputeAttention.openCount > 0 && (
            <sky-cta-banner
              color="tertiary"
              icon="warning"
              iconStyle="surface"
              headline={`${data.disputeAttention.openCount} open dispute${data.disputeAttention.openCount === 1 ? '' : 's'}`}
              text={`${formatINR(Number(data.disputeAttention.blockedAmount))} currently blocked — already counted inside On Hold above, not double-counted.`}
              ctaLabel="Review Issues"
              ctaHref="/account/accounts/refunds-disputes"
            />
          )}
        </>
      )}
    </div>
  );
}

export default AccountsOverviewPage;
