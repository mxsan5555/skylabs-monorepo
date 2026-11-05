import './member-portal.css';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FilledButton, Icon, OutlinedButton, OutlinedTextField, TextButton } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  verifyVoucher,
  startService,
  requestCompletionOtp,
  completeVoucher,
  shipVoucher,
  recordDeliveryEvidence,
  type VoucherVerifyResponse,
  type VoucherVerifyResult,
} from '../../../../api/rbac/vouchers';
import type { EntitlementStatus, FulfilmentKind } from '../../../../api/rbac/settlements';
import { ApiRequestError } from '../../../../api/rbac/client';
import { showSnackbar } from '../../../../snackbar/snackbar';
import { formatINR } from '../../../../utils/format';

const RESULT_COPY: Record<VoucherVerifyResult, { icon: string; title: string; tone: 'success' | 'error' }> = {
  VALID: { icon: 'check_circle', title: 'Valid — ready to fulfil', tone: 'success' },
  ALREADY_USED: { icon: 'history', title: 'Already redeemed', tone: 'error' },
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

const ENTITLEMENT_STATUS_LABEL: Record<EntitlementStatus, string> = {
  ACTIVE: 'Active',
  STARTED: 'Started',
  OTP_REQUESTED: 'OTP Requested',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

const WIZARD_STEPS = [
  { step: 1, label: 'Voucher Check' },
  { step: 2, label: 'Service' },
  { step: 3, label: 'Customer OTP' },
  { step: 4, label: 'Complete' },
] as const;

/** Current step is derived purely from the server's own `entitlementStatus` — never from any
 *  local "what step am I on" state, so a page refresh (or someone else acting on the same
 *  voucher) always resumes at the right place. `PRODUCT_SHIPPED`'s evidence-recording flow
 *  reuses the "Service" step slot (step 2) rather than inventing a 5th step — it structurally
 *  never goes through the OTP step either way (see `requestCompletionOtp`'s own hard reject). */
function currentStepFor(entitlementStatus: EntitlementStatus): number {
  switch (entitlementStatus) {
    case 'ACTIVE':
      return 1;
    case 'STARTED':
      return 2;
    case 'OTP_REQUESTED':
      return 3;
    case 'COMPLETED':
      return 4;
    default:
      return 1;
  }
}

/**
 * Resumable, step-based voucher verification/fulfilment detail page
 * (`/account/vendor-orders/verify/:code`, `vendor-portal.orders:custom`) — reached from the
 * Service Queue, the "Open Voucher" lookup, and Order Details' per-entitlement links.
 *
 * Renders purely from the response of `verifyVoucher` — the one side-effect-free voucher read —
 * fetched on mount AND re-fetched after every mutating action and every "Refresh Status" click.
 * There is deliberately no other state source for "what step is this voucher on": every mutating
 * action (`startService`/`requestCompletionOtp`/`completeVoucher`/`shipVoucher`/
 * `recordDeliveryEvidence`) re-fetches fresh via `verifyVoucher` afterwards rather than locally
 * merging its own response, so "resume after a refresh" and "just acted" render through the exact
 * same code path and can never drift apart.
 *
 */
export function VoucherVerificationPage() {
  const { code = '' } = useParams<{ code: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();

  const [verify, setVerify] = useState<VoucherVerifyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [otp, setOtp] = useState('');
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const load = useCallback(
    async (opts: { background?: boolean } = {}) => {
      if (opts.background) setRefreshing(true);
      else setLoading(true);
      setLoadError('');
      try {
        const { data } = await verifyVoucher(token, code);
        setVerify(data);
      } catch (err) {
        if (!opts.background) setVerify(null);
        setLoadError(err instanceof ApiRequestError ? err.message : 'Could not load this voucher.');
      } finally {
        if (opts.background) setRefreshing(false);
        else setLoading(false);
      }
    },
    [token, code],
  );

  useEffect(() => {
    load();
  }, [load]);

  const runAction = async (fn: () => Promise<void>, successMessage: string) => {
    setActionBusy(true);
    setActionError('');
    try {
      await fn();
      showSnackbar(successMessage, { variant: 'success' });
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : 'Could not complete this action.');
    } finally {
      await load({ background: true });
      setActionBusy(false);
    }
  };

  const doStart = () => runAction(async () => { await startService(token, code); }, 'Service started.');
  const doRequestOtp = () =>
    runAction(async () => { await requestCompletionOtp(token, code); }, 'Completion OTP sent to the customer.');
  const doComplete = () =>
    runAction(async () => {
      await completeVoucher(token, code, otp.trim());
      setOtp('');
    }, 'Marked complete.');
  const doShip = () =>
    runAction(async () => {
      await shipVoucher(token, code, { carrier: carrier.trim(), trackingNumber: trackingNumber.trim() });
      setCarrier('');
      setTrackingNumber('');
    }, 'Marked shipped.');
  const doRecordEvidence = () =>
    evidenceFile &&
    runAction(async () => {
      await recordDeliveryEvidence(token, code, evidenceFile, evidenceFile.name, evidenceNote.trim() || undefined);
      setEvidenceFile(null);
      setEvidenceNote('');
    }, 'Delivery evidence recorded.');

  const entitlement = verify?.entitlement;
  const otpChallenge = entitlement?.otpChallenge;
  // Server-computed cooldown, never a separate client-side timer that could drift from it.
  const resendAvailable = otpChallenge ? Date.now() >= new Date(otpChallenge.resendAvailableAt).getTime() : true;

  // `verifyVoucher` returns `result: 'ALREADY_USED'` for a COMPLETED entitlement — never `'VALID'`
  // (see msd-api's `voucher.service.ts#verifyVoucher`: `entitlementStatus === 'COMPLETED'` is
  // checked, and mapped to `ALREADY_USED`, before the final `VALID` fallthrough). That's a
  // perfectly normal "already finished, nothing to do" state from the member's point of view —
  // not one of the genuinely problematic results (expired/cancelled/wrong-business/needs-review)
  // — so it gets the full summary + step indicator + the spec's "final read-only summary" render,
  // same as a live `VALID` voucher, rather than the generic error-toned `RESULT_COPY` card.
  const showSummary = verify?.result === 'VALID' || verify?.result === 'ALREADY_USED';

  return (
    <div className="admin-page admin-page--wide member-portal">
      <title>{`Voucher ${code} · MSD`}</title>
      <meta name="robots" content="noindex" />

      <header className="page-head">
        <div>
          <h1>Voucher {code}</h1>
          {entitlement && (
            <p className="field-hint">
              {entitlement.orderNumber} ? {entitlement.itemName}
              {entitlement.customerName ? ` · ${entitlement.customerName}` : ''}
            </p>
          )}
        </div>
        <div className="page-head__actions">
          <OutlinedButton onClick={() => load({ background: true })} disabled={refreshing || loading}>
            <Icon slot="icon" aria-hidden="true">refresh</Icon>
            {refreshing ? 'Refreshing…' : 'Refresh Status'}
          </OutlinedButton>
          <OutlinedButton onClick={() => navigate('/account/vendor-orders?tab=verify')}>
            <Icon slot="icon" aria-hidden="true">arrow_back</Icon>
            Back to Verification
          </OutlinedButton>
        </div>
      </header>

      {loading ? (
        <p className="loading-state">Loading voucher…</p>
      ) : loadError || !verify ? (
        <p className="error-state" role="alert">{loadError || 'Voucher not found.'}</p>
      ) : (
        <>
          {showSummary && (
            <nav aria-label="Verification steps">
              <ul className="wizard-steps">
                {WIZARD_STEPS.map(({ step, label }) => {
                  const current = currentStepFor(verify.entitlement.entitlementStatus);
                  const done = step < current || (step === 4 && verify.entitlement.entitlementStatus === 'COMPLETED');
                  return (
                    <li key={step}>
                      <span
                        className={`wizard-steps__item${done ? ' wizard-steps__item--done' : ''}`}
                        aria-current={step === current ? 'step' : undefined}
                      >
                        <span className="wizard-steps__num" aria-hidden="true">
                          {done ? <Icon aria-hidden="true">check</Icon> : step}
                        </span>
                        {label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}

          {!showSummary && (
            <sky-feature-card
              color={RESULT_COPY[verify.result].tone === 'success' ? 'primary' : 'surface-high'}
              variant="outlined"
              icon={RESULT_COPY[verify.result].icon}
              icon-style="surface"
              headline={RESULT_COPY[verify.result].title}
              text={`${verify.entitlement.itemName} · ${verify.entitlement.customerName ?? 'Customer'} · ${FULFILMENT_LABEL[verify.entitlement.fulfilmentKind]}`}
            />
          )}

          {showSummary && (
            <>
              <div className="member-summary-grid">
                <sky-card variant="outlined">
                  <h2 className="section-title" id="voucher-summary-title">Customer &amp; Service</h2>
                  <dl className="member-facts">
                    <div><dt>Customer</dt><dd>{verify.entitlement.customerName ?? '?'}</dd></div>
                    <div><dt>Phone</dt><dd>{verify.entitlement.customerPhoneMasked ?? '?'}</dd></div>
                    <div><dt>Email</dt><dd>{verify.entitlement.customerEmailMasked ?? '?'}</dd></div>
                    <div><dt>Branch</dt><dd>{verify.entitlement.branchName ?? '?'}</dd></div>
                    <div><dt>Service</dt><dd>{verify.entitlement.itemName}</dd></div>
                    <div><dt>Fulfilment</dt><dd>{FULFILMENT_LABEL[verify.entitlement.fulfilmentKind]}</dd></div>
                  </dl>
                </sky-card>
                <sky-card variant="outlined">
                  <h2 className="section-title">Payment &amp; My Share</h2>
                  <dl className="member-facts">
                    <div><dt>Customer Paid</dt><dd>{formatINR(Number(verify.entitlement.grossAmount))}</dd></div>
                    <div><dt>My Share</dt><dd><strong>{formatINR(Number(verify.entitlement.memberShareAmount))}</strong></dd></div>
                    <div><dt>Service Status</dt><dd>{ENTITLEMENT_STATUS_LABEL[verify.entitlement.entitlementStatus]}</dd></div>
                    <div><dt>Payout Status</dt><dd>{verify.entitlement.settlementStatus?.replace(/_/g, ' ')}</dd></div>
                  </dl>
                </sky-card>
              </div>

              {actionError && <p className="error-state" role="alert">{actionError}</p>}

              <section className="panel member-next-action" aria-labelledby="voucher-action-title">
                <h2 id="voucher-action-title" className="section-title">Next step</h2>

                {verify.entitlement.entitlementStatus === 'ACTIVE' && verify.entitlement.fulfilmentKind === 'SERVICE_SESSION' && (
                  <FilledButton onClick={doStart} disabled={actionBusy}>Start Service</FilledButton>
                )}

                {verify.entitlement.entitlementStatus === 'ACTIVE' && verify.entitlement.fulfilmentKind === 'PRODUCT_PICKUP' && (
                  <>
                    <FilledButton onClick={doRequestOtp} disabled={actionBusy}>Send Completion OTP</FilledButton>
                    <div className="panel" aria-label="Ship this item instead">
                      <h3 className="section-title">Ship this item instead</h3>
                      <div className="member-action-row">
                        <OutlinedTextField label="Carrier" value={carrier} onInput={(e: Event) => setCarrier((e.target as HTMLInputElement).value)} />
                        <OutlinedTextField label="Tracking number" value={trackingNumber} onInput={(e: Event) => setTrackingNumber((e.target as HTMLInputElement).value)} />
                        <FilledButton onClick={doShip} disabled={actionBusy || !carrier.trim() || !trackingNumber.trim()}>Ship</FilledButton>
                      </div>
                    </div>
                  </>
                )}

                {verify.entitlement.entitlementStatus === 'STARTED' && verify.entitlement.fulfilmentKind === 'SERVICE_SESSION' && (
                  <>
                    <p className="field-hint">Request this after you&apos;ve provided the service.</p>
                    <FilledButton onClick={doRequestOtp} disabled={actionBusy}>Send Completion OTP</FilledButton>
                  </>
                )}

                {verify.entitlement.entitlementStatus === 'STARTED' && verify.entitlement.fulfilmentKind === 'PRODUCT_SHIPPED' && (
                  <div className="panel" aria-label="Record delivery evidence">
                    <h3 className="section-title">Record Pickup/Delivery Evidence</h3>
                    <div className="member-action-row">
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

                {verify.entitlement.entitlementStatus === 'OTP_REQUESTED' && (
                  <div className="panel" aria-label="Enter completion OTP">
                    <h3 className="section-title">Enter the OTP the customer shares with you</h3>
                    <p className="field-hint">
                      Sent to {verify.entitlement.customerPhoneMasked ?? verify.entitlement.customerEmailMasked ?? 'the customer'}
                    </p>
                    {otpChallenge && (
                      <p className="field-hint">
                        Expires at {new Date(otpChallenge.expiresAt).toLocaleString()} · {otpChallenge.attempts}/{otpChallenge.maxAttempts} attempts used
                      </p>
                    )}
                    <div className="member-action-row">
                      <OutlinedTextField label="6-digit OTP" value={otp} onInput={(e: Event) => setOtp((e.target as HTMLInputElement).value)} />
                      <FilledButton onClick={doComplete} disabled={actionBusy || otp.trim().length !== 6}>Confirm &amp; Complete</FilledButton>
                      <TextButton onClick={doRequestOtp} disabled={actionBusy || !resendAvailable}>Resend OTP</TextButton>
                    </div>
                  </div>
                )}

                {verify.entitlement.entitlementStatus === 'COMPLETED' && (
                  <sky-info-card
                    icon="check_circle"
                    heading="Completed"
                    subheading={`Customer confirmation recorded. Payout status: ${verify.entitlement.settlementStatus?.replace(/_/g, ' ')}.`}
                  />
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default VoucherVerificationPage;
