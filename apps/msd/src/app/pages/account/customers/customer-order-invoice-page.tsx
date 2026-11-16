import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CircularProgress, FilledButton, Icon, OutlinedButton } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getOrder, type Order } from '../../../../api/rbac/orders';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useSetBreadcrumbs } from '../../../admin/breadcrumb-context';
import { InvoiceDocument } from '../../../components/invoice-document';
import { customerDisplayName } from './customer-list';
import '../../invoice/invoice.css';

/**
 * Admin, read-only Invoice view — `/account/customers/:customerId/orders/:orderId/invoice`.
 * Same real `InvoiceDocument` the customer's own `/orders/:id/invoice` renders (see that
 * component's doc comment — no invoice-number/tax invention, no second implementation), fed
 * from the admin `GET /orders/:id` endpoint instead of the self-service one. Same
 * customer-association defense as `OrderDetailPage` (`../orders/order-detail-page.tsx`), which
 * replaced the old customer-only `CustomerOrderDetailPage` this file used to sit alongside.
 */
export function CustomerOrderInvoicePage() {
  const { customerId = '', orderId = '' } = useParams<{ customerId: string; orderId: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await getOrder(token, orderId);
      if (data.customerId !== customerId) {
        setOrder(null);
        setError('This order does not belong to this customer.');
        return;
      }
      setOrder(data);
    } catch (err) {
      setOrder(null);
      setError(err instanceof ApiRequestError ? err.message : 'Could not load this invoice.');
    } finally {
      setLoading(false);
    }
  }, [token, orderId, customerId]);

  useEffect(() => {
    load();
  }, [load]);

  useSetBreadcrumbs(
    order
      ? [
          { label: 'Customers', to: '/account/customers' },
          { label: customerDisplayName(order.customer), to: `/account/customers/${customerId}` },
          { label: 'Orders', to: `/account/customers/${customerId}/orders` },
          { label: `Order #${order.id}`, to: `/account/customers/${customerId}/orders/${order.id}` },
          { label: 'Invoice' },
        ]
      : [],
  );

  if (loading) {
    return (
      <div className="invoice-loading">
        <CircularProgress indeterminate aria-label="Loading invoice" />
        <p>Loading invoice…</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="invoice-page invoice-page--empty">
        <sky-info-card icon="receipt_long" heading="Invoice not found" subheading={error || 'This order could not be found.'} />
        <Link to={`/account/customers/${customerId}/orders`}>Back to orders</Link>
      </div>
    );
  }

  return (
    <div className="invoice-page">
      <title>{`Invoice — Order #${order.id} · MSD`}</title>
      <div className="invoice-page__actions">
        <OutlinedButton onClick={() => navigate(`/account/customers/${customerId}/orders/${order.id}`)}>
          <Icon slot="icon" aria-hidden="true">arrow_back</Icon>Back to Order
        </OutlinedButton>
        <FilledButton onClick={() => window.print()}>
          <Icon slot="icon" aria-hidden="true">download</Icon>Download / Print
        </FilledButton>
      </div>
      <InvoiceDocument order={order} />
    </div>
  );
}

export default CustomerOrderInvoicePage;
