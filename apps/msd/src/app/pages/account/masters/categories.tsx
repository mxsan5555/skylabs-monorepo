import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import type { MdFilledButton } from '@material/web/button/filled-button.js';
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
import { MediaUploader } from '../../../components/media-uploader';

interface CategoryManagementProps {
  /** 'top' → the Categories page (parentId: null rows); 'sub' → Sub Categories (parentId set,
   *  parent itself top-level); 'leaf' → Category Types (parentId set, and that parent's own
   *  parentId is set too — the 3rd, Type tier, e.g. "Swedish Massage" under "Body Massage" under
   *  "Massage"). NAMING NOTE: this "Type" tier is unrelated to the `Category.type` enum
   *  (SERVICE/PRODUCT/THERAPY, business-module classification, top-level-only) — see
   *  msd-api's `category.service.ts` module doc comment. */
  scope: 'top' | 'sub' | 'leaf';
}

const STATUS_COLUMN = { key: 'Status', label: 'Status', type: 'status', statusMap: { Active: 'success', Inactive: 'error' } };

const TOP_COLUMNS = JSON.stringify([
  { key: 'Name', label: 'Name' },
  { key: 'Slug', label: 'Slug' },
  { key: 'Type', label: 'Type' },
  { key: 'Popular', label: 'Popular' },
  { key: 'Sort Order', label: 'Sort Order' },
  { key: 'Sub-categories', label: 'Sub-categories' },
  STATUS_COLUMN,
]);

const CATEGORY_TYPE_OPTIONS: { value: 'SERVICE' | 'PRODUCT' | 'THERAPY'; label: string }[] = [
  { value: 'SERVICE', label: 'Service' },
  { value: 'PRODUCT', label: 'Product' },
  { value: 'THERAPY', label: 'Therapy' },
];

const SUB_COLUMNS = JSON.stringify([
  { key: 'Name', label: 'Name' },
  { key: 'Slug', label: 'Slug' },
  { key: 'Parent Category', label: 'Parent Category' },
  { key: 'Sort Order', label: 'Sort Order' },
  STATUS_COLUMN,
]);

// Reuses the same `Parent Category` row field as SUB_COLUMNS (it's already `category.parent?.name`
// — for a Type-tier row that immediate parent IS the Subcategory), just relabeled for this tier.
const LEAF_COLUMNS = JSON.stringify([
  { key: 'Name', label: 'Name' },
  { key: 'Slug', label: 'Slug' },
  { key: 'Parent Category', label: 'Subcategory' },
  { key: 'Sort Order', label: 'Sort Order' },
  STATUS_COLUMN,
]);

const TITLES: Record<CategoryManagementProps['scope'], string> = {
  top: 'Categories',
  sub: 'Sub Categories',
  leaf: 'Category Types',
};

const DESCRIPTIONS: Record<CategoryManagementProps['scope'], string> = {
  top: 'Top-level marketplace categories.',
  sub: 'Subcategories, grouped under a parent category.',
  leaf: 'Types, grouped under a parent subcategory (e.g. "Swedish Massage" under "Body Massage").',
};

const ADD_LABELS: Record<CategoryManagementProps['scope'], string> = {
  top: 'Add category',
  sub: 'Add subcategory',
  leaf: 'Add type',
};

interface TableParams {
  page: number;
  pageSize: number;
  search: string;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 10, search: '' };

/**
 * Categories, Sub Categories, AND Category Types share this one component/page — same underlying
 * Category table (a row with a parentId IS a subcategory or a Type, depending on depth), just a
 * different `scope` filter and, for `scope="sub"`/`scope="leaf"`, a parent selector in the
 * Add/Edit dialog (a single "Parent category" dropdown for `sub`; a 2-step Category→Subcategory
 * cascade for `leaf`, since a Type row's `parentId` must point at a Subcategory, not a top-level
 * row). Standardized onto the same <sky-data-table> used by Orders/Services/Products.
 * The Category list endpoint has no server-side active/inactive filter (unlike Services/
 * Products), so no status filter is wired here — only search + pagination.
 */
export function CategoryManagement({ scope }: CategoryManagementProps) {
  const { token, can } = useAuth();
  const canCreate = can('masters.categories', 'create');
  const canEdit = can('masters.categories', 'edit');
  const canDelete = can('masters.categories', 'delete');

  const [categories, setCategories] = useState<Category[]>([]);
  // scope='sub': top-level categories only, for the single "Parent category" picker.
  // scope='leaf': top-level categories (1st picker) + ALL subcategories in the system (2nd
  // picker, filtered client-side by the chosen top-level id) — see `loadParentOptions` below.
  const [parentOptions, setParentOptions] = useState<Category[]>([]);
  const [subOptions, setSubOptions] = useState<Category[]>([]);
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

  const title = TITLES[scope];

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

  // Sub Categories needs the top-level list to populate its single "Parent category" selector;
  // Category Types needs both the top-level list AND every subcategory (to drive the 2-step
  // Category → Subcategory cascade — a Type row's `parentId` must be a Subcategory id).
  const loadParentOptions = useCallback(() => {
    if (scope === 'top') return;
    setParentOptionsLoading(true);
    setParentOptionsError('');
    // pageSize is capped at 100 server-side (PaginationQuerySchema) — 200 here 500s.
    const loadTop = listCategories(token, { scope: 'top', pageSize: 100 });
    const loadSub = scope === 'leaf' ? listCategories(token, { scope: 'sub', pageSize: 100 }) : Promise.resolve({ data: [] as Category[] });
    Promise.all([loadTop, loadSub])
      .then(([top, sub]) => {
        setParentOptions(top.data);
        setSubOptions(sub.data);
      })
      .catch((err) => {
        setParentOptions([]);
        setSubOptions([]);
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
      setMessage('Saved.');
      return data;
    }
    const { data } = await createCategory(token, input);
    setCategories((prev) => [...prev, data]);
    setTotal((t) => t + 1);
    setMessage('Saved.');
    return data;
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
          Type: category.type ?? '—',
          Popular: category.parentId ? '—' : category.isPopular ? 'Yes' : 'No',
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

  const columns = scope === 'top' ? TOP_COLUMNS : scope === 'sub' ? SUB_COLUMNS : LEAF_COLUMNS;

  return (
    <div className="admin-page admin-page--wide">
      <title>{title} · MSD</title>
      <header className="page-head">
        <div>
          <h1>{title}</h1>
          <p>{DESCRIPTIONS[scope]}</p>
        </div>
        <div className="page-head__actions">
          {canCreate && (
            <OutlinedButton onClick={() => addDialogRef.current?.show()}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              {ADD_LABELS[scope]}
            </OutlinedButton>
          )}
        </div>
      </header>

      {message && <p className="field-hint" role="status">{message}</p>}
      {error && <p className="error-state" role="alert">{error}</p>}

      <sky-data-table
        ref={tableRef as RefObject<HTMLElement>}
        caption={title}
        columns={columns}
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
          subOptions={subOptions}
          parentOptionsLoading={parentOptionsLoading}
          parentOptionsError={parentOptionsError}
          onRetryParentOptions={loadParentOptions}
          dialogRef={addDialogRef}
          token={token}
          onSave={(input) => save(input)}
        />
      )}

      {canEdit && (
        <CategoryFormDialog
          key={editingCategory?.id ?? 'edit-empty'}
          scope={scope}
          parentOptions={parentOptions}
          subOptions={subOptions}
          parentOptionsLoading={parentOptionsLoading}
          parentOptionsError={parentOptionsError}
          onRetryParentOptions={loadParentOptions}
          dialogRef={editDialogRef}
          category={editingCategory ?? undefined}
          token={token}
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
  subOptions,
  parentOptionsLoading,
  parentOptionsError,
  onRetryParentOptions,
  dialogRef,
  category,
  token,
  onSave,
  onClose,
}: {
  scope: 'top' | 'sub' | 'leaf';
  /** Top-level categories — the "Parent category" options for `scope="sub"`, and the 1st-tier
   *  picker's options for `scope="leaf"`. */
  parentOptions: Category[];
  /** Every subcategory in the system (`scope="leaf"` only) — filtered client-side by the chosen
   *  top-level id to drive the 2nd-tier "Subcategory" picker, whose value becomes the new Type
   *  row's actual `parentId`. */
  subOptions: Category[];
  parentOptionsLoading: boolean;
  parentOptionsError: string;
  onRetryParentOptions: () => void;
  dialogRef: RefObject<MdDialog>;
  category?: Category;
  token: string | null;
  onSave: (input: CategoryInput) => Promise<Category | void>;
  onClose?: () => void;
}) {
  // scope='leaf' only — the 1st-tier ("Category") picker's UI-only selection; never submitted
  // directly, it just narrows `subOptions` down to the 2nd tier. Editing an existing Type row
  // derives it from the row's own parent (a Subcategory)'s `parentId`. Lazy initializer so this
  // only runs once per mount (the Edit dialog remounts fresh per row via its `key`, same as the
  // rest of this dialog's per-row state).
  const [topCategoryId, setTopCategoryId] = useState<string | undefined>(() => {
    if (scope !== 'leaf' || !category?.parentId) return undefined;
    return subOptions.find((s) => s.id === category.parentId)?.parentId ?? undefined;
  });

  const [form, setForm] = useState<CategoryInput>({
    name: category?.name ?? '',
    slug: category?.slug ?? '',
    description: category?.description ?? '',
    parentId: category?.parentId ?? (scope === 'sub' ? parentOptions[0]?.id : undefined),
    sortOrder: category?.sortOrder ?? 0,
    type: category?.type ?? 'SERVICE',
    isPopular: category?.isPopular ?? false,
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Checked/set synchronously at the very top of submit(), before any await — a `submitting`
  // state guard alone can't stop a second click/tap/Enter that fires before React commits the
  // disabling re-render (same double-submit gap fixed elsewhere in this file family).
  const submittingRef = useRef(false);
  const saveButtonRef = useRef<MdFilledButton>(null);
  // Tracks the entity MediaUploader should upload against — starts as the row being edited
  // (already has an id), or undefined for a fresh create; set to the server's response the
  // moment `onSave` resolves, so a brand-new category's id becomes available to MediaUploader
  // within the same dialog session (same pattern as ProductFormDialog/DealDialog/
  // TherapistFormDialog's identical `savedX` state).
  const [savedCategory, setSavedCategory] = useState<Category | undefined>(category);

  // The Add dialog is a single long-lived instance (no `key`, unlike the Edit dialog above,
  // which remounts per row) — its `form`/`topCategoryId` useState initializers only ever run
  // once, against whatever `parentOptions`/`subOptions` happened to be at that first mount
  // (usually still `[]`, since they load asynchronously). Without this, "Add subcategory"/
  // "Add type" permanently shows nothing selected even after categories finish loading. Only
  // applies in Add mode, and only until the user has picked something themselves.
  useEffect(() => {
    if (category) return;
    if (scope === 'sub' && !form.parentId && parentOptions.length > 0) {
      setForm((f) => ({ ...f, parentId: parentOptions[0].id }));
    }
    if (scope === 'leaf' && !topCategoryId && parentOptions.length > 0) {
      setTopCategoryId(parentOptions[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentOptions, scope, category]);

  // Once a 1st-tier Category is selected (Add mode only), default the 2nd-tier "Subcategory"
  // picker to its first available option — same async-load timing rationale as above, one tier
  // down. Also re-runs whenever `topCategoryId` changes so switching the top selection clears a
  // now-stale subcategory pick.
  useEffect(() => {
    if (category || scope !== 'leaf' || !topCategoryId) return;
    if (form.parentId && subOptions.some((s) => s.id === form.parentId && s.parentId === topCategoryId)) return;
    const firstMatch = subOptions.find((s) => s.parentId === topCategoryId);
    setForm((f) => ({ ...f, parentId: firstMatch?.id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topCategoryId, subOptions, scope, category]);

  const subcategoryChoices = subOptions.filter((s) => s.parentId === topCategoryId);

  const submit = async () => {
    if (submittingRef.current) return;
    if (!form.name.trim() || !form.slug.trim()) {
      setError('Name and slug are required.');
      return;
    }
    if (scope === 'sub' && !form.parentId) {
      setError('Select a parent category.');
      return;
    }
    if (scope === 'leaf' && (!topCategoryId || !form.parentId)) {
      setError('Select a category and a subcategory.');
      return;
    }
    if (scope === 'top' && !form.type) {
      setError('Select a type.');
      return;
    }
    submittingRef.current = true;
    if (saveButtonRef.current) saveButtonRef.current.disabled = true;
    setSubmitting(true);
    setError('');
    // `type`/`isPopular` only ever apply to a top-level row — a subcategory/Type row inherits its
    // top-level ancestor's type by join and never carries its own (see msd-api's
    // category.schema.ts doc comment), so both are omitted from a non-top payload.
    const payload: CategoryInput = scope === 'top' ? form : { ...form, type: undefined, isPopular: undefined };
    try {
      const result = await onSave(payload);
      if (!category && result) {
        // A fresh create — keep the dialog open so MediaUploader can flush any staged photos
        // against the new id; an edit's dialog closes immediately as before.
        setSavedCategory(result);
      } else {
        dialogRef.current?.close();
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save.');
    } finally {
      submittingRef.current = false;
      if (saveButtonRef.current) saveButtonRef.current.disabled = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog ref={dialogRef} onClose={onClose}>
      <div slot="headline">{category ? 'Edit' : ADD_LABELS[scope]}</div>
      <div slot="content" className="form-grid">
        {scope !== 'top' && parentOptionsLoading && <p className="loading-state">Loading categories…</p>}
        {scope !== 'top' && !parentOptionsLoading && parentOptionsError && (
          <p className="error-state" role="alert">
            {parentOptionsError} <TextButton onClick={onRetryParentOptions}>Retry</TextButton>
          </p>
        )}
        {scope !== 'top' && !parentOptionsLoading && !parentOptionsError && parentOptions.length === 0 && (
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

        {scope === 'leaf' && !parentOptionsLoading && !parentOptionsError && parentOptions.length > 0 && (
          <>
            <OutlinedSelect
              label="Category"
              value={topCategoryId ?? ''}
              onChange={(e: Event) => {
                const value = (e.target as HTMLSelectElement).value;
                setTopCategoryId(value);
                setForm((f) => ({ ...f, parentId: undefined }));
              }}
            >
              {parentOptions.map((p) => (
                <SelectOption key={p.id} value={p.id}>
                  <div slot="headline">{p.name}</div>
                </SelectOption>
              ))}
            </OutlinedSelect>

            {subcategoryChoices.length > 0 ? (
              <OutlinedSelect
                label="Subcategory"
                value={form.parentId ?? ''}
                onChange={(e: Event) => setForm((f) => ({ ...f, parentId: (e.target as HTMLSelectElement).value }))}
              >
                {subcategoryChoices.map((s) => (
                  <SelectOption key={s.id} value={s.id}>
                    <div slot="headline">{s.name}</div>
                  </SelectOption>
                ))}
              </OutlinedSelect>
            ) : (
              topCategoryId && (
                <p className="empty-state">
                  This category has no subcategories yet — add one under Sub Categories first.
                </p>
              )
            )}
          </>
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

        {scope === 'top' ? (
          <>
            <OutlinedSelect
              label="Type"
              value={form.type ?? 'SERVICE'}
              onChange={(e: Event) => setForm((f) => ({ ...f, type: (e.target as HTMLSelectElement).value as CategoryInput['type'] }))}
            >
              {CATEGORY_TYPE_OPTIONS.map((opt) => (
                <SelectOption key={opt.value} value={opt.value}>
                  <div slot="headline">{opt.label}</div>
                </SelectOption>
              ))}
            </OutlinedSelect>

            <label className="widget-assign-row__label">
              <input
                type="checkbox"
                checked={form.isPopular ?? false}
                onChange={(e) => setForm((f) => ({ ...f, isPopular: e.target.checked }))}
              />
              Popular (shown in homepage carousels)
            </label>
          </>
        ) : (
          <p className="field-hint">Type is inherited from the parent category.</p>
        )}

        <MediaUploader
          entityType="category"
          entityId={savedCategory?.id ?? null}
          existingImages={savedCategory?.mediaImages ?? []}
          existingVideo={null}
          hideVideo
          token={token}
        />

        {error && <p className="error-state" role="alert">{error}</p>}
      </div>
      <div slot="actions">
        <TextButton onClick={() => dialogRef.current?.close()}>Cancel</TextButton>
        <FilledButton ref={saveButtonRef} onClick={submit} disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</FilledButton>
      </div>
    </Dialog>
  );
}

export default CategoryManagement;
