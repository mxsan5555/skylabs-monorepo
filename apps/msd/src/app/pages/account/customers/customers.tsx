import { useCallback, useEffect, useMemo,  useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, PrimaryTab } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listCustomers, getCustomer, setCustomerStatus, type Customer, type CustomerStatus } from '../../../../api/rbac/customers';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useToast } from '../../../../toast/toast-context';
import { CustomerList, customerStatusLabel } from './customer-list';
import { CustomerDetailOrders } from './customer-detail-orders';

/** Confirm-dialog + success-toast copy per status-change target — mirrors `blog-list.tsx`'s
 *  `toggleStatus`/`remove` pattern (window.confirm, then showToast on resolve). */
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

interface CustomerTableParams {
  page: number;
  pageSize: number;
  search: string;
}

const DEFAULT_PARAMS: CustomerTableParams = { page: 1, pageSize: 10, search: '' };

const CUSTOMER_DETAIL_TABS = ['Overview', 'Orders'] as const;

/**
 * SuperAdmin/staff Customer directory (`/account/customers`, `customers:view`) — mostly
 * read-only: a customer's own data is only ever editable by the customer themself via the
 * storefront `/my-account` flow. The one exception is status (Active/Inactive/Suspended),
 * gated on its own `customers:status_change` permission — a different permission from the RBAC
 * Users screen's `rbac.users:status_change`, unrelated. Same list-then-drill-into-tabs shape as
 * Vendor Management (`vendors.tsx`'s `AdminVendorManagement`), minus the create/approve/reject
 * actions that don't apply to a customer record.
 */
export function CustomerManagement() {
  const { token, can } = useAuth();
  const canChangeStatus = can('customers', 'status_change');
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [params, setParams] = useState<CustomerTableParams>(DEFAULT_PARAMS);
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get('customerId'));
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const customerDetailsRef = useRef<HTMLElement>(null);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      const { data, meta } = await listCustomers(token, {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
      });
      setCustomers(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setListError(err instanceof ApiRequestError ? err.message : 'Could not load customers.');
    } finally {
      setLoading(false);
    }
  }, [token, params]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const handleCustomerSelect = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const loadDetail = useCallback(async () => {
    if (!selectedId) {
      setSelectedCustomer(null);
      return;
    }
    setDetailLoading(true);
    setDetailError('');
    try {
      const { data } = await getCustomer(token, selectedId);
      setSelectedCustomer(data);
    } catch (err) {
      setSelectedCustomer(null);
      setDetailError(err instanceof ApiRequestError ? err.message : 'Could not load this customer.');
    } finally {
      setDetailLoading(false);
    }
  }, [token, selectedId]);

  useEffect(() => {
    setActiveTab(0);
    loadDetail();
  }, [loadDetail]);

  /** Fired from the customer-list actions column (`customer-list.tsx`'s row-action handler
   *  already resolved the clicked action to a target status and guarded the no-op case). Only
   *  updates local state after the API call resolves — never optimistically — so a failed
   *  request can never leave the table showing a status that was never actually saved. */
  const doStatusChange = useCallback(
    async (id: string, status: CustomerStatus) => {
      if (!window.confirm(STATUS_CONFIRM_COPY[status])) return;
      setStatusError('');
      try {
        const { data } = await setCustomerStatus(token, id, status);
        setCustomers((prev) => prev.map((c) => (c.id === data.id ? data : c)));
        setSelectedCustomer((prev) => (prev && prev.id === data.id ? data : prev));
        showToast(STATUS_SUCCESS_COPY[status]);
      } catch (err) {
        const msg = err instanceof ApiRequestError ? err.message : 'Could not change customer status.';
        setStatusError(msg);
        showToast(msg, 'error');
      }
    },
    [token, showToast],
  );

  const memoParams = useMemo(() => params, [params]);

  return (
    <div className="admin-page admin-page--wide">
      <title>Customer Management · MSD</title>
      <header className="page-head">
        <div>
          <h1>Customer Management</h1>
          <p>Every signed-up customer, with their orders.</p>
        </div>
      </header>

      <section className="panel" aria-label="Customers">
        <h2>Customers ({total})</h2>
        {listError && <p className="error-state" role="alert">{listError}</p>}
        <CustomerList
          customers={customers}
          total={total}
          page={memoParams.page}
          pageSize={memoParams.pageSize}
          loading={loading}
          // onSelect={setSelectedId}
          onSelect={handleCustomerSelect}
          onParamsChange={setParams}
          canChangeStatus={canChangeStatus}
          onStatusChange={doStatusChange}
        />
      </section>

      {selectedId && (
        <section  ref={customerDetailsRef} className="panel vendor-detail" aria-label="Customer details">
          {detailError && <p className="error-state" role="alert">{detailError}</p>}
          {statusError && <p className="error-state" role="alert">{statusError}</p>}

          {detailLoading ? (
            <p className="loading-state">Loading customer…</p>
          ) : selectedCustomer ? (
            <>
              <div className="page-head">
                <h2>{selectedCustomer.name}</h2>
              </div>

              <div className="admin-tabs-wrap">
                <Tabs
                  className="admin-tabs"
                  onChange={(e) => setActiveTab((e.target as unknown as { activeTabIndex: number }).activeTabIndex)}
                >
                  {CUSTOMER_DETAIL_TABS.map((label, i) => (
                    <PrimaryTab key={label} active={activeTab === i}>
                      {label}
                    </PrimaryTab>
                  ))}
                </Tabs>
              </div>

              {activeTab === 0 && (
                <div className="admin-tab-panel" aria-label="Overview">
                  <div className="widget-grids">
                    <div className="stat-card">
                      <p className="stat-card__title">Mobile</p>
                      <p className="stat-card__values">{selectedCustomer.phone ?? '—'}</p>
                    </div>
                    <div className="stat-card">
                      <p className="stat-card__title">Status</p>
                      <p className="stat-card__value">{customerStatusLabel(selectedCustomer.status)}</p>
                    </div>
                    <div className="stat-card">
                      <p className="stat-card__title">Total Orders</p>
                      <p className="stat-card__values">{selectedCustomer._count.orders}</p>
                    </div>
                    <div className="stat-card">
                      <p className="stat-card__title">Customer Since</p>
                      <p className="stat-card__values">{new Date(selectedCustomer.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 1 && (
                <div className="admin-tab-panel" aria-label="Orders">
                  <CustomerDetailOrders token={token} customerId={selectedCustomer.id} />
                </div>
              )}
            </>
          ) : null}
        </section>
      )}

      {!selectedId && <p className="empty-state">Select a customer to view their details.</p>}
    </div>
  );
}

export default CustomerManagement;
