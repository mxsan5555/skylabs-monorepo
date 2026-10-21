import { useCallback, useEffect, useRef, useState } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import { Link, useParams } from 'react-router-dom';
import {
  Checkbox,
  Dialog,
  Divider,
  FilledButton,
  Icon,
  List,
  ListItem,
  OutlinedButton,
  OutlinedTextField,
  TextButton,
} from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  getMemberSettlementDetail,
  recordMemberPayout,
  setVendorCommissionRate,
  type MemberSettlementDetail,
  type PurchaseEntitlement,
} from '../../../../api/rbac/settlements';
import { getVendor, type Vendor } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { showSnackbar } from '../../../../snackbar/snackbar';
import { useSetBreadcrumbs } from '../../../admin/breadcrumb-context';

const ENTITLEMENT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Not started',
  STARTED: 'Started',
  OTP_REQUESTED: 'OTP requested',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

const SETTLEMENT_STATUS_LABEL: Record<string, string> = {
  PENDING_FULFILMENT: 'Pending fulfilment',
  ON_HOLD: 'On hold',
  DISPUTED_BLOCKED: 'Disputed — blocked',
  PROCESSING: 'Processing',
  PAID: 'Paid',
  FAILED: 'Failed',
  VOID: 'Void',
};

function payable(e: PurchaseEntitlement): number {
  return e.adjustments.reduce((sum, a) => sum + Number(a.amount), Number(e.memberShareAmount));
}

/**
 * Super-Admin Member Settlement detail (`/account/accounts/member-settlements/:vendorId`) —
 * bank details, the order-wise statement, eligible-for-payout selection + "Record Bank Payment",
 * payout history, and the audit trail. Mirrors `vendor-detail-page.tsx`'s Overview-of-cards
 * shape. `POST /settlements/members/:vendorId/payouts` is double-gated server-side
 * (`accounts.member-settlements:approve` AND `requireSuperAdmin()`) — the "Record Bank Payment"
 * action is hidden unless BOTH hold here too, matching that explicit backend exception.
 */
export function MemberSettlementDetailPage() {
  const { vendorId = '' } = useParams<{ vendorId: string }>();
  const { token, can, bootstrap } = useAuth();

  const canEditCommission = can('accounts.member-settlements', 'status_change');
  const canApprove = can('accounts.member-settlements', 'approve');
  const isSuperAdmin = bootstrap?.roles.some((r) => r.isSuperAdmin) ?? false;
  const canRecordPayout = canApprove && isSuperAdmin;

  const [detail, setDetail] = useState<MemberSettlementDetail | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(
    async (silent = false) => {
      if (!vendorId) return;
      if (!silent) setLoading(true);
      try {
        const [{ data: d }, { data: v }] = await Promise.all([
          getMemberSettlementDetail(token, vendorId),
          getVendor(token, vendorId),
        ]);
        setDetail(d);
        setVendor(v);
        setLoadError('');
      } catch (err) {
        if (!silent) setLoadError(err instanceof ApiRequestError ? err.message : 'Could not load this member’s settlement.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [token, vendorId],
  );

  useEffect(() => {
    load();
  }, [load]);

  const name = vendor?.businessName ?? detail?.vendor.businessName ?? 'Member';
  useSetBreadcrumbs([
    { label: 'Accounts' },
    { label: 'Member Settlements', to: '/account/accounts/member-settlements' },
    { label: name },
  ]);

  // ─── Commission override ────────────────────────────────────────────────────
  const commissionDialogRef = useRef<MdDialog>(null);
  const [commissionValue, setCommissionValue] = useState('');
  const [commissionError, setCommissionError] = useState('');
  const [commissionSaving, setCommissionSaving] = useState(false);

  const openCommissionDialog = () => {
    setCommissionValue(vendor?.commissionRatePercent ?? '');
    setCommissionError('');
    commissionDialogRef.current?.show();
  };

  const submitCommission = async () => {
    setCommissionSaving(true);
    setCommissionError('');
    try {
      const trimmed = commissionValue.trim();
      const value = trimmed === '' ? null : Number(trimmed);
      if (value !== null && (Number.isNaN(value) || value < 0 || value > 100)) {
        setCommissionError('Enter a percentage between 0 and 100, or leave it blank to clear the override.');
        setCommissionSaving(false);
        return;
      }
      await setVendorCommissionRate(token, vendorId, value);
      commissionDialogRef.current?.close();
      showSnackbar('Commission rate updated.', { variant: 'success' });
      await load(true);
    } catch (err) {
      setCommissionError(err instanceof ApiRequestError ? err.message : 'Could not update the commission rate.');
    } finally {
      setCommissionSaving(false);
    }
  };

  // ─── Eligible items selection + Record Bank Payment ─────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const payoutDialogRef = useRef<MdDialog>(null);
  const [reference, setReference] = useState('');
  const [transferDate, setTransferDate] = useState('');
  const [proofStorageKey, setProofStorageKey] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [payoutError, setPayoutError] = useState('');
  const [payoutSaving, setPayoutSaving] = useState(false);

  const toggleSelected = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    setSelected(checked ? new Set((detail?.eligibleItems ?? []).map((e) => e.id)) : new Set());
  };

  const openPayoutDialog = () => {
    if (selected.size === 0) return;
    setReference('');
    setTransferDate('');
    setProofStorageKey('');
    setPayoutError('');
    setIdempotencyKey(crypto.randomUUID());
    payoutDialogRef.current?.show();
  };

  const submitPayout = async () => {
    setPayoutSaving(true);
    setPayoutError('');
    try {
      await recordMemberPayout(token, vendorId, {
        entitlementIds: [...selected],
        reference: reference.trim() || undefined,
        transferDate: transferDate ? new Date(transferDate).toISOString() : undefined,
        proofStorageKey: proofStorageKey.trim() || undefined,
        idempotencyKey,
      });
      payoutDialogRef.current?.close();
      showSnackbar('Payout recorded.', { variant: 'success' });
      setSelected(new Set());
      await load(true);
    } catch (err) {
      setPayoutError(err instanceof ApiRequestError ? err.message : 'Could not record this payout.');
    } finally {
      setPayoutSaving(false);
    }
  };

  const selectedTotal = [...selected].reduce((sum, id) => {
    const item = detail?.eligibleItems.find((e) => e.id === id);
    return item ? sum + payable(item) : sum;
  }, 0);

  if (loading) {
    return (
      <div className="admin-page admin-page--wide">
        <p className="loading-state">Loading member settlement…</p>
      </div>
    );
  }
  if (loadError || !detail) {
    return (
      <div className="admin-page admin-page--wide">
        <p className="error-state" role="alert">{loadError || 'Member settlement not found.'}</p>
        <Link to="/account/accounts/member-settlements">Back to Member Settlements</Link>
      </div>
    );
  }

  const bankComplete = Boolean(detail.vendor.bankAccountHolder && detail.vendor.bankAccountNumber && detail.vendor.bankIfsc);

  return (
    <div className="admin-page admin-page--wide">
      <title>{`${name} · Member Settlement · MSD`}</title>
      <header className="page-head">
        <div>
          <h1>{name}</h1>
          <p>Bank details, order-wise statement, payout history, and audit trail.</p>
        </div>
      </header>

      <section aria-labelledby="bank-details-title">
        <h2 id="bank-details-title" className="section-title">Bank details</h2>
        {!bankComplete && <p className="error-state" role="alert">Bank details are incomplete — a payout cannot be recorded until they are added.</p>}
        <sky-card aria-label="Bank details">
          <List>
            <ListItem>
              <Icon slot="start" aria-hidden="true">person</Icon>
              <div slot="headline">{detail.vendor.bankAccountHolder ?? 'Not added'}</div>
              <div slot="supporting-text">Account holder</div>
            </ListItem>
            <ListItem>
              <Icon slot="start" aria-hidden="true">account_balance</Icon>
              <div slot="headline">{detail.vendor.bankName ?? 'Not added'}</div>
              <div slot="supporting-text">Bank</div>
            </ListItem>
            <ListItem>
              <Icon slot="start" aria-hidden="true">pin</Icon>
              <div slot="headline">{detail.vendor.bankAccountNumber ?? 'Not added'}</div>
              <div slot="supporting-text">Account number</div>
            </ListItem>
            <ListItem>
              <Icon slot="start" aria-hidden="true">tag</Icon>
              <div slot="headline">{detail.vendor.bankIfsc ?? 'Not added'}</div>
              <div slot="supporting-text">IFSC</div>
            </ListItem>
            <ListItem>
              <Icon slot="start" aria-hidden="true">qr_code_2</Icon>
              <div slot="headline">{detail.vendor.upiId ?? 'Not added'}</div>
              <div slot="supporting-text">UPI ID</div>
            </ListItem>
          </List>
          {canEditCommission && (
            <>
              <Divider />
              <ListItem>
                <Icon slot="start" aria-hidden="true">percent</Icon>
                <div slot="headline">{vendor?.commissionRatePercent ? `${vendor.commissionRatePercent}% (override)` : 'Using default rate'}</div>
                <div slot="supporting-text">Commission rate</div>
                <OutlinedButton slot="end" onClick={openCommissionDialog}>Edit</OutlinedButton>
              </ListItem>
            </>
          )}
        </sky-card>
      </section>

      <section aria-labelledby="statement-title">
        <h2 id="statement-title" className="section-title">Order-wise statement ({detail.statement.length})</h2>
        {detail.statement.length === 0 ? (
          <p className="empty-state">No vouchers yet for this member.</p>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Voucher</th>
                  <th scope="col">Item</th>
                  <th scope="col">Fulfilment</th>
                  <th scope="col">Status</th>
                  <th scope="col">Gross</th>
                  <th scope="col">Commission</th>
                  <th scope="col">Member share</th>
                  <th scope="col">Settlement</th>
                </tr>
              </thead>
              <tbody>
                {detail.statement.map((row) => (
                  <tr key={row.id}>
                    <td>{row.voucherCode}</td>
                    <td>{row.orderItem?.itemName ?? '—'}</td>
                    <td>{ENTITLEMENT_STATUS_LABEL[row.entitlementStatus] ?? row.entitlementStatus}</td>
                    <td>{row.fulfilmentKind.replace(/_/g, ' ')}</td>
                    <td>₹{row.grossAmount}</td>
                    <td>₹{row.commissionAmount}</td>
                    <td>₹{payable(row).toFixed(2)}</td>
                    <td>{SETTLEMENT_STATUS_LABEL[row.settlementStatus] ?? row.settlementStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="eligible-title">
        <h2 id="eligible-title" className="section-title">Ready for payout ({detail.eligibleItems.length})</h2>
        {detail.eligibleItems.length === 0 ? (
          <p className="empty-state">Nothing is eligible for payout right now.</p>
        ) : (
          <>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">
                      <Checkbox
                        checked={selected.size === detail.eligibleItems.length}
                        onChange={(e: Event) => toggleSelectAll((e.target as HTMLInputElement).checked)}
                        aria-label="Select all eligible items"
                      />
                    </th>
                    <th scope="col">Voucher</th>
                    <th scope="col">Item</th>
                    <th scope="col">Hold until</th>
                    <th scope="col">Payable</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.eligibleItems.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <Checkbox
                          checked={selected.has(row.id)}
                          onChange={(e: Event) => toggleSelected(row.id, (e.target as HTMLInputElement).checked)}
                          aria-label={`Select voucher ${row.voucherCode}`}
                        />
                      </td>
                      <td>{row.voucherCode}</td>
                      <td>{row.orderItem?.itemName ?? '—'}</td>
                      <td>{row.holdUntil ? new Date(row.holdUntil).toLocaleString() : '—'}</td>
                      <td>₹{payable(row).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canRecordPayout ? (
              <p className="field-hint">
                {selected.size} selected · ₹{selectedTotal.toFixed(2)} total{' '}
                <FilledButton disabled={selected.size === 0 || !bankComplete} onClick={openPayoutDialog}>
                  Record Bank Payment
                </FilledButton>
              </p>
            ) : (
              <p className="field-hint">Recording a payout is restricted to a SuperAdmin.</p>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="payout-history-title">
        <h2 id="payout-history-title" className="section-title">Payout history ({detail.payoutHistory.length})</h2>
        {detail.payoutHistory.length === 0 ? (
          <p className="empty-state">No payouts recorded yet.</p>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Items</th>
                  <th scope="col">Reference</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {detail.payoutHistory.map((p) => (
                  <tr key={p.id}>
                    <td>{p.transferDate ? new Date(p.transferDate).toLocaleDateString() : new Date(p.createdAt).toLocaleDateString()}</td>
                    <td>₹{p.amount}</td>
                    <td>{p.items.length}</td>
                    <td>{p.reference ?? '—'}</td>
                    <td>{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="audit-title">
        <h2 id="audit-title" className="section-title">Audit trail ({detail.auditTrail.length})</h2>
        {detail.auditTrail.length === 0 ? (
          <p className="empty-state">No payout audit entries yet.</p>
        ) : (
          <List aria-label="Audit trail">
            {detail.auditTrail.map((entry) => (
              <ListItem key={entry.id}>
                <Icon slot="start" aria-hidden="true">history</Icon>
                <div slot="headline">{entry.action}</div>
                <div slot="supporting-text">{new Date(entry.createdAt).toLocaleString()}</div>
              </ListItem>
            ))}
          </List>
        )}
      </section>

      <Dialog ref={commissionDialogRef}>
        <div slot="headline">Commission rate override</div>
        <div slot="content" className="form-grid">
          <OutlinedTextField
            label="Commission % (leave blank to use the default rate)"
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={commissionValue}
            onInput={(e: Event) => setCommissionValue((e.target as HTMLInputElement).value)}
          />
          {commissionError && <p className="error-state" role="alert">{commissionError}</p>}
        </div>
        <div slot="actions">
          <TextButton onClick={() => commissionDialogRef.current?.close()}>Cancel</TextButton>
          <FilledButton onClick={submitCommission} disabled={commissionSaving}>
            {commissionSaving ? 'Saving…' : 'Save'}
          </FilledButton>
        </div>
      </Dialog>

      <Dialog ref={payoutDialogRef}>
        <div slot="headline">Record Bank Payment</div>
        <div slot="content" className="form-grid">
          <p className="field-hint">
            Recording {selected.size} item(s) · ₹{selectedTotal.toFixed(2)} total. This only RECORDS a bank
            transfer that has already happened outside this system — no live payout API is called.
          </p>
          <OutlinedTextField
            label="Reference / UTR"
            value={reference}
            onInput={(e: Event) => setReference((e.target as HTMLInputElement).value)}
          />
          <label className="field-hint" htmlFor="payout-transfer-date">Transfer date</label>
          <input
            id="payout-transfer-date"
            type="date"
            value={transferDate}
            onChange={(e) => setTransferDate(e.target.value)}
          />
          <OutlinedTextField
            label="Proof storage key (optional)"
            value={proofStorageKey}
            onInput={(e: Event) => setProofStorageKey((e.target as HTMLInputElement).value)}
          />
          {payoutError && <p className="error-state" role="alert">{payoutError}</p>}
        </div>
        <div slot="actions">
          <TextButton onClick={() => payoutDialogRef.current?.close()}>Cancel</TextButton>
          <FilledButton onClick={submitPayout} disabled={payoutSaving}>
            {payoutSaving ? 'Recording…' : 'Record Payment'}
          </FilledButton>
        </div>
      </Dialog>
    </div>
  );
}

export default MemberSettlementDetailPage;
