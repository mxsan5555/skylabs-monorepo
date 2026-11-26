import './vendor-portal.css';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FilledButton, Icon, OutlinedButton } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listPendingFulfilment, markProductPickedUp, shipVoucher, type PendingServiceRow, type PendingProductRow } from '../../../../api/rbac/vouchers';
import { ApiRequestError } from '../../../../api/rbac/client';
import { showSnackbar } from '../../../../snackbar/snackbar';
import { formatLongDate } from '../../../../utils/format';
import { OrderManagement } from '../orders/orders';
import { ShipForm } from './ship-form';

/**
 * Vendor "Orders" page (`/account/vendor-orders`) — replaces the old 3-tab `MemberOrdersPage`
 * (Order History / Verify & Complete / Scan QR) with one page, no tabs: a single "Scan customer
 * QR" entry point, the vendor's own still-open deals/therapist-bookings and products
 * (`GET /vouchers/pending-fulfilment`, replacing the old searchable Service Queue), then the
 * existing order history list below (`OrderManagement scope="member"`, unchanged). There is no
 * manual voucher-code entry anywhere on this page — a service voucher can only be advanced by
 * scanning it; a product action is one tap from its own row here.
 *
 * Legacy deep links from the old 3-tab page redirect rather than landing on a tab that no longer
 * exists: `?tab=scan` goes straight to the scanner, `?tab=verify` lands here (this page's own
 * "Services waiting" list is the natural successor to the old Service Queue).
 */
export function VendorOrdersPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'scan') {
      navigate('/account/vendor-orders/scan', { replace: true });
    } else if (tab != null) {
      setSearchParams(
        (prev) => {
          const usp = new URLSearchParams(prev);
          usp.delete('tab');
          return usp;
        },
        { replace: true },
      );
    }
  }, [searchParams, navigate, setSearchParams]);

  const [servicesWaiting, setServicesWaiting] = useState<PendingServiceRow[]>([]);
  const [productsPending, setProductsPending] = useState<PendingProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [shippingId, setShippingId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const { data } = await listPendingFulfilment(token);
      setServicesWaiting(data.servicesWaiting);
      setProductsPending(data.productsPending);
    } catch (err) {
      setLoadError(err instanceof ApiRequestError ? err.message : 'Could not load your orders.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const doPickedUp = async (voucherCode: string) => {
    setActionBusy(true);
    try {
      await markProductPickedUp(token, voucherCode);
      showSnackbar('Marked picked up.', { variant: 'success' });
      await load();
    } catch (err) {
      showSnackbar(err instanceof ApiRequestError ? err.message : 'Could not mark this picked up.', { variant: 'error' });
    } finally {
      setActionBusy(false);
    }
  };

  const doShip = async (voucherCode: string, input: { carrier: string; trackingNumber: string }) => {
    setActionBusy(true);
    try {
      await shipVoucher(token, voucherCode, input);
      showSnackbar('Marked shipped.', { variant: 'success' });
      setShippingId(null);
      await load();
    } catch (err) {
      showSnackbar(err instanceof ApiRequestError ? err.message : 'Could not ship this item.', { variant: 'error' });
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="admin-page admin-page--wide vendor-portal">
      <title>Orders · MSD</title>
      <meta name="robots" content="noindex" />
      <header className="page-head">
        <h1>Orders</h1>
      </header>

      <section aria-labelledby="scan-cta-title" className="panel">
        <h2 id="scan-cta-title" className="sr-only">Scan a customer&apos;s QR</h2>
        <FilledButton className="vendor-orders-scan" onClick={() => navigate('/account/vendor-orders/scan')}>
          <Icon slot="icon" aria-hidden="true">qr_code_scanner</Icon>
          Scan customer QR
        </FilledButton>
        <p className="field-hint">For deals and therapist bookings</p>
      </section>

      {loadError && <p className="error-state" role="alert">{loadError}</p>}

      <section aria-labelledby="services-waiting-title">
        <h2 id="services-waiting-title" className="section-title">Services waiting ({servicesWaiting.length})</h2>
        {loading ? (
          <p className="loading-state" role="status">Loading…</p>
        ) : servicesWaiting.length === 0 ? (
          <p className="empty-state">Nothing waiting right now.</p>
        ) : (
          <ul className="pending-list">
            {servicesWaiting.map((row) => (
              <li key={row.id} className="pending-row">
                <div className="pending-row__info">
                  <strong>{row.itemName}</strong>
                  <sky-badge status="info">{row.kind === 'DEAL' ? 'Deal' : 'Therapist'}</sky-badge>
                  <p className="field-hint">
                    {row.customerPhone ?? 'No phone on file'}
                    {row.validTill ? ` · Valid till ${formatLongDate(row.validTill)}` : ''}
                  </p>
                </div>
                <sky-badge status="neutral">Waiting for scan</sky-badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="products-pending-title">
        <h2 id="products-pending-title" className="section-title">Products to give or send ({productsPending.length})</h2>
        {loading ? (
          <p className="loading-state" role="status">Loading…</p>
        ) : productsPending.length === 0 ? (
          <p className="empty-state">Nothing pending right now.</p>
        ) : (
          <ul className="pending-list">
            {productsPending.map((row) => (
              <li key={row.id} className="pending-row">
                <div className="pending-row__info">
                  <strong>{row.itemName}</strong>
                  <p className="field-hint">{row.customerPhone ?? 'No phone on file'}</p>
                </div>
                {row.fulfilmentKind === 'PRODUCT_PICKUP' ? (
                  <>
                    <div className="pending-row__actions">
                      <FilledButton onClick={() => doPickedUp(row.voucherCode)} disabled={actionBusy}>Picked up</FilledButton>
                      <OutlinedButton onClick={() => setShippingId(shippingId === row.id ? null : row.id)} disabled={actionBusy}>
                        Ship instead
                      </OutlinedButton>
                    </div>
                    {shippingId === row.id && <ShipForm busy={actionBusy} onShip={(input) => doShip(row.voucherCode, input)} />}
                  </>
                ) : (
                  <sky-badge status="info">Shipped</sky-badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="all-orders-title">
        <h2 id="all-orders-title" className="section-title">All orders</h2>
        <OrderManagement scope="member" />
      </section>
    </div>
  );
}

export default VendorOrdersPage;
