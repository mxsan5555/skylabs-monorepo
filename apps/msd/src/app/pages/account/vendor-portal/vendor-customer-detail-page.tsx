import './member-portal.css';
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Icon, OutlinedButton } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getMyCustomer, type MyCustomerDetail } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useSetBreadcrumbs } from '../../../admin/breadcrumb-context';
import { formatINR } from '../../../../utils/format';
import { CustomerDetailOrders } from '../customers/customer-detail-orders';

function displayName(name: string | null): string {
  return name || 'Name not added';
}

interface BackState {
  fromOrderBackTo?: string;
}

/**
 * Member-scoped, read-only Customer Detail page (`/account/vendor-customers/:customerId`,
 * `vendor-portal.customers`) — Bug 2 fix: no member-scoped customer page existed anywhere before
 * this (a member only ever held `vendor-portal.customers:view`, never the admin `customers:view`
 * that `CustomerDetailPage` requires). Mirrors that admin page's structure (header, compact stats
 * row, order history) but sources its header/stats from the new vendor-scoped lookup (`GET
 * /vendors/me/customers/:customerId`, gated `vendors:custom`, 404s for a customer unrelated to
 * this vendor) and has no status-change actions — a member can't edit a customer's status.
 * Order history reuses the existing `CustomerDetailOrders`/`listOrders({customerId})`, which
 * already auto-scopes a vendor caller to only orders that actually involve them.
 */
export function VendorCustomerDetailPage() {
  const { customerId = '' } = useParams<{ customerId: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [customer, setCustomer] = useState<MyCustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const { data } = await getMyCustomer(token, customerId);
      setCustomer(data);
    } catch (err) {
      setCustomer(null);
      setLoadError(err instanceof ApiRequestError ? err.message : 'Could not load this customer.');
    } finally {
      setLoading(false);
    }
  }, [token, customerId]);

  useEffect(() => {
    load();
  }, [load]);

  const name = customer ? displayName(customer.name) : 'Customer';
  useSetBreadcrumbs([{ label: 'Customers', to: '/account/vendor-customers' }, { label: name }]);

  const backTo = (location.state as BackState | null)?.fromOrderBackTo;

  const openOrder = useCallback(
    (orderId: string) => navigate(`/account/orders/${orderId}`, { state: { backTo: `${location.pathname}${location.search}` } }),
    [navigate, location.pathname, location.search],
  );

  if (loading) {
    return (
      <div className="admin-page admin-page--wide member-portal">
        <meta name="robots" content="noindex" />
        <p className="loading-state">Loading customer…</p>
      </div>
    );
  }

  if (loadError || !customer) {
    return (
      <div className="admin-page admin-page--wide member-portal">
        <meta name="robots" content="noindex" />
        <p className="error-state" role="alert">{loadError || 'Customer not found.'}</p>
        <Link to="/account/vendor-customers">Back to all customers</Link>
      </div>
    );
  }

  return (
    <div className="admin-page admin-page--wide member-portal">
      <title>{`${name} · MSD`}</title>
      <meta name="robots" content="noindex" />
      <header className="page-head">
        <div>
          <h1>{name}</h1>
          <p className="field-hint">{[customer.phone, customer.email].filter(Boolean).join(' · ') || 'No contact on file'}</p>
        </div>
        <div className="page-head__actions">
          <OutlinedButton onClick={() => navigate(backTo ?? '/account/vendor-customers')}>
            <Icon slot="icon" aria-hidden="true">arrow_back</Icon>
            {backTo ? 'Back to Order' : 'Back to Customer List'}
          </OutlinedButton>
        </div>
      </header>

      <div className="member-summary-grid">
        <sky-card variant="outlined">
          <h2 className="section-title">Customer Details</h2>
          <dl className="member-facts">
            <div><dt>Name</dt><dd>{name}</dd></div>
            <div><dt>Phone</dt><dd>{customer.phone ?? '?'}</dd></div>
            <div><dt>Email</dt><dd>{customer.email ?? '?'}</dd></div>
          </dl>
        </sky-card>
        <sky-card variant="outlined">
          <h2 id="vendor-customer-stats-title" className="section-title">With My Business</h2>
          <dl className="member-facts">
            <div><dt>Total Orders</dt><dd>{customer.totalOrders}</dd></div>
            <div><dt>Confirmed Payments</dt><dd>{formatINR(customer.confirmedPaymentsTotal)}</dd></div>
          </dl>
        </sky-card>
      </div>

      <section aria-labelledby="vendor-customer-orders-title">
        <h2 id="vendor-customer-orders-title" className="section-title">Orders with My Business</h2>
        <CustomerDetailOrders token={token} customerId={customer.id} mode="orders" onView={openOrder} />
      </section>
    </div>
  );
}

export default VendorCustomerDetailPage;
