import { Fragment, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FilledButton, OutlinedButton, Icon, Divider } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getMyOrder, type Order } from '../../../api/orders';
import { ApiRequestError } from '../../../api/rbac/client';
import { formatINR } from '../../../utils/format';
import { groupOrderItemsByVendor } from '../../../utils/order-items';
import './invoice.css';

/**
 * Real, printable/downloadable invoice for a customer's own order — `GET /orders/me/:id`
 * (already ownership-scoped: 404s for another customer's order, same as every other `/me/*`
 * endpoint) already returns everything an invoice needs (items, vendor/branch snapshot,
 * contact/shipping details, payments) — no new backend endpoint required.
 *
 * "Download" is the browser's native print-to-PDF (`window.print()` + the `@media print` rules
 * in `invoice.css`, which hide the site chrome and this page's own action buttons) rather than a
 * new PDF-generation dependency — no `pdf` library exists anywhere in this repo today, and a
 * print-friendly HTML page is the lightest real implementation that still produces a genuine,
 * downloadable PDF via "Save as PDF" in the browser's print dialog.
 *
 * No "Discount" line: `OrderItem` snapshots only `unitPrice`/`lineTotal`, never an
 * `originalPrice`/`discountPercent` — inventing one here would violate this codebase's
 * "never fabricate" rule, so it's simply omitted rather than guessed.
 */
export function Invoice() {
  const { id = '' } = useParams<{ id: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    getMyOrder(token, id)
      .then(({ data }) => setOrder(data))
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load this invoice.'))
      .finally(() => setLoading(false));
  }, [token, id]);

  if (loading) return <p className="loading-state">Loading invoice…</p>;

  if (error || !order) {
    return (
      <div className="invoice-page invoice-page--empty">
        <title>Invoice Not Found | MSD</title>
        <sky-info-card icon="receipt_long" heading="Invoice not found" subheading={error || 'It may belong to a different account.'} />
        <FilledButton onClick={() => navigate('/orders')}>My Orders</FilledButton>
      </div>
    );
  }

  const latestPayment = order.payments.length
    ? [...order.payments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    : null;
  const vendorGroups = groupOrderItemsByVendor(order.items);
  const isMultiVendor = vendorGroups.length > 1;

  return (
    <div className="invoice-page">
      <title>{`Invoice ${order.id} | MSD`}</title>
      <meta name="robots" content="noindex" />

      <div className="invoice-page__actions">
        <OutlinedButton onClick={() => navigate(`/orders/${order.id}`)}>
          <Icon slot="icon" aria-hidden="true">arrow_back</Icon>
          Back to Order
        </OutlinedButton>
        <FilledButton onClick={() => window.print()}>
          <Icon slot="icon" aria-hidden="true">download</Icon>
          Download / Print
        </FilledButton>
      </div>

      <article className="invoice">
        <header className="invoice__header">
          <div>
            <h1 className="invoice__vendor">
              {isMultiVendor ? `${vendorGroups.length} Vendors` : order.vendorNameSnapshot}
            </h1>
            {!isMultiVendor && <p className="invoice__branch">{order.branchNameSnapshot}</p>}
          </div>
          <div className="invoice__meta">
            <h2 className="invoice__title">Invoice</h2>
            <p>Order ID: {order.id}</p>
            <p>Invoice date: {new Date(order.createdAt).toLocaleDateString()}</p>
          </div>
        </header>

        <Divider />

        <section className="invoice__parties">
          <div>
            <h3>Billed to</h3>
            <p>{order.contactName || '—'}</p>
            {order.contactPhone && <p>{order.contactPhone}</p>}
            {order.contactEmail && <p>{order.contactEmail}</p>}
          </div>
          {order.shippingAddress && (
            <div>
              <h3>Shipping address</h3>
              <p>{order.shippingAddress}</p>
              <p>
                {[order.shippingCity, order.shippingState, order.shippingPincode].filter(Boolean).join(', ')}
              </p>
            </div>
          )}
        </section>

        <Divider />

        <table className="invoice__items">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Line Total</th>
            </tr>
          </thead>
          <tbody>
            {vendorGroups.map((group) => (
              <Fragment key={group.vendorId}>
                {isMultiVendor && (
                  <tr className="invoice__items-vendor-row">
                    <td colSpan={4}>{group.vendorName} · {group.branchName}</td>
                  </tr>
                )}
                {group.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.itemName}
                      {item.durationMinutes ? ` (${item.durationMinutes} min)` : ''}
                    </td>
                    <td>{item.quantity}</td>
                    <td>{formatINR(Number(item.unitPrice))}</td>
                    <td>{formatINR(Number(item.lineTotal))}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>

        <div className="invoice__totals">
          <div className="invoice__totals-row">
            <span>Subtotal</span>
            <span>{formatINR(Number(order.subtotal))}</span>
          </div>
          <div className="invoice__totals-row invoice__totals-row--grand">
            <span>Total</span>
            <span>{formatINR(Number(order.total))}</span>
          </div>
        </div>

        <Divider />

        <section className="invoice__payment">
          <div>
            <h3>Payment method</h3>
            <p>{latestPayment?.provider === 'COD' ? 'Cash on Delivery' : latestPayment?.provider ?? '—'}</p>
          </div>
          <div>
            <h3>Payment status</h3>
            <p>{latestPayment?.status ?? '—'}</p>
          </div>
          <div>
            <h3>Order status</h3>
            <p>{order.status}</p>
          </div>
        </section>
      </article>
    </div>
  );
}

export default Invoice;
