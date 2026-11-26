import './vendor-portal.css';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FilledButton, Icon, OutlinedButton } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { verifyVoucher, startService, finishService, type VoucherVerifyResponse } from '../../../../api/rbac/vouchers';
import { ApiRequestError } from '../../../../api/rbac/client';
import { showSnackbar } from '../../../../snackbar/snackbar';
import { formatINR, formatLongDate } from '../../../../utils/format';
import { scanResultCopy } from './voucher-scan-copy';

/**
 * Vendor Voucher Fulfilment page (`/account/vendor-orders/verify/:code`) — screens 3/4/5 of the
 * scan flow (Valid voucher → In service → Done). Reachable only from a scan (the Scan QR page
 * navigates here after a VALID check), but typing this URL directly works identically: the FULL
 * server-side check (`verifyVoucher`) runs again on every mount, exactly as if freshly scanned —
 * this page never trusts how it was reached. Every mutating action (`startService`/
 * `finishService`) re-fetches via `verifyVoucher` afterwards rather than locally merging its own
 * response, so "resume after a refresh" and "just acted" render through the exact same code path.
 */
export function VoucherFulfilmentPage() {
  const { code = '' } = useParams<{ code: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();

  const [verify, setVerify] = useState<VoucherVerifyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const { data } = await verifyVoucher(token, code);
      setVerify(data);
    } catch (err) {
      setVerify(null);
      setLoadError(err instanceof ApiRequestError ? err.message : 'Could not load this voucher.');
    } finally {
      setLoading(false);
    }
  }, [token, code]);

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
      await load();
      setActionBusy(false);
    }
  };

  const doStart = () =>
    runAction(async () => {
      await startService(token, code);
    }, 'Service started.');
  const doFinish = () =>
    runAction(async () => {
      await finishService(token, code);
    }, 'Service done.');

  const page = (children: ReactNode) => (
    <div className="admin-page admin-page--wide vendor-portal">
      <title>{`Voucher ${code} · MSD`}</title>
      <meta name="robots" content="noindex" />
      {children}
    </div>
  );

  if (loading) return page(<p className="loading-state" role="status">Checking…</p>);

  if (loadError || !verify) {
    return page(
      <>
        <p className="error-state" role="alert">{loadError || 'Voucher not found.'}</p>
        <OutlinedButton onClick={() => navigate('/account/vendor-orders')}>Back to orders</OutlinedButton>
      </>,
    );
  }

  const { result, entitlement } = verify;

  if (result !== 'VALID' && result !== 'ALREADY_USED') {
    return page(
      <>
        <sky-feature-card
          color="surface-high"
          variant="outlined"
          icon="block"
          icon-style="surface"
          headline={scanResultCopy(result, entitlement)}
          text={entitlement.itemName}
        />
        <OutlinedButton onClick={() => navigate('/account/vendor-orders')}>Back to orders</OutlinedButton>
      </>,
    );
  }

  if (result === 'ALREADY_USED') {
    return page(
      <>
        <sky-feature-card
          color="primary"
          variant="outlined"
          icon="check_circle"
          icon-style="surface"
          headline="Service completed"
          text={`Finished ${entitlement.completedAt ? new Date(entitlement.completedAt).toLocaleString() : ''}. Your payout of ${formatINR(Number(entitlement.memberShareAmount))} is now eligible.`}
        />
        <div className="vendor-action-row">
          <FilledButton onClick={() => navigate('/account/vendor-orders/scan')}>
            <Icon slot="icon" aria-hidden="true">qr_code_scanner</Icon>
            Scan next customer
          </FilledButton>
          <OutlinedButton onClick={() => navigate('/account/vendor-orders')}>Back to orders</OutlinedButton>
        </div>
      </>,
    );
  }

  // result === 'VALID' from here: either ready to start, or already in service.
  const inService = entitlement.entitlementStatus === 'STARTED' || entitlement.entitlementStatus === 'OTP_REQUESTED';

  return page(
    <>
      {actionError && <p className="error-state" role="alert">{actionError}</p>}

      {!inService ? (
        <>
          <sky-feature-card color="primary" variant="outlined" icon="check_circle" icon-style="surface" headline="Valid voucher" text={entitlement.itemName} />
          <sky-card variant="outlined">
            <dl className="vendor-facts">
              <div><dt>Customer phone</dt><dd>{entitlement.customerPhone ?? 'Not on file'}</dd></div>
              {entitlement.branchName && <div><dt>Branch</dt><dd>{entitlement.branchName}</dd></div>}
              <div><dt>Order</dt><dd>{entitlement.orderNumber} · {formatLongDate(entitlement.purchasedAt)}</dd></div>
              {entitlement.qrExpiresAt && <div><dt>Valid till</dt><dd>{formatLongDate(entitlement.qrExpiresAt)}</dd></div>}
              <div><dt>Customer paid</dt><dd>{formatINR(Number(entitlement.grossAmount))}</dd></div>
              <div><dt>Your share</dt><dd><strong>{formatINR(Number(entitlement.memberShareAmount))}</strong></dd></div>
            </dl>
          </sky-card>
          <FilledButton className="vendor-orders-scan" onClick={doStart} disabled={actionBusy}>Start service</FilledButton>
        </>
      ) : (
        <>
          <sky-feature-card
            color="surface-high"
            variant="outlined"
            icon="pending"
            icon-style="surface"
            headline="Service in progress"
            text={`Started ${entitlement.serviceStartedAt ? new Date(entitlement.serviceStartedAt).toLocaleString() : ''}. This voucher can't be used again.`}
          />
          <FilledButton className="vendor-orders-scan" onClick={doFinish} disabled={actionBusy}>Service done</FilledButton>
        </>
      )}
    </>,
  );
}

export default VoucherFulfilmentPage;
