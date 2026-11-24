import './member-portal.css';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FilledButton, Icon, OutlinedButton, OutlinedTextField } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getOrder, shortOrderNumber, type Order, type PurchaseEntitlement } from '../../../../api/rbac/orders';
import { markProductPickedUp, shipVoucher, recordDeliveryEvidence } from '../../../../api/rbac/vouchers';
import { ApiRequestError } from '../../../../api/rbac/client';
import { showSnackbar } from '../../../../snackbar/snackbar';
import { formatINR, formatLongDate } from '../../../../utils/format';
import { ShipForm } from './ship-form';

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Waiting for scan',
  STARTED: 'In service',
  OTP_REQUESTED: 'In service',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

function statusBadgeTone(ent: PurchaseEntitlement): 'success' | 'error' | 'neutral' {
  if (ent.entitlementStatus === 'COMPLETED') return 'success';
  if (ent.entitlementStatus === 'CANCELLED' || ent.entitlementStatus === 'REFUNDED') return 'error';
  return 'neutral';
}

function statusLabel(ent: PurchaseEntitlement): string {
  if (ent.fulfilmentKind === 'PRODUCT_PICKUP' && ent.entitlementStatus === 'COMPLETED') return 'No QR needed';
  return STATUS_LABEL[ent.entitlementStatus] ?? ent.entitlementStatus;
}

/**
 * Vendor-only Order Detail (`/account/vendor-orders/:orderId`) — order id/date, customer phone,
 * paid amount, then one row per item with its own status/action: a pending `PRODUCT_PICKUP` gets
 * "Picked up" (+ "Ship instead"); a shipped-but-not-yet-delivered `PRODUCT_SHIPPED` gets "Record
 * delivery evidence" (photo + note, same form the old wizard used); a deal/therapist line shows
 * Waiting for scan / In service / Completed (static — only a scan can advance it, never an action
 * on this page). A new, small page rather than a further extension of the shared, 3-call-site
 * `order-detail-page.tsx` (admin + customer + legacy vendor link) — reuses the same `GET
 * /orders/:id`, already vendor-scoped server-side (`order.service.ts#getOrderOrThrow`).
 *
 * Deliberately shows only "Customer paid" at the bottom, not a running "vendor's share" total —
 * `order.service.ts`'s `ADMIN_ENTITLEMENT_SELECT` explicitly keeps `memberShareAmount`/payout
 * internals out of the shared order view by design ("payout internals belong to Member
 * Settlements, not the order view"); a vendor's own share per voucher is already shown on the
 * Voucher Fulfilment page and in full on Earnings & Payouts.
 */
export function VendorOrderDetailPage() {
  const { orderId = '' } = useParams<{ orderId: string }>();
  const { token, can } = useAuth();
  const navigate = useNavigate();
  const canAct = can('vendor-portal.orders', 'custom');

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shippingEntId, setShippingEntId] = useState<string | null>(null);
  const [evidenceEntId, setEvidenceEntId] = useState<string | null>(null);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceNote, setEvidenceNote] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await getOrder(token, orderId);
      setOrder(data);
    } catch (err) {
      setOrder(null);
      setError(err instanceof ApiRequestError ? err.message : 'Could not load this order.');
    } finally {
      setLoading(false);
    }
  }, [token, orderId]);

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
      setShippingEntId(null);
      await load();
    } catch (err) {
      showSnackbar(err instanceof ApiRequestError ? err.message : 'Could not ship this item.', { variant: 'error' });
    } finally {
      setActionBusy(false);
    }
  };

  const doRecordEvidence = async (voucherCode: string) => {
    if (!evidenceFile) return;
    setActionBusy(true);
    try {
      await recordDeliveryEvidence(token, voucherCode, evidenceFile, evidenceFile.name, evidenceNote.trim() || undefined);
      showSnackbar('Delivery evidence recorded.', { variant: 'success' });
      setEvidenceEntId(null);
      setEvidenceFile(null);
      setEvidenceNote('');
      await load();
    } catch (err) {
      showSnackbar(err instanceof ApiRequestError ? err.message : 'Could not record delivery evidence.', { variant: 'error' });
    } finally {
      setActionBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-page admin-page--wide member-portal">
        <p className="loading-state" role="status">Loading…</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="admin-page admin-page--wide member-portal">
        <p className="error-state" role="alert">{error || 'Order not found.'}</p>
        <OutlinedButton onClick={() => navigate('/account/vendor-orders')}>Back to orders</OutlinedButton>
      </div>
    );
  }

  const paidAmount = order.payments.filter((p) => p.status === 'PAID').reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <div className="admin-page admin-page--wide member-portal">
      <title>{`Order ${shortOrderNumber(order.id)} · MSD`}</title>
      <meta name="robots" content="noindex" />
      <header className="page-head">
        <div>
          <h1>Order {shortOrderNumber(order.id)}</h1>
          <p className="field-hint">
            {formatLongDate(order.createdAt)} · {order.customer.phone ?? 'No phone on file'}
          </p>
        </div>
        <OutlinedButton onClick={() => navigate('/account/vendor-orders')}>
          <Icon slot="icon" aria-hidden="true">arrow_back</Icon>
          Back to orders
        </OutlinedButton>
      </header>

      <ul className="pending-list">
        {order.items.flatMap((item) =>
          item.purchaseEntitlements.map((ent) => {
            const canOfferPickup = canAct && ent.fulfilmentKind === 'PRODUCT_PICKUP' && ent.entitlementStatus !== 'COMPLETED';
            const canRecordEvidence = canAct && ent.fulfilmentKind === 'PRODUCT_SHIPPED' && ent.entitlementStatus === 'STARTED';

            return (
              <li key={ent.id} className="pending-row">
                <div className="pending-row__info">
                  <strong>{item.itemName}</strong>
                  {item.quantity > 1 && <p className="field-hint">Qty {item.quantity}</p>}
                </div>

                {canOfferPickup && (
                  <>
                    <div className="pending-row__actions">
                      <FilledButton onClick={() => doPickedUp(ent.voucherCode)} disabled={actionBusy}>Picked up</FilledButton>
                      <OutlinedButton onClick={() => setShippingEntId(shippingEntId === ent.id ? null : ent.id)} disabled={actionBusy}>
                        Ship instead
                      </OutlinedButton>
                    </div>
                    {shippingEntId === ent.id && <ShipForm busy={actionBusy} onShip={(input) => doShip(ent.voucherCode, input)} />}
                  </>
                )}

                {canRecordEvidence && (
                  <>
                    <div className="pending-row__actions">
                      <OutlinedButton onClick={() => setEvidenceEntId(evidenceEntId === ent.id ? null : ent.id)} disabled={actionBusy}>
                        Record delivery evidence
                      </OutlinedButton>
                    </div>
                    {evidenceEntId === ent.id && (
                      <div className="pending-row__ship-form member-action-row">
                        <label className="field-hint" htmlFor={`evidence-file-${ent.id}`}>Evidence photo</label>
                        <input
                          id={`evidence-file-${ent.id}`}
                          type="file"
                          accept="image/jpeg,image/png,application/pdf"
                          onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)}
                        />
                        <OutlinedTextField label="Note (optional)" value={evidenceNote} onInput={(e: Event) => setEvidenceNote((e.target as HTMLInputElement).value)} />
                        <FilledButton onClick={() => doRecordEvidence(ent.voucherCode)} disabled={actionBusy || !evidenceFile}>Save</FilledButton>
                      </div>
                    )}
                  </>
                )}

                {!canOfferPickup && !canRecordEvidence && <sky-badge status={statusBadgeTone(ent)}>{statusLabel(ent)}</sky-badge>}
              </li>
            );
          }),
        )}
      </ul>

      <section aria-labelledby="order-payment-title" className="panel">
        <h2 id="order-payment-title" className="section-title">Payment</h2>
        <dl className="member-facts">
          <div><dt>Customer paid</dt><dd>{formatINR(paidAmount)}</dd></div>
        </dl>
      </section>
    </div>
  );
}

export default VendorOrderDetailPage;
