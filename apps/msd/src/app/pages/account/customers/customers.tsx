import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, PrimaryTab } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listCustomers, getCustomer, type Customer } from '../../../../api/rbac/customers';
import { ApiRequestError } from '../../../../api/rbac/client';
import { CustomerList } from './customer-list';
import { CustomerDetailOrders } from './customer-detail-orders';

interface CustomerTableParams {
  page: number;
  pageSize: number;
  search: string;
}

const DEFAULT_PARAMS: CustomerTableParams = { page: 1, pageSize: 10, search: '' };

const CUSTOMER_DETAIL_TABS = ['Overview', 'Orders'] as const;

/**
 * SuperAdmin/staff Customer directory (`/account/customers`, `customers:view`) — read-only:
 * a customer's own data is only ever editable by the customer themself via the storefront
 * `/my-account` flow. Same list-then-drill-into-tabs shape as Vendor Management
 * (`vendors.tsx`'s `AdminVendorManagement`), minus the create/status-change actions that don't
 * apply to a customer record.
 */
export function CustomerManagement() {
  const { token } = useAuth();
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
  const [activeTab, setActiveTab] = useState(0);

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
          onSelect={setSelectedId}
          onParamsChange={setParams}
        />
      </section>

      {selectedId && (
        <section className="panel vendor-detail" aria-label="Customer details">
          {detailError && <p className="error-state" role="alert">{detailError}</p>}

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
                      <p className="stat-card__values">{selectedCustomer.status}</p>
                    </div>
                     <div className="stat-card stat-card--email">
                      <p className="stat-card__title">Email</p>
                      <p className="stat-card__values">{selectedCustomer.email ?? '—'}</p>
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
