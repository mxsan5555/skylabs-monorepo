import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Divider, FilledButton, Icon, List, ListItem } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getCustomer, setCustomerStatus, type Customer, type CustomerStatus } from '../../../../api/rbac/customers';
import { ApiRequestError } from '../../../../api/rbac/client';
import { showSnackbar } from '../../../../snackbar/snackbar';
import { useConfirmDialog } from '../../../components/confirm-dialog';
import { useSetBreadcrumbs } from '../../../admin/breadcrumb-context';
import { CardGrid } from '../../../components/card-grid/card-grid';
import { ChipNav } from '../../../components/chip-nav/chip-nav';
import { formatINR } from '../../../../utils/format';
import { customerDisplayName, customerStatusLabel } from './customer-list';
import { CustomerDetailOrders } from './customer-detail-orders';

const SECTIONS = [
  { key: 'orders', label: 'Orders' },
  { key: 'invoices', label: 'Invoices' },
] as const;
type SectionKey = (typeof SECTIONS)[number]['key'];

const STATUS_CONFIRM_COPY: Record<CustomerStatus, string> = {
  active: 'Are you sure you want to activate this customer?',
  inactive: 'Are you sure you want to deactivate this customer?',
  blocked: 'Are you sure you want to suspend this customer?',
};

const STATUS_SUCCESS_COPY: Record<CustomerStatus, string> = {
  active: 'Customer activated.',
  inactive: 'Customer deactivated.',
  blocked: 'Customer suspended.',
};

function statusBadgeVariant(status: CustomerStatus): 'primary' | 'tertiary' | 'error' {
  if (status === 'active') return 'primary';
  if (status === 'blocked') return 'error';
  return 'tertiary';
}

/** One customer's own page: `/account/customers/:customerId` (Overview) and
 *  `/account/customers/:customerId/:section` (Orders / Invoices) — same real-routes-not-tabs
 *  shape as the Member Detail page (`vendor-detail-page.tsx`). Admin/staff only (`customers:view`
 *  — gated one level up by the route's own `RequirePermission`). */
export function CustomerDetailPage() {
  const { customerId, section: rawSection } = useParams<{ customerId: string; section?: string }>();
  const section = SECTIONS.some((s) => s.key === rawSection) ? (rawSection as SectionKey) : undefined;
  const navigate = useNavigate();
  const { token, can } = useAuth();
  const canChangeStatus = can('customers', 'status_change');
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [statusError, setStatusError] = useState('');

  const load = useCallback(
    async (silent = false) => {
      if (!customerId) return;
      if (!silent) setLoading(true);
      try {
        const { data } = await getCustomer(token, customerId);
        setCustomer(data);
        setLoadError('');
      } catch (err) {
        if (!silent) setLoadError(err instanceof ApiRequestError ? err.message : 'Could not load this customer.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [token, customerId],
  );

  useEffect(() => {
    load();
  }, [load]);

  // A bookmarked/typed URL for an unknown section sends the admin back to Overview.
  useEffect(() => {
    if (!customer || !rawSection || section) return;
    navigate(`/account/customers/${customerId}`, { replace: true });
  }, [customer, rawSection, section, customerId, navigate]);

  const name = customer ? customerDisplayName(customer) : 'Customer';
  const SECTION_LABEL: Record<SectionKey, string> = { orders: 'Orders', invoices: 'Invoices' };
  useSetBreadcrumbs(
    section
      ? [{ label: 'Customers', to: '/account/customers' }, { label: name, to: `/account/customers/${customerId}` }, { label: SECTION_LABEL[section] }]
      : [{ label: 'Customers', to: '/account/customers' }, { label: name }],
  );

  const doStatusChange = async (status: CustomerStatus) => {
    if (!customer) return;
    if (!(await confirm(STATUS_CONFIRM_COPY[status]))) return;
    setStatusError('');
    try {
      const { data } = await setCustomerStatus(token, customer.id, status);
      setCustomer(data);
      showSnackbar(STATUS_SUCCESS_COPY[status]);
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : 'Could not change customer status.';
      setStatusError(msg);
      showSnackbar(msg, { variant: 'error' });
    }
  };

  const openOrder = useCallback((orderId: string) => navigate(`/account/customers/${customerId}/orders/${orderId}`), [navigate, customerId]);
  const openInvoice = useCallback((orderId: string) => navigate(`/account/customers/${customerId}/orders/${orderId}/invoice`), [navigate, customerId]);

  if (loading) {
    return (
      <div className="admin-page admin-page--wide">
        <p className="loading-state">Loading customer…</p>
      </div>
    );
  }
  if (loadError || !customer) {
    return (
      <div className="admin-page admin-page--wide">
        <p className="error-state" role="alert">{loadError || 'Customer not found.'}</p>
        <Link to="/account/customers">Back to all customers</Link>
      </div>
    );
  }

  return (
    <div className="admin-page admin-page--wide">
      <title>{`${name} · ${section ? SECTION_LABEL[section] : 'Overview'} · MSD`}</title>
      <header className="page-head">
        <div>
          <h1>{name}</h1>
          <p>
            <sky-badge variant={statusBadgeVariant(customer.status)}>{customerStatusLabel(customer.status)}</sky-badge>
          </p>
          <p className="field-hint">{[customer.phone, customer.email].filter(Boolean).join(' · ') || 'No contact on file'}</p>
          <p className="field-hint">Customer since {new Date(customer.createdAt).toLocaleDateString()}</p>
        </div>
      </header>

      {statusError && <p className="error-state" role="alert">{statusError}</p>}

      {!section && (
        <div className="admin-tab-panel summary-layout" aria-label="Overview">
          <div>
            <section aria-labelledby="customer-stats-title">
              <h2 id="customer-stats-title" className="section-title">At a glance</h2>
              <CardGrid layout="compact">
                <sky-tile-card color="secondary" variant="filled" icon="receipt_long" icon-style="surface" headline={String(customer._count.orders)} text="Total Orders" href={`/account/customers/${customerId}/orders`} />
                <sky-tile-card color="primary" variant="filled" icon="payments" headline={formatINR(customer.netPaid)} text="Net Paid" />
                <sky-tile-card color="tertiary" variant="filled" icon="hourglass_top" icon-style="surface" headline={formatINR(customer.awaitingPayment)} text="Awaiting Payment" />
                <sky-tile-card color="surface-high" variant="filled" icon="event" icon-style="surface" headline={customer.lastOrderAt ? new Date(customer.lastOrderAt).toLocaleDateString() : '—'} text="Last Order" />
              </CardGrid>
            </section>

            <section aria-labelledby="records-title">
              <h2 id="records-title" className="section-title">Orders &amp; Invoices</h2>
              <ChipNav
                items={[
                  { value: 'orders', label: 'Orders' },
                  { value: 'invoices', label: 'Invoices' },
                ]}
                value="orders"
                onSelect={(value) => navigate(`/account/customers/${customerId}/${value}`)}
                ariaLabel="Customer records"
              />
              <CustomerDetailOrders token={token} customerId={customer.id} mode="orders" onView={openOrder} />
            </section>
          </div>

          <section aria-labelledby="profile-card-title">
            <h2 id="profile-card-title" className="section-title">Profile</h2>
            <sky-card aria-label="Customer profile">
              <List>
                <ListItem>
                  <Icon slot="start" aria-hidden="true">person</Icon>
                  <div slot="headline">{name}</div>
                  <div slot="supporting-text">Name</div>
                </ListItem>
                <ListItem>
                  <Icon slot="start" aria-hidden="true">call</Icon>
                  <div slot="headline">{customer.phone ?? 'Not added'}</div>
                  <div slot="supporting-text">Mobile</div>
                </ListItem>
                <ListItem>
                  <Icon slot="start" aria-hidden="true">mail</Icon>
                  <div slot="headline">{customer.email ?? 'Not added'}</div>
                  <div slot="supporting-text">Email</div>
                </ListItem>
                <ListItem>
                  <Icon slot="start" aria-hidden="true">calendar_today</Icon>
                  <div slot="headline">{new Date(customer.createdAt).toLocaleDateString()}</div>
                  <div slot="supporting-text">Joined</div>
                </ListItem>
              </List>

              {canChangeStatus && (
                <>
                  <Divider />
                  <div className="profile-card__actions" role="group" aria-label="Change customer status">
                    {customer.status !== 'active' && (
                      <FilledButton onClick={() => doStatusChange('active')}>
                        <Icon slot="icon" aria-hidden="true">check_circle</Icon>Activate
                      </FilledButton>
                    )}
                    {customer.status !== 'inactive' && (
                      <FilledButton onClick={() => doStatusChange('inactive')}>
                        <Icon slot="icon" aria-hidden="true">pause_circle</Icon>Deactivate
                      </FilledButton>
                    )}
                    {customer.status !== 'blocked' && (
                      <FilledButton onClick={() => doStatusChange('blocked')}>
                        <Icon slot="icon" aria-hidden="true">block</Icon>Suspend
                      </FilledButton>
                    )}
                  </div>
                </>
              )}
            </sky-card>
          </section>
        </div>
      )}

      {section === 'orders' && (
        <div className="admin-tab-panel" aria-label="Orders">
          <CustomerDetailOrders token={token} customerId={customer.id} mode="orders" onView={openOrder} />
        </div>
      )}

      {section === 'invoices' && (
        <div className="admin-tab-panel" aria-label="Invoices">
          <CustomerDetailOrders token={token} customerId={customer.id} mode="invoices" onView={openInvoice} />
        </div>
      )}

      {ConfirmDialog}
    </div>
  );
}

export default CustomerDetailPage;
