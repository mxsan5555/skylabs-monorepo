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
  createCategory,
  deleteCategory,
  listCategories,
  setCategoryStatus,
  updateCategory,
  type Category,
  type CategoryInput,
} from '../../../../api/rbac/categories';
import { ApiRequestError } from '../../../../api/rbac/client';

interface CategoryManagementProps {
  /** 'top' → the Categories page (parentId: null rows); 'sub' → Sub Categories (parentId: set). */
  scope: 'top' | 'sub';
}

const STATUS_COLUMN = { key: 'Status', label: 'Status', type: 'status', statusMap: { Active: 'success', Inactive: 'error' } };

const TOP_COLUMNS = JSON.stringify([
  { key: 'Name', label: 'Name' },
  { key: 'Slug', label: 'Slug' },
  { key: 'Sort Order', label: 'Sort Order' },
  { key: 'Sub-categories', label: 'Sub-categories' },
  STATUS_COLUMN,
]);

const SUB_COLUMNS = JSON.stringify([
  { key: 'Name', label: 'Name' },
  { key: 'Slug', label: 'Slug' },
  { key: 'Parent Category', label: 'Parent Category' },
  { key: 'Sort Order', label: 'Sort Order' },
  STATUS_COLUMN,
]);

interface TableParams {
  page: number;
  pageSize: number;
  search: string;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 10, search: '' };

/**
 * Categories AND Sub Categories share this one component/page — same underlying Category
 * table (a row with a parentId IS a subcategory), just a different `scope` filter and,
 * for `scope="sub"`, a Parent Category selector in the Add/Edit dialog. Standardized onto the
 * same <sky-data-table> used by Orders/Bookings/Services/Products. The Category list endpoint
 * has no server-side active/inactive filter (unlike Services/Products), so no status filter is
 * wired here — only search + pagination.
 */
export function CategoryManagement({ scope }: CategoryManagementProps) {
  const { token, can } = useAuth();
  const canCreate = can('masters.categories', 'create');
  const canEdit = can('masters.categories', 'edit');
  const canDelete = can('masters.categories', 'delete');

  const [categories, setCategories] = useState<Category[]>([]);
  const [parentOptions, setParentOptions] = useState<Category[]>([]);
  const [parentOptionsLoading, setParentOptionsLoading] = useState(false);
  const [parentOptionsError, setParentOptionsError] = useState('');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useState<TableParams>(DEFAULT_PARAMS);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const addDialogRef = useRef<MdDialog>(null);
  const editDialogRef = useRef<MdDialog>(null);
  const tableRef = useRef<HTMLElement>(null);

  const title = scope === 'top' ? 'Categories' : 'Sub Categories';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listCategories(token, {
        scope,
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
      });
      setCategories(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : `Could not load ${title.toLowerCase()}.`);
    } finally {
      setLoading(false);
    }
  }, [token, scope, params, title]);

  useEffect(() => {
    load();
  }, [load]);

  // Sub Categories needs the top-level list too, to populate the Parent Category selector.
  const loadParentOptions = useCallback(() => {
    if (scope !== 'sub') return;
    setParentOptionsLoading(true);
    setParentOptionsError('');
    // pageSize is capped at 100 server-side (PaginationQuerySchema) — 200 here 500s.
    listCategories(token, { scope: 'top', pageSize: 100 })
      .then(({ data }) => setParentOptions(data))
      .catch((err) => {
        setParentOptions([]);
        setParentOptionsError(err instanceof ApiRequestError ? err.message : 'Unable to load categories.');
      })
      .finally(() => setParentOptionsLoading(false));
  }, [token, scope]);

  useEffect(() => {
    loadParentOptions();
  }, [loadParentOptions]);

  const save = async (input: CategoryInput, existing?: Category) => {
    if (existing) {
      const { data } = await updateCategory(token, existing.id, input);
      setCategories((prev) => prev.map((c) => (c.id === data.id ? data : c)));
    } else {
      const { data } = await createCategory(token, input);
      setCategories((prev) => [...prev, data]);
      setTotal((t) => t + 1);
    }
    setMessage('Saved.');
  };

  const toggleStatus = async (category: Category) => {
    setError('');
    try {
      const { data } = await setCategoryStatus(token, category.id, !category.isActive);
      setCategories((prev) => prev.map((c) => (c.id === data.id ? data : c)));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change status.');
    }
  };

  // Known pre-existing backend gap (out of scope for this UI-only change): the delete guard
  // checks child categories, Deals, and Services but not Products, so deleting a category still
  // referenced by a Product can fall through to a raw FK-constraint error. This catch's fallback
  // message is unchanged from before and applies uniformly to any delete failure.
  const remove = async (category: Category) => {
    if (!window.confirm(`Delete "${category.name}"? This cannot be undone.`)) return;
    setError('');
    try {
      await deleteCategory(token, category.id);
      setCategories((prev) => prev.filter((c) => c.id !== category.id));
      setTotal((t) => t - 1);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not delete — it may still have subcategories or deals attached.');
    }
  };

  /** Flat row for <sky-data-table>; row index is used to map a click back to `categories`. */
  const rows = useMemo(
    () =>
      JSON.stringify(
        categories.map((category) => ({
          Name: category.name,
          Slug: category.slug,
          'Sort Order': category.sortOrder,
          'Sub-categories': category._count?.children ?? 0,
          'Parent Category': category.parent?.name ?? '—',
          Status: category.isActive ? 'Active' : 'Inactive',
        })),
      ),
    [categories],
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
      setParams({ page: detail.page, pageSize: detail.pageSize, search: detail.search });
    };
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; row: Record<string, unknown>; rowIndex: number }>).detail;
      const category = categories[detail.rowIndex];
      if (!category) return;
      if (detail.action === 'edit') {
        setEditingCategory(category);
        editDialogRef.current?.show();
      } else if (detail.action === 'toggle-status') {
        toggleStatus(category);
      } else if (detail.action === 'delete') {
        remove(category);
      }
    };

    el.addEventListener('sky-dt-params-change', onParamsChange);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParamsChange);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  return (
    <div className="admin-page admin-page--wide">
      <title>{title} · MSD</title>
      <header className="page-head">
        <div>
          <h1>{title}</h1>
          <p>{scope === 'top' ? 'Top-level marketplace categories.' : 'Subcategories, grouped under a parent category.'}</p>
        </div>
        <div className="page-head__actions">
          {canCreate && (
            <OutlinedButton onClick={() => addDialogRef.current?.show()}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              {scope === 'top' ? 'Add category' : 'Add subcategory'}
            </OutlinedButton>
          )}
        </div>
      </header>

      {message && <p className="field-hint" role="status">{message}</p>}
      {error && <p className="error-state" role="alert">{error}</p>}

      <sky-data-table
        ref={tableRef as RefObject<HTMLElement>}
        caption={title}
        columns={scope === 'top' ? TOP_COLUMNS : SUB_COLUMNS}
        rows={rows}
        total={total}
        page={params.page}
        page-size={params.pageSize}
        loading={loading}
        searchable
        search-placeholder="Search by name or slug…"
        actions={actions}
      />

      {canCreate && (
        <CategoryFormDialog
          scope={scope}
          parentOptions={parentOptions}
          parentOptionsLoading={parentOptionsLoading}
          parentOptionsError={parentOptionsError}
          onRetryParentOptions={loadParentOptions}
          dialogRef={addDialogRef}
          onSave={(input) => save(input)}
        />
      )}

      {canEdit && (
        <CategoryFormDialog
          key={editingCategory?.id ?? 'edit-empty'}
          scope={scope}
          parentOptions={parentOptions}
          parentOptionsLoading={parentOptionsLoading}
          parentOptionsError={parentOptionsError}
          onRetryParentOptions={loadParentOptions}
          dialogRef={editDialogRef}
          category={editingCategory ?? undefined}
          onSave={(input) => save(input, editingCategory ?? undefined)}
          onClose={() => setEditingCategory(null)}
        />
      )}
    </div>
  );
}

function CategoryFormDialog({
  scope,
  parentOptions,
  parentOptionsLoading,
  parentOptionsError,
  onRetryParentOptions,
  dialogRef,
  category,
  onSave,
  onClose,
}: {
  scope: 'top' | 'sub';
  parentOptions: Category[];
  parentOptionsLoading: boolean;
  parentOptionsError: string;
  onRetryParentOptions: () => void;
  dialogRef: RefObject<MdDialog>;
  category?: Category;
  onSave: (input: CategoryInput) => Promise<void>;
  onClose?: () => void;
}) {
  const [form, setForm] = useState<CategoryInput>({
    name: category?.name ?? '',
    slug: category?.slug ?? '',
    description: category?.description ?? '',
    parentId: category?.parentId ?? (scope === 'sub' ? parentOptions[0]?.id : undefined),
    sortOrder: category?.sortOrder ?? 0,
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!form.name.trim() || !form.slug.trim()) {
      setError('Name and slug are required.');
      return;
    }
    if (scope === 'sub' && !form.parentId) {
      setError('Select a parent category.');
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
      <div slot="headline">{category ? 'Edit' : scope === 'top' ? 'Add category' : 'Add subcategory'}</div>
      <div slot="content" className="form-grid">
         {scope === 'sub' && parentOptionsLoading && <p className="loading-state">Loading categories…</p>}
        {scope === 'sub' && !parentOptionsLoading && parentOptionsError && (
          <p className="error-state" role="alert">
            {parentOptionsError} <TextButton onClick={onRetryParentOptions}>Retry</TextButton>
          </p>
        )}
        {scope === 'sub' && !parentOptionsLoading && !parentOptionsError && parentOptions.length === 0 && (
          <p className="empty-state">No categories available</p>
        )}
        {scope === 'sub' && !parentOptionsLoading && !parentOptionsError && parentOptions.length > 0 && (
          <OutlinedSelect
            label="Parent category"
            value={form.parentId ?? ''}
            onChange={(e: Event) => setForm((f) => ({ ...f, parentId: (e.target as HTMLSelectElement).value }))}
          >
            {parentOptions.map((p) => (
              <SelectOption key={p.id} value={p.id}>
                <div slot="headline">{p.name}</div>
              </SelectOption>
            ))}
          </OutlinedSelect>
        )}
        <OutlinedTextField label="Name" value={form.name} onInput={(e: Event) => setForm((f) => ({ ...f, name: (e.target as HTMLInputElement).value }))} />
        <OutlinedTextField label="Slug" value={form.slug} onInput={(e: Event) => setForm((f) => ({ ...f, slug: (e.target as HTMLInputElement).value }))} />
        <OutlinedTextField label="Description" value={form.description ?? ''} onInput={(e: Event) => setForm((f) => ({ ...f, description: (e.target as HTMLInputElement).value }))} />
       
        <OutlinedTextField
          label="Sort order"
          type="number"
          value={String(form.sortOrder ?? 0)}
          onInput={(e: Event) => setForm((f) => ({ ...f, sortOrder: Number((e.target as HTMLInputElement).value) || 0 }))}
        />
        {error && <p className="error-state" role="alert">{error}</p>}
      </div>
      <div slot="actions">
        <TextButton onClick={() => dialogRef.current?.close()}>Cancel</TextButton>
        <FilledButton onClick={submit} disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</FilledButton>
      </div>
    </Dialog>
  );
}

export default CategoryManagement;
