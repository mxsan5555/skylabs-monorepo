import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import { useSearchParams } from 'react-router-dom';
import {
  Dialog,
  FilledButton,
  OutlinedSelect,
  OutlinedTextField,
  SelectOption,
  TextButton,
} from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  listDisputes,
  getDispute,
  resolveDispute,
  type DisputeDetail,
  type DisputeListRow,
  type DisputeResolutionType,
  type DisputeStatus,
} from '../../../../api/rbac/disputes';
import { createRefund, listRefundsForOrderItem, type Refund } from '../../../../api/rbac/refunds';
import { listVendors, type Vendor } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useToast } from '../../../../toast/toast-context';

const STATUS_LABEL: Record<DisputeStatus, string> = { OPEN: 'Open', UNDER_REVIEW: 'Under review', RESOLVED: 'Resolved' };

interface TableParams {
  page: number;
  pageSize: number;
  status: DisputeStatus | '';
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 10, status: '' };

/**
 * Super-Admin "Refunds & Disputes" — the admin review surface for customer-raised disputes
 * (`accounts.refunds-disputes:{view,status_change,approve,reject}`) plus the standalone admin
 * refund action (`accounts.refunds-disputes:approve`). A plain paginated table (not
 * `sky-data-table`, since the row actions here open a multi-step resolve→refund flow rather than
 * a single status change) with a Resolve dialog and an independent Create Refund dialog.
 */
export function RefundsDisputesPage() {
  const { token, can } = useAuth();
  const { showToast } = useToast();
  const canApprove = can('accounts.refunds-disputes', 'approve');
  const canReject = can('accounts.refunds-disputes', 'reject');
  const canStatusChange = can('accounts.refunds-disputes', 'status_change');

  const [searchParams, setSearchParams] = useSearchParams();
  const params = useMemo<TableParams>(
    () => ({
      page: Number(searchParams.get('page')) || DEFAULT_PARAMS.page,
      pageSize: Number(searchParams.get('pageSize')) || DEFAULT_PARAMS.pageSize,
      status: (searchParams.get('status') as DisputeStatus | null) ?? DEFAULT_PARAMS.status,
    }),
    [searchParams],
  );
  const setStatusFilter = (status: DisputeStatus | '') => {
    setSearchParams((prev) => {
      const usp = new URLSearchParams(prev);
      if (status) usp.set('status', status);
      else usp.delete('status');
      usp.set('page', '1');
      return usp;
    });
  };

  const [rows, setRows] = useState<DisputeListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [vendors, setVendors] = useState<Vendor[]>([]);

  useEffect(() => {
    listVendors(token, { pageSize: 200 }).then(({ data }) => setVendors(data)).catch(() => setVendors([]));
  }, [token]);
  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.businessName ?? id;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listDisputes(token, { page: params.page, pageSize: params.pageSize, status: params.status || undefined });
      setRows(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load disputes.');
    } finally {
      setLoading(false);
    }
  }, [token, params]);

  useEffect(() => {
    load();
  }, [load]);

  // ─── Resolve dialog ──────────────────────────────────────────────────────────
  const resolveDialogRef = useRef<MdDialog>(null);
  const [resolveTarget, setResolveTarget] = useState<DisputeDetail | null>(null);
  const [resolveType, setResolveType] = useState<DisputeResolutionType | ''>('');
  const [resolveNotes, setResolveNotes] = useState('');
  const [resolveError, setResolveError] = useState('');
  const [resolveSaving, setResolveSaving] = useState(false);

  const openResolve = async (id: string) => {
    setResolveError('');
    try {
      const { data } = await getDispute(token, id);
      setResolveTarget(data);
      setResolveType('');
      setResolveNotes('');
      resolveDialogRef.current?.show();
    } catch (err) {
      showToast(err instanceof ApiRequestError ? err.message : 'Could not load this dispute.', 'error');
    }
  };

  const submitResolve = async () => {
    if (!resolveTarget || !resolveType) return;
    setResolveSaving(true);
    setResolveError('');
    try {
      await resolveDispute(token, resolveTarget.id, { resolutionType: resolveType, resolutionNotes: resolveNotes.trim() || undefined });
      resolveDialogRef.current?.close();
      showToast('Dispute resolved.');
      if (resolveType === 'REFUNDED') {
        openRefund({ orderItemId: resolveTarget.orderItemId, entitlementId: resolveTarget.entitlementId ?? undefined, disputeId: resolveTarget.id });
      }
      await load();
    } catch (err) {
      setResolveError(err instanceof ApiRequestError ? err.message : 'Could not resolve this dispute.');
    } finally {
      setResolveSaving(false);
    }
  };

  // ─── Create Refund dialog (standalone, or chained off a REFUNDED resolve) ───
  const refundDialogRef = useRef<MdDialog>(null);
  const [refundCtx, setRefundCtx] = useState<{ orderItemId: string; entitlementId?: string; disputeId?: string } | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundType, setRefundType] = useState<'FULL' | 'PARTIAL'>('FULL');
  const [refundReason, setRefundReason] = useState('');
  const [refundError, setRefundError] = useState('');
  const [refundSaving, setRefundSaving] = useState(false);

  const openRefund = (ctx: { orderItemId: string; entitlementId?: string; disputeId?: string }) => {
    setRefundCtx(ctx);
    setRefundAmount('');
    setRefundType('FULL');
    setRefundReason('');
    setRefundError('');
    refundDialogRef.current?.show();
  };

  const submitRefund = async () => {
    if (!refundCtx) return;
    const amount = Number(refundAmount);
    if (!amount || amount <= 0) {
      setRefundError('Enter a refund amount greater than zero.');
      return;
    }
    setRefundSaving(true);
    setRefundError('');
    try {
      await createRefund(token, {
        orderItemId: refundCtx.orderItemId,
        entitlementId: refundCtx.entitlementId,
        disputeId: refundCtx.disputeId,
        amount,
        type: refundType,
        reason: refundReason.trim() || undefined,
      });
      refundDialogRef.current?.close();
      showToast('Refund recorded.');
    } catch (err) {
      setRefundError(err instanceof ApiRequestError ? err.message : 'Could not record this refund.');
    } finally {
      setRefundSaving(false);
    }
  };

  // ─── View refunds for an order item ──────────────────────────────────────────
  const viewRefundsDialogRef = useRef<MdDialog>(null);
  const [viewedRefunds, setViewedRefunds] = useState<Refund[]>([]);

  const openViewRefunds = async (orderItemId: string) => {
    try {
      const { data } = await listRefundsForOrderItem(token, orderItemId);
      setViewedRefunds(data);
      viewRefundsDialogRef.current?.show();
    } catch (err) {
      showToast(err instanceof ApiRequestError ? err.message : 'Could not load refunds for this item.', 'error');
    }
  };

  return (
    <div className="admin-page admin-page--wide">
      <title>Refunds &amp; Disputes · MSD</title>
      <header className="page-head">
        <div>
          <h1>Refunds &amp; Disputes</h1>
          <p>Customer-raised disputes, scoped to one voucher each — review, resolve, and refund.</p>
        </div>
      </header>

      <div className="form-grid" style={{ maxWidth: 320, marginBottom: 16 }}>
        <OutlinedSelect label="Status" value={params.status} onChange={(e: Event) => setStatusFilter((e.target as HTMLSelectElement).value as DisputeStatus | '')}>
          <SelectOption value=""><div slot="headline">All statuses</div></SelectOption>
          {(['OPEN', 'UNDER_REVIEW', 'RESOLVED'] as DisputeStatus[]).map((s) => (
            <SelectOption key={s} value={s}><div slot="headline">{STATUS_LABEL[s]}</div></SelectOption>
          ))}
        </OutlinedSelect>
      </div>

      {error && <p className="error-state" role="alert">{error}</p>}

      {loading ? (
        <p className="loading-state">Loading disputes…</p>
      ) : rows.length === 0 ? (
        <p className="empty-state">No disputes match this filter.</p>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Voucher</th>
                <th scope="col">Member</th>
                <th scope="col">Customer</th>
                <th scope="col">Reason</th>
                <th scope="col">Amount</th>
                <th scope="col">Status</th>
                <th scope="col">Raised</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.entitlement?.voucherCode ?? '—'}</td>
                  <td>{row.entitlement ? vendorName(row.entitlement.vendorId) : '—'}</td>
                  <td>{row.customer.name ?? '—'}</td>
                  <td>{row.reason}</td>
                  <td>{row.entitlement ? `₹${row.entitlement.grossAmount}` : '—'}</td>
                  <td>{STATUS_LABEL[row.status]}</td>
                  <td>{new Date(row.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div className="row-actions">
                      {row.status !== 'RESOLVED' && (canStatusChange || canApprove || canReject) && (
                        <TextButton onClick={() => openResolve(row.id)}>Resolve</TextButton>
                      )}
                      {canApprove && (
                        <TextButton onClick={() => openRefund({ orderItemId: row.orderItemId, entitlementId: row.entitlementId ?? undefined, disputeId: row.id })}>
                          Refund
                        </TextButton>
                      )}
                      <TextButton onClick={() => openViewRefunds(row.orderItemId)}>Refunds</TextButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="field-hint">
        Page {params.page} of {Math.max(1, Math.ceil(total / params.pageSize))} · {total} total
        {' '}
        <TextButton disabled={params.page <= 1} onClick={() => setSearchParams((p) => { const u = new URLSearchParams(p); u.set('page', String(params.page - 1)); return u; })}>Previous</TextButton>
        <TextButton disabled={params.page * params.pageSize >= total} onClick={() => setSearchParams((p) => { const u = new URLSearchParams(p); u.set('page', String(params.page + 1)); return u; })}>Next</TextButton>
      </p>

      <Dialog ref={resolveDialogRef} onClose={() => setResolveTarget(null)}>
        <div slot="headline">Resolve dispute</div>
        <div slot="content" className="form-grid">
          {resolveTarget && (
            <>
              <p className="field-hint">Voucher {resolveTarget.entitlement?.voucherCode ?? '—'} · {resolveTarget.reason}</p>
              {resolveTarget.description && <p className="field-hint">{resolveTarget.description}</p>}
              <OutlinedSelect label="Resolution" value={resolveType} onChange={(e: Event) => setResolveType((e.target as HTMLSelectElement).value as DisputeResolutionType)}>
                <SelectOption value=""><div slot="headline">Select…</div></SelectOption>
                {canApprove && <SelectOption value="REFUNDED"><div slot="headline">Refunded — claim upheld</div></SelectOption>}
                {canReject && <SelectOption value="NO_ACTION"><div slot="headline">No action — claim not upheld</div></SelectOption>}
                {canReject && <SelectOption value="OTHER"><div slot="headline">Other</div></SelectOption>}
              </OutlinedSelect>
              <OutlinedTextField
                label="Resolution notes"
                type="textarea"
                rows={3}
                value={resolveNotes}
                onInput={(e: Event) => setResolveNotes((e.target as HTMLTextAreaElement).value)}
              />
              {resolveError && <p className="error-state" role="alert">{resolveError}</p>}
            </>
          )}
        </div>
        <div slot="actions">
          <TextButton onClick={() => resolveDialogRef.current?.close()}>Cancel</TextButton>
          <FilledButton onClick={submitResolve} disabled={!resolveType || resolveSaving}>
            {resolveSaving ? 'Resolving…' : 'Resolve'}
          </FilledButton>
        </div>
      </Dialog>

      <Dialog ref={refundDialogRef} onClose={() => setRefundCtx(null)}>
        <div slot="headline">Create refund</div>
        <div slot="content" className="form-grid">
          <OutlinedTextField
            label="Amount (₹)"
            type="number"
            min="0"
            step="0.01"
            value={refundAmount}
            onInput={(e: Event) => setRefundAmount((e.target as HTMLInputElement).value)}
          />
          <OutlinedSelect label="Type" value={refundType} onChange={(e: Event) => setRefundType((e.target as HTMLSelectElement).value as 'FULL' | 'PARTIAL')}>
            <SelectOption value="FULL"><div slot="headline">Full</div></SelectOption>
            <SelectOption value="PARTIAL"><div slot="headline">Partial</div></SelectOption>
          </OutlinedSelect>
          <OutlinedTextField
            label="Reason (optional)"
            value={refundReason}
            onInput={(e: Event) => setRefundReason((e.target as HTMLInputElement).value)}
          />
          {refundError && <p className="error-state" role="alert">{refundError}</p>}
        </div>
        <div slot="actions">
          <TextButton onClick={() => refundDialogRef.current?.close()}>Cancel</TextButton>
          <FilledButton onClick={submitRefund} disabled={refundSaving}>
            {refundSaving ? 'Recording…' : 'Record Refund'}
          </FilledButton>
        </div>
      </Dialog>

      <Dialog ref={viewRefundsDialogRef}>
        <div slot="headline">Refunds for this item</div>
        <div slot="content" className="form-grid">
          {viewedRefunds.length === 0 ? (
            <p className="empty-state">No refunds recorded for this item.</p>
          ) : (
            viewedRefunds.map((r) => (
              <p key={r.id} className="field-hint">
                ₹{r.amount} · {r.type} · {r.status} · {new Date(r.createdAt).toLocaleDateString()}
              </p>
            ))
          )}
        </div>
        <div slot="actions">
          <TextButton onClick={() => viewRefundsDialogRef.current?.close()}>Close</TextButton>
        </div>
      </Dialog>
    </div>
  );
}

export default RefundsDisputesPage;
