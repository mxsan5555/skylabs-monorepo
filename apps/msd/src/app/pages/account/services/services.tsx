import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import {
  Dialog,
  FilledButton,
  OutlinedButton,
  OutlinedTextField,
  OutlinedSelect,
  SelectOption,
  TextButton,
  Icon,
} from '@skylabs-monorepo/shared-ui/react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  createService,
  deleteService,
  listServices,
  setServiceStatus,
  updateService,
  type Service,
  type ServiceInput,
} from '../../../../api/rbac/services';
import { listCategories, type Category } from '../../../../api/rbac/categories';
import { ApiRequestError } from '../../../../api/rbac/client';

const SERVICE_COLUMNS = JSON.stringify([
  { key: 'Name', label: 'Name' },
  { key: 'Category', label: 'Category' },
  { key: 'Subcategory', label: 'Subcategory' },
  { key: 'Duration', label: 'Duration' },
  { key: 'Status', label: 'Status', type: 'status', statusMap: { Active: 'success', Inactive: 'error' } },
]);

const SERVICE_FILTERS = JSON.stringify([
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
]);

interface TableParams {
  page: number;
  pageSize: number;
  search: string;
  filter: string;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 10, search: '', filter: '' };

/**
 * Marketplace service catalog admin CRUD — mirrors `ProductManagement`'s exact list +
 * Add/Edit-dialog pattern, standardized onto the same <sky-data-table> used by
 * Orders/Bookings. A Service is a catalog definition only (e.g. "Haircut"); it is never
 * priced and never vendor/branch-scoped — a vendor's actual bookable offering of a Service
 * is a Deal (see the marketplace architecture plan), not a field on this page.
 */
export function ServiceManagement() {
  const { token, can } = useAuth();
  const canCreate = can('services', 'create');
  const canEdit = can('services', 'edit');
  const canDelete = can('services', 'delete');

  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useState<TableParams>(DEFAULT_PARAMS);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [editingService, setEditingService] = useState<Service | null>(null);
  const addDialogRef = useRef<MdDialog>(null);
  const editDialogRef = useRef<MdDialog>(null);
  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listServices(token, {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
        status: (params.filter || undefined) as 'active' | 'inactive' | undefined,
      });
      setServices(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load services.');
    } finally {
      setLoading(false);
    }
  }, [token, params]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // pageSize is capped at 100 server-side (PaginationQuerySchema) — 200 here 500s.
    listCategories(token, { pageSize: 100 }).then(({ data }) => setCategories(data)).catch(() => setCategories([]));
  }, [token]);

  const categoryName = useCallback((id: string) => categories.find((c) => c.id === id)?.name ?? id, [categories]);

  const save = async (input: ServiceInput, existing?: Service) => {
    if (existing) {
      const { data } = await updateService(token, existing.id, input);
      setServices((prev) => prev.map((s) => (s.id === data.id ? data : s)));
    } else {
      const { data } = await createService(token, input);
      setServices((prev) => [data, ...prev]);
      setTotal((t) => t + 1);
    }
    setMessage('Saved.');
  };

  const toggleStatus = async (service: Service) => {
    setError('');
    try {
      const { data } = await setServiceStatus(token, service.id, !service.isActive);
      setServices((prev) => prev.map((s) => (s.id === data.id ? data : s)));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change status.');
    }
  };

  const remove = async (service: Service) => {
    if (!window.confirm(`Delete "${service.name}"? This cannot be undone.`)) return;
    setError('');
    try {
      await deleteService(token, service.id);
      setServices((prev) => prev.filter((s) => s.id !== service.id));
      setTotal((t) => t - 1);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not delete service.');
    }
  };

  /** Flat row for <sky-data-table>; row index is used to map a click back to `services`. */
  const rows = useMemo(
    () =>
      JSON.stringify(
        services.map((service) => ({
          Name: service.name,
          Category: categoryName(service.categoryId),
          Subcategory: service.subcategoryId ? categoryName(service.subcategoryId) : '—',
          Duration: service.defaultDurationMinutes ? `${service.defaultDurationMinutes} min` : '—',
          Status: service.isActive ? 'Active' : 'Inactive',
        })),
      ),
    [services, categoryName],
  );

  const actions = useMemo(
    () =>
      JSON.stringify([
        ...(canEdit ? [{ icon: 'edit', label: 'Edit', event: 'edit' }] : []),
        ...(canEdit ? [{ icon: 'toggle_on', label: 'Activate / Deactivate', event: 'toggle-status' }] : []),
        ...(canDelete ? [{ icon: 'delete', label: 'Delete', event: 'delete', variant: 'danger' }] : []),
      ]),
    [canEdit, canDelete],
  );

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;

    const onParamsChange = (e: Event) => {
      const detail = (e as CustomEvent<SkyDataTableParamsDetail>).detail;
      setParams({ page: detail.page, pageSize: detail.pageSize, search: detail.search, filter: detail.filter });
    };
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; row: Record<string, unknown>; rowIndex: number }>).detail;
      const service = services[detail.rowIndex];
      if (!service) return;
      if (detail.action === 'edit') {
        setEditingService(service);
        editDialogRef.current?.show();
      } else if (detail.action === 'toggle-status') {
        toggleStatus(service);
      } else if (detail.action === 'delete') {
        remove(service);
      }
    };

    el.addEventListener('sky-dt-params-change', onParamsChange);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParamsChange);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services]);

  return (
    <div className="admin-page admin-page--wide">
      <title>Services · MSD</title>
      <header className="page-head">
        <div>
          <h1>Services</h1>
          <p>Marketplace service catalog.</p>
        </div>
        <div className="page-head__actions">
          {canCreate && categories.length > 0 && (
            <OutlinedButton onClick={() => addDialogRef.current?.show()}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              Add service
            </OutlinedButton>
          )}
        </div>
      </header>

      {message && <p className="field-hint" role="status">{message}</p>}
      {error && <p className="error-state" role="alert">{error}</p>}

      <sky-data-table
        ref={tableRef as RefObject<HTMLElement>}
        caption="Services"
        columns={SERVICE_COLUMNS}
        rows={rows}
        total={total}
        page={params.page}
        page-size={params.pageSize}
        loading={loading}
        searchable
        search-placeholder="Search by name or slug…"
        filter-label="Status"
        filter-options={SERVICE_FILTERS}
        actions={actions}
      />

      {canCreate && categories.length > 0 && (
        <ServiceFormDialog dialogRef={addDialogRef} categories={categories} onSave={(input) => save(input)} />
      )}

      {canEdit && (
        <ServiceFormDialog
          key={editingService?.id ?? 'edit-empty'}
          dialogRef={editDialogRef}
          categories={categories}
          service={editingService ?? undefined}
          onSave={(input) => save(input, editingService ?? undefined)}
          onClose={() => setEditingService(null)}
        />
      )}
    </div>
  );
}

const EMPTY_INPUT: ServiceInput = { name: '', slug: '', categoryId: '' };

function ServiceFormDialog({
  dialogRef,
  categories,
  service,
  onSave,
  onClose,
}: {
  dialogRef: RefObject<MdDialog>;
  categories: Category[];
  service?: Service;
  onSave: (input: ServiceInput) => Promise<void>;
  onClose?: () => void;
}) {
  const [form, setForm] = useState<ServiceInput>(
    service
      ? {
          name: service.name,
          slug: service.slug,
          categoryId: service.categoryId,
          subcategoryId: service.subcategoryId ?? undefined,
          description: service.description ?? undefined,
          image: service.image ?? undefined,
          imageAlt: service.imageAlt ?? undefined,
          defaultDurationMinutes: service.defaultDurationMinutes ?? undefined,
        }
      : { ...EMPTY_INPUT, categoryId: categories.find((c) => !c.parentId)?.id ?? categories[0]?.id ?? '' },
  );
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const parentCategories = categories.filter((c) => !c.parentId);
  const subcategoryOptions = categories.filter((c) => c.parentId === form.categoryId);

  const set = <K extends keyof ServiceInput>(key: K, value: ServiceInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    if (!form.name.trim() || !form.slug.trim() || !form.categoryId) {
      setError('Name, slug, and category are required.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSave(form);
      dialogRef.current?.close();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog ref={dialogRef} onClose={onClose}>
      <div slot="headline">{service ? 'Edit service' : 'Add service'}</div>
      <div slot="content" className="form-grid">
        <OutlinedTextField label="Name" value={form.name} onInput={(e: Event) => set('name', (e.target as HTMLInputElement).value)} />
        <OutlinedTextField label="Slug" value={form.slug} onInput={(e: Event) => set('slug', (e.target as HTMLInputElement).value)} />

        <OutlinedSelect
          label="Category"
          value={form.categoryId}
          onChange={(e: Event) => { set('categoryId', (e.target as HTMLSelectElement).value); set('subcategoryId', undefined); }}
        >
          {parentCategories.map((c) => (
            <SelectOption key={c.id} value={c.id}>
              <div slot="headline">{c.name}</div>
            </SelectOption>
          ))}
        </OutlinedSelect>

        {subcategoryOptions.length > 0 && (
          <OutlinedSelect
            label="Subcategory (optional)"
            value={form.subcategoryId ?? ''}
            onChange={(e: Event) => set('subcategoryId', (e.target as HTMLSelectElement).value || undefined)}
          >
            <SelectOption value="">
              <div slot="headline">None</div>
            </SelectOption>
            {subcategoryOptions.map((c) => (
              <SelectOption key={c.id} value={c.id}>
                <div slot="headline">{c.name}</div>
              </SelectOption>
            ))}
          </OutlinedSelect>
        )}

        <OutlinedTextField
          label="Typical duration (minutes)"
          type="number"
          value={form.defaultDurationMinutes !== undefined ? String(form.defaultDurationMinutes) : ''}
          onInput={(e: Event) => set('defaultDurationMinutes', Number((e.target as HTMLInputElement).value) || undefined)}
        />

        <OutlinedTextField label="Description" value={form.description ?? ''} onInput={(e: Event) => set('description', (e.target as HTMLInputElement).value)} />
        <OutlinedTextField label="Image URL" value={form.image ?? ''} onInput={(e: Event) => set('image', (e.target as HTMLInputElement).value)} />
        <OutlinedTextField label="Image alt text" value={form.imageAlt ?? ''} onInput={(e: Event) => set('imageAlt', (e.target as HTMLInputElement).value)} />

        {error && <p className="error-state" role="alert">{error}</p>}
      </div>
      <div slot="actions">
        <TextButton onClick={() => dialogRef.current?.close()}>Cancel</TextButton>
        <FilledButton onClick={submit} disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</FilledButton>
      </div>
    </Dialog>
  );
}

export default ServiceManagement;
