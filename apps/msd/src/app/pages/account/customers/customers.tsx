import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listCustomers, setCustomerStatus, type Customer, type CustomerStatus } from '../../../../api/rbac/customers';
import { ApiRequestError } from '../../../../api/rbac/client';
import { showSnackbar } from '../../../../snackbar/snackbar';
import { useConfirmDialog } from '../../../components/confirm-dialog';
import { CustomerList } from './customer-list';
import { CreateCustomerDialog } from './create-customer-dialog';

/** Confirm-dialog + success-snackbar copy per status-change target — mirrors `blog-list.tsx`'s
 *  `toggleStatus`/`remove` pattern (themed confirm dialog, then showSnackbar on resolve). */
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

/**
 * SuperAdmin/staff Customer directory (`/account/customers`, `customers:view`) — list only; each
 * row opens that customer's own full page (`/account/customers/:customerId`, see
 * `customer-detail-page.tsx`), same split as Member Management's List → Member Details. Mostly
 * read-only: a customer's own data is only ever editable by the customer themself via the
 * storefront `/my-account` flow. The one exception is status (Active/Inactive/Suspended), gated
 * on its own `customers:status_change` permission — a different permission from the RBAC Users
 * screen's `rbac.users:status_change`, unrelated.
 *
 * List page/pageSize/search are mirrored into the URL (`?page=&pageSize=&search=`) rather than
 * kept in plain `useState` — this component fully unmounts while a customer's page is open, so
 * plain local state would reset on every visit; the browser's own Back button restores this
 * exact querystring, which is what "preserve list state on return" actually means here.
 */
export function CustomerManagement() {
  const { token, can } = useAuth();
  const canChangeStatus = can('customers', 'status_change');
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const params = useMemo<CustomerTableParams>(
    () => ({
      page: Number(searchParams.get('page')) || DEFAULT_PARAMS.page,
      pageSize: Number(searchParams.get('pageSize')) || DEFAULT_PARAMS.pageSize,
      search: searchParams.get('search') ?? DEFAULT_PARAMS.search,
    }),
    [searchParams],
  );

  const setParams = useCallback(
    (next: CustomerTableParams) => {
      setSearchParams(
        (prev) => {
          const usp = new URLSearchParams(prev);
          usp.set('page', String(next.page));
          usp.set('pageSize', String(next.pageSize));
          if (next.search) usp.set('search', next.search);
          else usp.delete('search');
          return usp;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

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

  const openCustomer = useCallback((id: string) => navigate(`/account/customers/${id}`), [navigate]);

  const doStatusChange = useCallback(
    async (id: string, status: CustomerStatus) => {
      if (!(await confirm(STATUS_CONFIRM_COPY[status]))) return;
      try {
        const { data } = await setCustomerStatus(token, id, status);
        setCustomers((prev) => prev.map((c) => (c.id === data.id ? data : c)));
        setSelectedCustomer((prev) => (prev && prev.id === data.id ? data : prev));
        showSnackbar(STATUS_SUCCESS_COPY[status], { variant: 'success' });
      } catch (err) {
        const msg = err instanceof ApiRequestError ? err.message : 'Could not change customer status.';
        setStatusError(msg);
        showSnackbar(msg, { variant: 'error' });
      }
    },
    [token, confirm],
  );

  return (
    <div className="admin-page admin-page--wide">
      <title>Customer Management · MSD</title>
      <header className="page-head">
        <div>
          <h1>Customer Management</h1>
          <p>Every signed-up customer, with their orders.</p>
        </div>
        <div className="page-head__actions">
          {canCreate && (
            <CreateCustomerDialog onCreated={(customer) => setCustomers((prev) => [customer, ...prev])} />
          )}
        </div>
      </header>

      <section className="panel" aria-label="Customers">
        <h2>Customers ({total})</h2>
        {listError && <p className="error-state" role="alert">{listError}</p>}
        <CustomerList
          customers={customers}
          total={total}
          page={params.page}
          pageSize={params.pageSize}
          loading={loading}
          onSelect={openCustomer}
          onParamsChange={setParams}
          canChangeStatus={canChangeStatus}
          onStatusChange={doStatusChange}
        />
      </section>

      {ConfirmDialog}
    </div>
  );
}

export default CustomerManagement;
