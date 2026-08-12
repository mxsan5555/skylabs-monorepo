import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import { OutlinedButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  createMyDeal,
  listCategories,
  listMyBranches,
  listMyDeals,
  setMyDealStatus,
  updateMyDeal,
  type Branch,
  type Category,
  type Deal,
  type DealInput,
} from '../../../../api/rbac/vendors';
import { listServices, type Service } from '../../../../api/rbac/services';
import { listProducts, type Product } from '../../../../api/rbac/products';
import { ApiRequestError } from '../../../../api/rbac/client';
import { DealDialog } from './vendor-branches';

const DEAL_COLUMNS = JSON.stringify([
  { key: 'Deal', label: 'Deal / Package' },
  { key: 'Type', label: 'Type' },
  { key: 'Item', label: 'Service / Product' },
  { key: 'Branch', label: 'Branch' },
  { key: 'Price', label: 'Price' },
  { key: 'Duration', label: 'Duration' },
  {
    key: 'Status',
    label: 'Status',
    type: 'status',
    statusMap: { ACTIVE: 'success', DRAFT: 'warning', INACTIVE: 'error', EXPIRED: 'error' },
  },
]);

const DEAL_ACTIONS = JSON.stringify([
  { icon: 'edit', label: 'Edit', event: 'edit' },
  { icon: 'toggle_on', label: 'Activate / Deactivate', event: 'toggle-status' },
]);

/** A deal row joined with the branch it belongs to, so the flat merged list (across all of
 *  the vendor's branches) can still show which branch each deal is published under. */
interface DealWithBranch extends Deal {
  branchName: string;
}

function toRow(d: DealWithBranch): Record<string, string | number> {
  return {
    Deal: d.title,
    Type: d.serviceId ? 'Service' : 'Product',
    Item: d.service?.name ?? d.product?.name ?? '—',
    Branch: d.branchName,
    Price: `₹${d.salePrice}`,
    Duration: d.durationMinutes ? `${d.durationMinutes} min` : '—',
    Status: d.status,
  };
}

interface TableParams {
  page: number;
  pageSize: number;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 20 };

/**
 * Vendor self-service "Deals / Packages" page. Like Therapists, the API is branch-scoped
 * (`GET /vendors/me/branches/:branchId/deals`) with no single "all my deals" endpoint, so this
 * page fetches the vendor's own branches first (same `listMyBranches` used by "Branches" and
 * "Therapists"), then fetches each branch's deals and merges them into one flat list with a
 * Branch column. This is purely an additional, cross-branch view of the same deals the
 * existing "Branches" page manages one-branch-at-a-time — it reuses that page's exact
 * `DealDialog` form (now exported, with an opt-in Branch selector for this flat context)
 * rather than duplicating it, so a deal created/edited here is the same underlying record.
 */
export function VendorDeals() {
  const { token } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [deals, setDeals] = useState<DealWithBranch[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [params, setParams] = useState<TableParams>(DEFAULT_PARAMS);

  const [editingDeal, setEditingDeal] = useState<DealWithBranch | null>(null);
  const addDialogRef = useRef<MdDialog>(null);
  const editDialogRef = useRef<MdDialog>(null);
  const tableRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // pageSize is capped at 100 server-side (PaginationQuerySchema) — 200 here 500s.
    listServices(token, { status: 'active', pageSize: 100 }).then(({ data }) => setServices(data)).catch(() => setServices([]));
    listProducts(token, { status: 'active', pageSize: 100 }).then(({ data }) => setProducts(data)).catch(() => setProducts([]));
    listCategories(token).then(({ data }) => setCategories(data)).catch(() => setCategories([]));
  }, [token]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: myBranches } = await listMyBranches(token);
      setBranches(myBranches);

      const perBranch = await Promise.all(
        myBranches.map(async (branch) => {
          const { data } = await listMyDeals(token, branch.id);
          return data.map((d) => ({ ...d, branchName: branch.name }));
        }),
      );
      setDeals(perBranch.flat());
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load your deals.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (input: DealInput, branchId: string, existing?: DealWithBranch) => {
    if (existing) {
      const { data } = await updateMyDeal(token, existing.branchId, existing.id, input);
      const branchName = branches.find((b) => b.id === data.branchId)?.name ?? existing.branchName;
      setDeals((prev) => prev.map((d) => (d.id === data.id ? { ...data, branchName } : d)));
    } else {
      const { data } = await createMyDeal(token, branchId, input);
      const branchName = branches.find((b) => b.id === branchId)?.name ?? '—';
      setDeals((prev) => [{ ...data, branchName }, ...prev]);
    }
    setMessage('Saved.');
  };

  const toggleStatus = async (deal: DealWithBranch) => {
    setError('');
    try {
      const nextStatus = deal.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      const { data } = await setMyDealStatus(token, deal.branchId, deal.id, nextStatus);
      setDeals((prev) => prev.map((d) => (d.id === data.id ? { ...data, branchName: deal.branchName } : d)));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change status.');
    }
  };

  const total = deals.length;
  const rows = useMemo(() => JSON.stringify(deals.map(toRow)), [deals]);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;

    const onParamsChange = (e: Event) => {
      const detail = (e as CustomEvent<SkyDataTableParamsDetail>).detail;
      setParams({ page: detail.page, pageSize: detail.pageSize });
    };
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; row: Record<string, unknown>; rowIndex: number }>).detail;
      const deal = deals[detail.rowIndex];
      if (!deal) return;
      if (detail.action === 'edit') {
        setEditingDeal(deal);
        editDialogRef.current?.show();
      } else if (detail.action === 'toggle-status') {
        toggleStatus(deal);
      }
    };

    el.addEventListener('sky-dt-params-change', onParamsChange);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParamsChange);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals]);

  const canAdd = branches.length > 0 && (services.length > 0 || products.length > 0);

  return (
    <div className="admin-page admin-page--wide">
      <title>Deals / Packages · MSD</title>
      <header className="page-head">
        <div>
          <h1>Deals / Packages</h1>
          <p>All deals and packages across your business's branches.</p>
        </div>
        <div className="page-head__actions">
          {canAdd && (
            <OutlinedButton onClick={() => addDialogRef.current?.show()}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              Add deal / package
            </OutlinedButton>
          )}
        </div>
      </header>

      {message && <p className="field-hint" role="status">{message}</p>}
      {error && <p className="error-state" role="alert">{error}</p>}

      {!loading && branches.length === 0 ? (
        <p className="empty-state">Add a branch under "Branches" before adding deals.</p>
      ) : (
        <sky-data-table
          ref={tableRef as RefObject<HTMLElement>}
          caption="Deals / Packages"
          columns={DEAL_COLUMNS}
          rows={rows}
          total={total}
          page={params.page}
          page-size={params.pageSize}
          loading={loading}
          actions={DEAL_ACTIONS}
        />
      )}

      {canAdd && (
        <DealDialog
          categories={categories}
          services={services}
          products={products}
          branches={branches}
          dialogRef={addDialogRef}
          hideTrigger
          onSave={(input, branchId) => save(input, branchId ?? branches[0]?.id ?? '')}
        />
      )}

      {editingDeal && (
        <DealDialog
          key={editingDeal.id}
          deal={editingDeal}
          categories={categories}
          services={services}
          products={products}
          branches={branches}
          dialogRef={editDialogRef}
          hideTrigger
          onSave={(input) => save(input, editingDeal.branchId, editingDeal)}
          onClose={() => setEditingDeal(null)}
        />
      )}
    </div>
  );
}

export default VendorDeals;
