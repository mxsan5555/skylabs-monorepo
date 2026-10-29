import { useEffect, useState } from 'react';
import { FilledButton, Icon, OutlinedTextField, TextButton } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  verifyVoucher,
  startService,
  requestCompletionOtp,
  completeVoucher,
  shipVoucher,
  recordDeliveryEvidence,
  type VoucherVerifyResult,
} from '../../../../api/rbac/vouchers';
import type { EntitlementStatus, FulfilmentKind } from '../../../../api/rbac/settlements';
import { ApiRequestError } from '../../../../api/rbac/client';
import { showSnackbar } from '../../../../snackbar/snackbar';
import { OrderManagement } from '../orders/orders';

const RESULT_COPY: Record<VoucherVerifyResult, { icon: string; title: string; tone: 'success' | 'error' }> = {
  VALID: { icon: 'check_circle', title: 'Valid — ready to fulfil', tone: 'success' },
  ALREADY_USED: { icon: 'history', title: 'Already redeemed', tone: 'error' },
  // No per-voucher expiry concept exists in this data model yet — kept here only so the UI
  // handles the value defensively if the backend ever starts returning it (see the approved
  // plan's own "known gap" note).
  EXPIRED: { icon: 'event_busy', title: 'Expired', tone: 'error' },
  CANCELLED_REFUNDED: { icon: 'cancel', title: 'Cancelled or refunded', tone: 'error' },
  WRONG_MEMBER_BRANCH: { icon: 'block', title: 'Not for this business', tone: 'error' },
  ADMIN_REVIEW_REQUIRED: { icon: 'report', title: 'Needs admin review', tone: 'error' },
};

const FULFILMENT_LABEL: Record<FulfilmentKind, string> = {
  SERVICE_SESSION: 'Service session',
  PRODUCT_PICKUP: 'Product — pickup',
  PRODUCT_SHIPPED: 'Product — shipped',
};

interface VerifiedVoucher {
  code: string;
  result: VoucherVerifyResult;
  itemName: string;
  customerName: string | null;
  fulfilmentKind: FulfilmentKind;
  entitlementStatus: EntitlementStatus;
  carrier?: string | null;
  trackingNumber?: string | null;
}

interface HistoryEntry {
  code: string;
  itemName: string;
  event: string;
  at: string;
}

const HISTORY_KEY = 'msd:voucher-redemption-history';
const HISTORY_LIMIT = 50;

/** No "my redemption history" list endpoint exists in the implemented backend (only point
 *  lookup-by-code via `POST /vouchers/verify`) — this is a browser-local stand-in, not a synced
 *  server record, clearly scoped to this device/browser only. Flagged as a known gap in the
 *  final report. */
function loadHistory(): HistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function pushHistory(entry: HistoryEntry) {
  const next = [entry, ...loadHistory()].slice(0, HISTORY_LIMIT);
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private mode, quota) — history is best-effort only.
  }
}

/**
 * Member "Orders & Verify" (`/account/vendor-orders`, `vendor-portal.orders`) — the existing
 * `OrderManagement` order list, now with a "Verify Purchase" panel above it (voucher text-entry
 * → result card → Start Service / Request OTP / Enter OTP & Complete / Ship / Record Evidence,
 * per the entitlement's current state) plus a client-side recent-redemptions list. Additive on
 * the same route — no new menu node (see `vouchers.routes.ts`'s own doc comment: the whole
 * voucher router is gated `vendor-portal.orders:custom`, the same key this page's route already
 * requires).
 */
export function OrdersAndVerify() {
  const { token } = useAuth();

  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [voucher, setVoucher] = useState<VerifiedVoucher | null>(null);

  const [otp, setOtp] = useState('');
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const recordHistory = (entry: Omit<HistoryEntry, 'at'>) => {
    const full = { ...entry, at: new Date().toISOString() };
    pushHistory(full);
    setHistory(loadHistory());
  };

  const doVerify = async () => {
    if (!code.trim()) return;
    setVerifying(true);
    setVerifyError('');
    setActionError('');
    try {
      const { data } = await verifyVoucher(token, code.trim());
      setVoucher({
        code: data.entitlement.voucherCode,
        result: data.result,
        itemName: data.entitlement.itemName,
        customerName: data.entitlement.customerName,
        fulfilmentKind: data.entitlement.fulfilmentKind,
        entitlementStatus: data.entitlement.entitlementStatus,
      });
      recordHistory({ code: data.entitlement.voucherCode, itemName: data.entitlement.itemName, event: `Verified — ${data.result}` });
    } catch (err) {
      setVoucher(null);
      setVerifyError(err instanceof ApiRequestError ? err.message : 'Could not verify this voucher.');
    } finally {
      setVerifying(false);
    }
  };

  const mergeVoucher = (next: { entitlementStatus: EntitlementStatus; fulfilmentKind: FulfilmentKind; carrier?: string | null; trackingNumber?: string | null }) => {
    setVoucher((prev) => (prev ? { ...prev, ...next } : prev));
  };

  const runAction = async (label: string, fn: () => Promise<void>) => {
    setActionBusy(true);
    setActionError('');
    try {
      await fn();
      showSnackbar(label, { variant: 'success' });
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : `Could not ${label.toLowerCase()}.`);
    } finally {
      setActionBusy(false);
    }
  };

  const doStart = () =>
    voucher &&
    runAction('Service started.', async () => {
      const { data } = await startService(token, voucher.code);
      mergeVoucher(data);
      recordHistory({ code: voucher.code, itemName: voucher.itemName, event: 'Service started' });
    });

  const doRequestOtp = () =>
    voucher &&
    runAction('Completion OTP sent to the customer.', async () => {
      await requestCompletionOtp(token, voucher.code);
      mergeVoucher({ entitlementStatus: 'OTP_REQUESTED', fulfilmentKind: voucher.fulfilmentKind });
      recordHistory({ code: voucher.code, itemName: voucher.itemName, event: 'Completion OTP requested' });
    });

  const doComplete = () =>
    voucher &&
    runAction('Marked complete.', async () => {
      const { data } = await completeVoucher(token, voucher.code, otp.trim());
      mergeVoucher(data);
      setOtp('');
      recordHistory({ code: voucher.code, itemName: voucher.itemName, event: 'Completed' });
    });

  const doShip = () =>
    voucher &&
    runAction('Marked shipped.', async () => {
      const { data } = await shipVoucher(token, voucher.code, { carrier: carrier.trim(), trackingNumber: trackingNumber.trim() });
      mergeVoucher(data);
      setCarrier('');
      setTrackingNumber('');
      recordHistory({ code: voucher.code, itemName: voucher.itemName, event: `Shipped via ${carrier}` });
    });

  const doRecordEvidence = () =>
    voucher &&
    evidenceFile &&
    runAction('Delivery evidence recorded.', async () => {
      const { data } = await recordDeliveryEvidence(token, voucher.code, evidenceFile, evidenceFile.name, evidenceNote.trim() || undefined);
      mergeVoucher(data);
      setEvidenceFile(null);
      setEvidenceNote('');
      recordHistory({ code: voucher.code, itemName: voucher.itemName, event: 'Delivery evidence recorded' });
    });

  const copy = voucher ? RESULT_COPY[voucher.result] : null;

  return (
    <div className="admin-page admin-page--wide">
      <title>Orders &amp; Verify · MSD</title>
      <header className="page-head">
        <div>
          <h1>Orders &amp; Verify</h1>
          <p>Your order history, plus voucher verification and fulfilment.</p>
        </div>
      </header>

      <section aria-labelledby="verify-purchase-title" className="panel">
        <h2 id="verify-purchase-title">Verify Purchase</h2>
        <div className="form-grid">
          <OutlinedTextField
            label="Voucher code"
            value={code}
            onInput={(e: Event) => setCode((e.target as HTMLInputElement).value)}
          />
          <FilledButton onClick={doVerify} disabled={verifying || !code.trim()}>
            {verifying ? 'Verifying…' : 'Verify'}
          </FilledButton>
        </div>

        {verifyError && <p className="error-state" role="alert">{verifyError}</p>}

        {voucher && copy && (
          <sky-feature-card
            color={copy.tone === 'success' ? 'primary' : 'surface-high'}
            variant="outlined"
            icon={copy.icon}
            icon-style="surface"
            headline={copy.title}
            text={`${voucher.itemName} · ${voucher.customerName ?? 'Customer'} · ${FULFILMENT_LABEL[voucher.fulfilmentKind]}`}
          >
            <div slot="actions" className="row-actions">
              {voucher.result === 'VALID' && voucher.fulfilmentKind === 'SERVICE_SESSION' && voucher.entitlementStatus === 'ACTIVE' && (
                <FilledButton onClick={doStart} disabled={actionBusy}>Start Service</FilledButton>
              )}
              {voucher.result === 'VALID' && voucher.fulfilmentKind === 'SERVICE_SESSION' && voucher.entitlementStatus === 'STARTED' && (
                <FilledButton onClick={doRequestOtp} disabled={actionBusy}>Request Completion OTP</FilledButton>
              )}
              {voucher.result === 'VALID' && voucher.fulfilmentKind === 'PRODUCT_PICKUP' && voucher.entitlementStatus === 'ACTIVE' && (
                <FilledButton onClick={doRequestOtp} disabled={actionBusy}>Request Completion OTP (Pickup)</FilledButton>
              )}
            </div>
          </sky-feature-card>
        )}

        {actionError && <p className="error-state" role="alert">{actionError}</p>}

        {voucher?.result === 'VALID' && voucher.fulfilmentKind === 'PRODUCT_PICKUP' && voucher.entitlementStatus === 'ACTIVE' && (
          <div className="panel" aria-label="Ship this item instead">
            <h3 className="section-title">Ship this item instead</h3>
            <div className="form-grid">
              <OutlinedTextField label="Carrier" value={carrier} onInput={(e: Event) => setCarrier((e.target as HTMLInputElement).value)} />
              <OutlinedTextField label="Tracking number" value={trackingNumber} onInput={(e: Event) => setTrackingNumber((e.target as HTMLInputElement).value)} />
              <FilledButton onClick={doShip} disabled={actionBusy || !carrier.trim() || !trackingNumber.trim()}>Ship</FilledButton>
            </div>
          </div>
        )}

        {voucher?.result === 'VALID' && voucher.entitlementStatus === 'OTP_REQUESTED' && (
          <div className="panel" aria-label="Enter completion OTP">
            <h3 className="section-title">Enter the OTP the customer shares with you</h3>
            <div className="form-grid">
              <OutlinedTextField label="6-digit OTP" value={otp} onInput={(e: Event) => setOtp((e.target as HTMLInputElement).value)} />
              <FilledButton onClick={doComplete} disabled={actionBusy || otp.trim().length !== 6}>Complete</FilledButton>
              <TextButton onClick={doRequestOtp} disabled={actionBusy}>Resend OTP</TextButton>
            </div>
          </div>
        )}

        {voucher?.result === 'VALID' && voucher.fulfilmentKind === 'PRODUCT_SHIPPED' && voucher.entitlementStatus === 'STARTED' && (
          <div className="panel" aria-label="Record delivery evidence">
            <h3 className="section-title">Record Pickup/Delivery Evidence</h3>
            <p className="field-hint">Shipped via {voucher.carrier} · {voucher.trackingNumber}</p>
            <div className="form-grid">
              <label className="field-hint" htmlFor="evidence-file">Evidence photo</label>
              <input
                id="evidence-file"
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)}
              />
              <OutlinedTextField label="Note (optional)" value={evidenceNote} onInput={(e: Event) => setEvidenceNote((e.target as HTMLInputElement).value)} />
              <FilledButton onClick={doRecordEvidence} disabled={actionBusy || !evidenceFile}>Record Evidence</FilledButton>
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="redemption-history-title" className="panel">
        <h2 id="redemption-history-title">Recent redemptions (this device)</h2>
        {history.length === 0 ? (
          <p className="empty-state">Nothing verified yet on this device.</p>
        ) : (
          <ul className="field-hint" style={{ listStyle: 'none', padding: 0 }}>
            {history.map((h, i) => (
              <li key={`${h.code}-${h.at}-${i}`}>
                <Icon aria-hidden="true">receipt_long</Icon> {h.code} · {h.itemName} · {h.event} · {new Date(h.at).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="orders-title">
        <h2 id="orders-title" className="section-title">Orders</h2>
        <OrderManagement />
      </section>
    </div>
  );
}

export default OrdersAndVerify;
