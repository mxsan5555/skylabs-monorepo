import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import {
  Dialog,
  FilledButton,
  OutlinedButton,
  OutlinedTextField,
  TextButton,
  Icon,
  Tabs,
  PrimaryTab,
} from '@skylabs-monorepo/shared-ui/react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  createPopularTag,
  deletePopularTag,
  listPopularTags,
  listPopularTagMappings,
  mapPopularTag,
  setPopularTagStatus,
  unmapPopularTag,
  updatePopularTag,
  type PopularTag,
  type PopularTagInput,
  type PopularTagMappings,
  type PopularTagTargetType,
} from '../../../../api/rbac/popular-tags';
import { listCategories, type Category } from '../../../../api/rbac/categories';
import { listAllDeals, listAllTherapists, type Deal, type CrossVendorTherapist } from '../../../../api/rbac/vendors';
import { listProducts, type Product } from '../../../../api/rbac/products';
import { ApiRequestError } from '../../../../api/rbac/client';

const COLUMNS = JSON.stringify([
  { key: 'Name', label: 'Name' },
  { key: 'Slug', label: 'Slug' },
  { key: 'Mapped', label: 'Mapped Items' },
  { key: 'Status', label: 'Status', type: 'status', statusMap: { Active: 'success', Inactive: 'error' } },
]);

function toRow(tag: PopularTag): Record<string, string | number> {
  const mapped = (tag._count?.categories ?? 0) + (tag._count?.deals ?? 0) + (tag._count?.products ?? 0) + (tag._count?.therapists ?? 0);
  return {
    Name: tag.name,
    Slug: tag.slug,
    Mapped: mapped,
    Status: tag.isActive ? 'Active' : 'Inactive',
  };
}

interface TableParams {
  page: number;
  pageSize: number;
  search: string;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 10, search: '' };

/**
 * Popular Tag management — Superadmin creates/edits dynamic marketing labels ("Trending",
 * "Best Seller", ...) and maps them onto Category/Deal/Product/Therapist rows. Mirrors
 * `categories.tsx`'s exact list/create/edit/status-toggle `<sky-data-table>` pattern. Gated on
 * the same `masters.tags` permission the "Marketing Tags" sidebar item already seeds/grants —
 * no new permission plumbing needed. Deactivating a tag never touches its mappings (see
 * `PopularTag`'s schema doc comment) — reactivating instantly restores them.
 */
export function PopularTagManagement() {
  const { token, can } = useAuth();
  const canCreate = can('masters.tags', 'create');
  const canEdit = can('masters.tags', 'edit');
  const canDelete = can('masters.tags', 'delete');

  const [tags, setTags] = useState<PopularTag[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useState<TableParams>(DEFAULT_PARAMS);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [editingTag, setEditingTag] = useState<PopularTag | null>(null);
  const [mappingTag, setMappingTag] = useState<PopularTag | null>(null);
  const addDialogRef = useRef<MdDialog>(null);
  const editDialogRef = useRef<MdDialog>(null);
  const mappingDialogRef = useRef<MdDialog>(null);
  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listPopularTags(token, {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
      });
      setTags(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load popular tags.');
    } finally {
      setLoading(false);
    }
  }, [token, params]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (input: PopularTagInput, existing?: PopularTag) => {
    if (existing) {
      const { data } = await updatePopularTag(token, existing.id, input);
      setTags((prev) => prev.map((t) => (t.id === data.id ? { ...t, ...data } : t)));
      setMessage('Saved.');
      return data;
    }
    const { data } = await createPopularTag(token, input);
    setTags((prev) => [...prev, data]);
    setTotal((t) => t + 1);
    setMessage('Saved.');
    return data;
  };

  const toggleStatus = async (tag: PopularTag) => {
    setError('');
    try {
      const { data } = await setPopularTagStatus(token, tag.id, !tag.isActive);
      setTags((prev) => prev.map((t) => (t.id === data.id ? { ...t, ...data } : t)));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change status.');
    }
  };

  const remove = async (tag: PopularTag) => {
    if (!window.confirm(`Delete "${tag.name}"? This cannot be undone.`)) return;
    setError('');
    try {
      await deletePopularTag(token, tag.id);
      setTags((prev) => prev.filter((t) => t.id !== tag.id));
      setTotal((t) => t - 1);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not delete — unmap it from every item first.');
    }
  };

  const rows = useMemo(() => JSON.stringify(tags.map(toRow)), [tags]);

  const actions = useMemo(
    () =>
      JSON.stringify([
        ...(canEdit ? [{ icon: 'edit', label: 'Edit', event: 'edit' }] : []),
        ...(canEdit ? [{ icon: 'link', label: 'Manage Mappings', event: 'mappings' }] : []),
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
      const detail = (e as CustomEvent<{ action: string; rowIndex: number }>).detail;
      const tag = tags[detail.rowIndex];
      if (!tag) return;
      if (detail.action === 'edit') {
        setEditingTag(tag);
        editDialogRef.current?.show();
      } else if (detail.action === 'mappings') {
        setMappingTag(tag);
        mappingDialogRef.current?.show();
      } else if (detail.action === 'toggle-status') {
        toggleStatus(tag);
      } else if (detail.action === 'delete') {
        remove(tag);
      }
    };

    el.addEventListener('sky-dt-params-change', onParamsChange);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParamsChange);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tags]);

  return (
    <div className="admin-page admin-page--wide">
      <title>Marketing Tags · MSD</title>
      <header className="page-head">
        <div>
          <h1>Marketing Tags</h1>
          <p>Dynamic Popular Tags — create, activate/deactivate, and map onto categories, deals, products, and therapists.</p>
        </div>
        <div className="page-head__actions">
          {canCreate && (
            <OutlinedButton onClick={() => addDialogRef.current?.show()}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              Add tag
            </OutlinedButton>
          )}
        </div>
      </header>

      {message && <p className="field-hint" role="status">{message}</p>}
      {error && <p className="error-state" role="alert">{error}</p>}

      <sky-data-table
        ref={tableRef as RefObject<HTMLElement>}
        caption="Marketing Tags"
        columns={COLUMNS}
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
        <TagFormDialog dialogRef={addDialogRef} onSave={(input) => save(input)} />
      )}

      {canEdit && (
        <TagFormDialog
          key={editingTag?.id ?? 'edit-empty'}
          dialogRef={editDialogRef}
          tag={editingTag ?? undefined}
          onSave={(input) => save(input, editingTag ?? undefined)}
          onClose={() => setEditingTag(null)}
        />
      )}

      {canEdit && (
        <MappingDialog
          key={mappingTag?.id ?? 'mappings-empty'}
          dialogRef={mappingDialogRef}
          tag={mappingTag}
          token={token}
          onMappingsChanged={() => load()}
          onClose={() => setMappingTag(null)}
        />
      )}
    </div>
  );
}

function TagFormDialog({
  dialogRef,
  tag,
  onSave,
  onClose,
}: {
  dialogRef: RefObject<MdDialog>;
  tag?: PopularTag;
  onSave: (input: PopularTagInput) => Promise<PopularTag | void>;
  onClose?: () => void;
}) {
  const [form, setForm] = useState<PopularTagInput>({ name: tag?.name ?? '', slug: tag?.slug ?? '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const submit = async () => {
    if (submittingRef.current) return;
    if (!form.name.trim() || !form.slug.trim()) {
      setError('Name and slug are required.');
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      await onSave(form);
      dialogRef.current?.close();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog ref={dialogRef} onClose={onClose}>
      <div slot="headline">{tag ? 'Edit tag' : 'Add tag'}</div>
      <div slot="content" className="form-grid">
        <OutlinedTextField label="Name" value={form.name} onInput={(e: Event) => setForm((f) => ({ ...f, name: (e.target as HTMLInputElement).value }))} />
        <OutlinedTextField label="Slug" value={form.slug} onInput={(e: Event) => setForm((f) => ({ ...f, slug: (e.target as HTMLInputElement).value }))} />
        {error && <p className="error-state" role="alert">{error}</p>}
      </div>
      <div slot="actions">
        <TextButton onClick={() => dialogRef.current?.close()}>Cancel</TextButton>
        <FilledButton onClick={submit} disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</FilledButton>
      </div>
    </Dialog>
  );
}

const TARGET_TABS: { key: PopularTagTargetType; label: string }[] = [
  { key: 'category', label: 'Category' },
  { key: 'deal', label: 'Deal' },
  { key: 'product', label: 'Product' },
  { key: 'therapist', label: 'Therapist' },
];

/** One row's worth of what the mapping picker needs, regardless of which entity it came from. */
interface PickerItem {
  id: string;
  label: string;
}

function MappingDialog({
  dialogRef,
  tag,
  token,
  onMappingsChanged,
  onClose,
}: {
  dialogRef: RefObject<MdDialog>;
  tag: PopularTag | null;
  token: string | null;
  onMappingsChanged: () => void;
  onClose?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<PopularTagTargetType>('category');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<PickerItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [mappings, setMappings] = useState<PopularTagMappings | null>(null);
  const [error, setError] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!tag) return;
    listPopularTagMappings(token, tag.id)
      .then(({ data }) => setMappings(data))
      .catch(() => setMappings({ categories: [], deals: [], products: [], therapists: [] }));
  }, [tag, token]);

  useEffect(() => {
    if (!tag) return;
    setItemsLoading(true);
    setError('');
    const opts = { search: search || undefined, pageSize: 20 };
    const load =
      activeTab === 'category'
        ? listCategories(token, { ...opts, scope: 'top' }).then(({ data }) => data.map((c: Category) => ({ id: c.id, label: c.name })))
        : activeTab === 'deal'
          ? listAllDeals(token, opts).then(({ data }) => data.map((d: Deal) => ({ id: d.id, label: d.title })))
          : activeTab === 'product'
            ? listProducts(token, opts).then(({ data }) => data.map((p: Product) => ({ id: p.id, label: p.name })))
            : listAllTherapists(token, opts).then(({ data }) => data.map((t: CrossVendorTherapist) => ({ id: t.id, label: t.personName })));
    load
      .then(setItems)
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load items.'))
      .finally(() => setItemsLoading(false));
  }, [tag, token, activeTab, search]);

  const mappedIds = useMemo(() => {
    if (!mappings) return new Set<string>();
    const list = activeTab === 'category' ? mappings.categories : activeTab === 'deal' ? mappings.deals : activeTab === 'product' ? mappings.products : mappings.therapists;
    return new Set(list.map((m) => m.id));
  }, [mappings, activeTab]);

  const toggle = async (item: PickerItem) => {
    if (!tag || pendingId) return;
    setPendingId(item.id);
    setError('');
    try {
      if (mappedIds.has(item.id)) {
        await unmapPopularTag(token, tag.id, activeTab, item.id);
      } else {
        await mapPopularTag(token, tag.id, activeTab, item.id);
      }
      const { data } = await listPopularTagMappings(token, tag.id);
      setMappings(data);
      onMappingsChanged();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not update mapping.');
    } finally {
      setPendingId(null);
    }
  };

  return (
    <Dialog ref={dialogRef} onClose={onClose}>
      <div slot="headline">{tag ? `Manage mappings — ${tag.name}` : 'Manage mappings'}</div>
      <div slot="content" className="form-grid">
        <Tabs onChange={(e) => setActiveTab(TARGET_TABS[(e.target as unknown as { activeTabIndex: number }).activeTabIndex].key)}>
          {TARGET_TABS.map((t) => (
            <PrimaryTab key={t.key} active={activeTab === t.key}>
              {t.label}
            </PrimaryTab>
          ))}
        </Tabs>

        <OutlinedTextField label={`Search ${activeTab}s…`} value={search} onInput={(e: Event) => setSearch((e.target as HTMLInputElement).value)} />

        {error && <p className="error-state" role="alert">{error}</p>}

        {itemsLoading ? (
          <p className="loading-state">Loading…</p>
        ) : items.length === 0 ? (
          <p className="empty-state">No {activeTab}s found.</p>
        ) : (
          <ul className="popular-tag-mapping-list">
            {items.map((item) => (
              <li key={item.id}>
                <label className="widget-assign-row__label">
                  <input
                    type="checkbox"
                    checked={mappedIds.has(item.id)}
                    disabled={pendingId === item.id}
                    onChange={() => toggle(item)}
                  />
                  {item.label}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div slot="actions">
        <TextButton onClick={() => dialogRef.current?.close()}>Close</TextButton>
      </div>
    </Dialog>
  );
}

export default PopularTagManagement;
