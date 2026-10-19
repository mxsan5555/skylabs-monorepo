import { Fragment } from 'react';
import { Divider } from '@skylabs-monorepo/shared-ui/react';
import { formatINR } from '../../utils/format';
import { groupOrderItemsByVendor, type GroupableOrderItem } from '../../utils/order-items';
import content from '../../content.json';

const { invoice } = content;

/** Minimal shape this presentational document actually reads — satisfied structurally by both
 *  the customer self-service `Order` (api/orders.ts) and the admin `Order` (api/rbac/orders.ts),
 *  so the same real invoice layout serves `/orders/:id/invoice` (customer) and
 *  `/account/customers/:customerId/orders/:orderId/invoice` (admin) without a second
 *  implementation. No "Discount" line, no invoice numbering, no tax line — `OrderItem` snapshots
 *  only `unitPrice`/`lineTotal`, and this `Order` has no separate invoice-number field; inventing
 *  either would violate this codebase's "never fabricate" rule, so both are simply omitted. */
export interface InvoiceDocumentOrder<Item extends GroupableOrderItem = GroupableOrderItem> {
  id: string;
  createdAt: string;
  vendorNameSnapshot: string;
  branchNameSnapshot: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  shippingAddress?: string | null;
  shippingCity?: string | null;
  shippingState?: string | null;
  shippingPincode?: string | null;
  subtotal: string;
  total: string;
  status: string;
  items: Item[];
  payments: Array<{ status: string; provider: string; createdAt: string }>;
}

export function InvoiceDocument<Item extends GroupableOrderItem>({ order }: { order: InvoiceDocumentOrder<Item> }) {
  const latestPayment = order.payments.length
    ? [...order.payments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    : null;
  const vendorGroups = groupOrderItemsByVendor(order.items);
  const isMultiVendor = vendorGroups.length > 1;

  return (
    <article className="invoice">
      <header className="invoice__header">
        <div>
          <h1 className="invoice__vendor">
            {isMultiVendor ? `${vendorGroups.length} Vendors` : order.vendorNameSnapshot}
          </h1>
          {!isMultiVendor && order.branchNameSnapshot && <p className="invoice__branch">{order.branchNameSnapshot}</p>}
        </div>
        <div className="invoice__meta">
          <h2 className="invoice__title">{invoice.title}</h2>
          <p>{invoice.labels.orderId} {order.id}</p>
          <p>{invoice.labels.invoiceDate}{' '}{new Date(order.createdAt).toLocaleDateString()}</p>
        </div>
      </header>

      <Divider />

      <section className="invoice__parties">
        <div>
          <h3>{invoice.labels.billedTo}</h3>
          <p>{order.contactName || '—'}</p>
          {order.contactPhone && <p>{order.contactPhone}</p>}
          {order.contactEmail && <p>{order.contactEmail}</p>}
        </div>
        {order.shippingAddress && (
          <div>
            <h3>{invoice.labels.shippingAddress}</h3>
            <p>{order.shippingAddress}</p>
            <p>{[order.shippingCity, order.shippingState, order.shippingPincode].filter(Boolean).join(', ')}</p>
          </div>
        )}
      </section>

      <Divider />

      <table className="invoice__items">
        <thead>
          <tr>
            <th>{invoice.labels.item}</th>
            <th>{invoice.labels.quantity}</th>
            <th>{invoice.labels.unitPrice}</th>
            <th>{invoice.labels.lineTotal}</th>
          </tr>
        </thead>
        <tbody>
          {vendorGroups.map((group) => (
            <Fragment key={group.vendorId}>
              {isMultiVendor && (
                <tr className="invoice__items-vendor-row">
                  <td colSpan={4}>
                    {group.vendorName}
                    {group.branchName ? ` · ${group.branchName}` : ''}
                  </td>
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
        <tfoot>
          <tr className="invoice__summary-row">
            <td colSpan={3}>{invoice.labels.subtotal}</td>
            <td>{formatINR(Number(order.subtotal))}</td>
          </tr>
          <tr className="invoice__summary-row invoice__summary-row--grand">
            <td colSpan={3}>{invoice.labels.total}</td>
            <td>{formatINR(Number(order.total))}</td>
          </tr>
        </tfoot>
      </table>

      <Divider />

      <section className="invoice__payment">
        <div>
          <h3>{invoice.labels.paymentMethod}</h3>
          <p>{latestPayment?.provider === 'COD' ? invoice.labels.cashOnDelivery : latestPayment?.provider ?? '—'}</p>
        </div>
        <div>
          <h3>{invoice.labels.paymentStatus}</h3>
          <sky-badge>{latestPayment?.status ?? '—'}</sky-badge>
        </div>
        <div>
          <h3>{invoice.labels.orderStatus}</h3>
          <sky-badge>{order.status}</sky-badge>
        </div>
      </section>
    </article>
  );
}

export default InvoiceDocument;
