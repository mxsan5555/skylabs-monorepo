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
  createPromotion,
  deletePromotion,
  listPromotions,
  setPromotionStatus,
  updatePromotion,
  PROMOTION_ROUTE_ALLOW_LIST,
  type Promotion,
  type PromotionInput,
} from '../../../../api/rbac/promotions';
import { listCategories, type Category } from '../../../../api/rbac/categories';
import { listAllDeals } from '../../../../api/rbac/vendors';
import type { Deal } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { MediaUploader } from '../../../components/media-uploader';
import { useConfirmDialog } from '../../../components/confirm-dialog';
import { extractFieldErrors } from '../../../../utils/field-errors';

type PromotionFieldKey = 'title' | 'description' | 'buttonLabel' | 'destinationType' | 'destinationRoute' | 'categoryId' | 'dealId' | 'sortOrder' | 'startDate' | 'endDate';

interface TableParams {
  page: number;
  pageSize: number;
  search: string;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 10, search: '' };

const STATUS_COLUMN = { key: 'Status', label: 'Status', type: 'status', statusMap: { Active: 'success', Inactive: 'error' } };

const COLUMNS = JSON.stringify([
  { key: 'Title', label: 'Title' },
  { key: 'Destination', label: 'Destination' },
  { key: 'Sort Order', label: 'Sort Order' },
  { key: 'Window', label: 'Visibility Window' },
  STATUS_COLUMN,
]);

function destinationLabel(promotion: Promotion): string {
  if (promotion.destinationType === 'ROUTE') return `Route: ${promotion.destinationRoute ?? '—'}`;
  if (promotion.destinationType === 'CATEGORY') return `Category: ${promotion.category?.name ?? '—'}`;
  return `Deal: ${promotion.deal?.title ?? '—'}`;
}

function windowLabel(promotion: Promotion): string {
  if (!promotion.startDate && !promotion.endDate) return 'Always';
  const from = promotion.startDate ? new Date(promotion.startDate).toLocaleDateString() : '…';
  const to = promotion.endDate ? new Date(promotion.endDate).toLocaleDateString() : '…';
  return `${from} → ${to}`;
}

/**
 * Home page "Promotions" admin CRUD (`masters.promotions`) — the admin-managed source for the
 * `home-offers.tsx` section, replacing the previous hardcoded `content.json` cards. One flat
 * ordered list (no group/item two-tier the way Popular Treatments has), same dialog-based
 * add/edit pattern as `CategoryManagement`.
 */
export function PromotionManagement() {
  const { token, can } = useAuth();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const canCreate = can('masters.promotions', 'create');
  const canEdit = can('masters.promotions', 'edit');
  const canDelete = can('masters.promotions', 'delete');

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useState<TableParams>(DEFAULT_PARAMS);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  const addDialogRef = useRef<MdDialog>(null);
  const editDialogRef = useRef<MdDialog>(null);
  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listPromotions(token, {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
      });
      setPromotions(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load promotions.');
    } finally {
      setLoading(false);
    }
  }, [token, params]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    listCategories(token, { scope: 'top', pageSize: 100 })
      .then(({ data }) => setCategories(data))
      .catch(() => setCategories([]));
  }, [token]);

  const save = async (input: PromotionInput, existing?: Promotion) => {
    if (existing) {
      const { data } = await updatePromotion(token, existing.id, input);
      setPromotions((prev) => prev.map((p) => (p.id === data.id ? data : p)));
      setMessage('Saved.');
      return data;
    }
    const { data } = await createPromotion(token, input);
    setPromotions((prev) => [...prev, data]);
    setTotal((t) => t + 1);
    setMessage('Saved.');
    return data;
  };

  const toggleStatus = async (promotion: Promotion) => {
    setError('');
    try {
      const { data } = await setPromotionStatus(token, promotion.id, !promotion.isActive);
      setPromotions((prev) => prev.map((p) => (p.id === data.id ? data : p)));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change status.');
    }
  };

  const remove = async (promotion: Promotion) => {
    if (!(await confirm(`Delete "${promotion.title}"? This cannot be undone.`))) return;
    setError('');
    try {
      await deletePromotion(token, promotion.id);
      setPromotions((prev) => prev.filter((p) => p.id !== promotion.id));
      setTotal((t) => t - 1);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not delete promotion.');
    }
  };

  const rows = useMemo(
    () =>
      JSON.stringify(
        promotions.map((promotion) => ({
          Title: promotion.title,
          Destination: destinationLabel(promotion),
          'Sort Order': promotion.sortOrder,
          Window: windowLabel(promotion),
          Status: promotion.isActive ? 'Active' : 'Inactive',
        })),
      ),
    [promotions],
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
      const promotion = promotions[detail.rowIndex];
      if (!promotion) return;
      if (detail.action === 'edit') {
        setEditingPromotion(promotion);
        editDialogRef.current?.show();
      } else if (detail.action === 'toggle-status') {
        toggleStatus(promotion);
      } else if (detail.action === 'delete') {
        remove(promotion);
      }
    };

    el.addEventListener('sky-dt-params-change', onParamsChange);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParamsChange);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promotions]);

  return (
    <div className="admin-page admin-page--wide">
      <title>Promotions · MSD</title>
      <header className="page-head">
        <div>
          <h1>Promotions</h1>
          <p>Home page promotion cards — only active promotions within their visibility window show publicly.</p>
        </div>
        <div className="page-head__actions">
          {canCreate && (
            <OutlinedButton onClick={() => addDialogRef.current?.show()}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              Add promotion
            </OutlinedButton>
          )}
        </div>
      </header>

      {message && <p className="field-hint" role="status">{message}</p>}
      {error && <p className="error-state" role="alert">{error}</p>}

      <sky-data-table
        ref={tableRef as RefObject<HTMLElement>}
        caption="Promotions"
        columns={COLUMNS}
        rows={rows}
        total={total}
        page={params.page}
        page-size={params.pageSize}
        loading={loading}
        searchable
        search-placeholder="Search by title…"
        actions={actions}
      />

      {canCreate && (
        <PromotionFormDialog dialogRef={addDialogRef} token={token} categories={categories} onSave={(input) => save(input)} />
      )}

      {canEdit && (
        <PromotionFormDialog
          key={editingPromotion?.id ?? 'edit-empty'}
          dialogRef={editDialogRef}
          promotion={editingPromotion ?? undefined}
          token={token}
          categories={categories}
          onSave={(input) => save(input, editingPromotion ?? undefined)}
          onClose={() => setEditingPromotion(null)}
        />
      )}
      {ConfirmDialog}
    </div>
  );
}

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

/** Search-and-select a Deal by title/vendor/branch — shared by this dialog's "Deal" destination
 *  and the Home Hero admin screen's slide picker (`home-hero.tsx`), so there is exactly one Deal
 *  search UI in the admin console. */
export function DealPicker({
  token,
  value,
  onChange,
  state,
}: {
  token: string | null;
  value: string | null;
  onChange: (dealId: string, title: string) => void;
  /** Home Hero only — narrows the search to deals whose branch is in this state. */
  state?: string;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState('');

  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listAllDeals(token, { search, pageSize: 8, state })
      .then(({ data }) => {
        if (!cancelled) setResults(data);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, search, state]);

  return (
    <div className="form-grid">
      <OutlinedTextField
        label={state ? `Search ${state} deals by title, vendor, or branch` : 'Search deals by title, vendor, or branch'}
        value={search}
        onInput={(e: Event) => setSearch((e.target as HTMLInputElement).value)}
      />
      {value && !search && (
        <p className="field-hint">Selected deal: {selectedTitle || value}</p>
      )}
      {loading && <p className="loading-state">Searching…</p>}
      {!loading && results.length > 0 && (
        <ul className="entity-list">
          {results.map((deal) => (
            <li key={deal.id}>
              <div className="entity-list__item">
                <span className="role-list__name">
                  {deal.title}
                  {deal.eligible === false && <span className="field-hint"> · not yet eligible (inactive, unapproved, or vendor/branch disabled)</span>}
                </span>
                <OutlinedButton
                  onClick={() => {
                    onChange(deal.id, deal.title);
                    setSelectedTitle(deal.title);
                    setSearch('');
                    setResults([]);
                  }}
                >
                  {value === deal.id ? 'Selected' : `Select: ${deal.title}`}
                </OutlinedButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PromotionFormDialog({
  dialogRef,
  promotion,
  token,
  categories,
  onSave,
  onClose,
}: {
  dialogRef: RefObject<MdDialog | null>;
  promotion?: Promotion;
  token: string | null;
  categories: Category[];
  onSave: (input: PromotionInput) => Promise<Promotion | void>;
  onClose?: () => void;
}) {
  const [form, setForm] = useState<PromotionInput>({
    title: promotion?.title ?? '',
    description: promotion?.description ?? '',
    buttonLabel: promotion?.buttonLabel ?? '',
    destinationType: promotion?.destinationType ?? 'ROUTE',
    destinationRoute: promotion?.destinationRoute ?? PROMOTION_ROUTE_ALLOW_LIST[0],
    categoryId: promotion?.categoryId ?? undefined,
    dealId: promotion?.dealId ?? undefined,
    sortOrder: promotion?.sortOrder ?? 0,
    startDate: promotion?.startDate ?? undefined,
    endDate: promotion?.endDate ?? undefined,
  });
  const [dealTitle, setDealTitle] = useState(promotion?.deal?.title ?? '');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<PromotionFieldKey, string>> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const saveButtonRef = useRef<MdFilledButton>(null);
  const [savedPromotion, setSavedPromotion] = useState<Promotion | undefined>(promotion);

  const submit = async () => {
    if (submittingRef.current) return;
    if (!form.title.trim()) {
      setError('Title is required.');
      return;
    }
    submittingRef.current = true;
    if (saveButtonRef.current) saveButtonRef.current.disabled = true;
    setSubmitting(true);
    setError('');
    setFieldErrors(null);
    try {
      const payload: PromotionInput = {
        ...form,
        startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
        endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
      };
      const result = await onSave(payload);
      if (!promotion && result) {
        setSavedPromotion(result);
      } else {
        dialogRef.current?.close();
      }
    } catch (err) {
      const fields = extractFieldErrors<PromotionFieldKey>(err);
      if (fields) {
        setFieldErrors(fields);
        setError('Fix the highlighted fields and try again.');
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Could not save promotion.');
      }
    } finally {
      submittingRef.current = false;
      if (saveButtonRef.current) saveButtonRef.current.disabled = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog ref={dialogRef} onClose={onClose}>
      <div slot="headline">{promotion ? 'Edit promotion' : 'Add promotion'}</div>
      <div slot="content" className="form-grid">
        <OutlinedTextField
          label="Title"
          required
          value={form.title}
          onInput={(e: Event) => setForm((f) => ({ ...f, title: (e.target as HTMLInputElement).value }))}
          error={Boolean(fieldErrors?.title)}
        />
        {fieldErrors?.title && <p className="error-state" role="alert">{fieldErrors.title}</p>}

        <OutlinedTextField
          label="Description"
          value={form.description ?? ''}
          onInput={(e: Event) => setForm((f) => ({ ...f, description: (e.target as HTMLInputElement).value }))}
          error={Boolean(fieldErrors?.description)}
        />
        {fieldErrors?.description && <p className="error-state" role="alert">{fieldErrors.description}</p>}

        <OutlinedTextField
          label="Button label"
          value={form.buttonLabel ?? ''}
          onInput={(e: Event) => setForm((f) => ({ ...f, buttonLabel: (e.target as HTMLInputElement).value }))}
          error={Boolean(fieldErrors?.buttonLabel)}
        />
        {fieldErrors?.buttonLabel && <p className="error-state" role="alert">{fieldErrors.buttonLabel}</p>}

        <OutlinedSelect
          label="Destination type"
          value={form.destinationType}
          onChange={(e: Event) =>
            setForm((f) => ({ ...f, destinationType: (e.target as HTMLSelectElement).value as PromotionInput['destinationType'] }))
          }
        >
          <SelectOption value="ROUTE"><div slot="headline">Internal route</div></SelectOption>
          <SelectOption value="CATEGORY"><div slot="headline">Category</div></SelectOption>
          <SelectOption value="DEAL"><div slot="headline">Deal</div></SelectOption>
        </OutlinedSelect>

        {form.destinationType === 'ROUTE' && (
          <>
            <OutlinedSelect
              label="Route"
              value={form.destinationRoute ?? ''}
              onChange={(e: Event) => setForm((f) => ({ ...f, destinationRoute: (e.target as HTMLSelectElement).value }))}
              error={Boolean(fieldErrors?.destinationRoute)}
            >
              {PROMOTION_ROUTE_ALLOW_LIST.map((route) => (
                <SelectOption key={route} value={route}>
                  <div slot="headline">{route}</div>
                </SelectOption>
              ))}
            </OutlinedSelect>
            {fieldErrors?.destinationRoute && <p className="error-state" role="alert">{fieldErrors.destinationRoute}</p>}
          </>
        )}

        {form.destinationType === 'CATEGORY' && (
          <>
            <OutlinedSelect
              label="Category"
              value={form.categoryId ?? ''}
              onChange={(e: Event) => setForm((f) => ({ ...f, categoryId: (e.target as HTMLSelectElement).value }))}
              error={Boolean(fieldErrors?.categoryId)}
            >
              <SelectOption value=""><div slot="headline">Select a category</div></SelectOption>
              {categories.map((c) => (
                <SelectOption key={c.id} value={c.id}>
                  <div slot="headline">{c.name}</div>
                </SelectOption>
              ))}
            </OutlinedSelect>
            {fieldErrors?.categoryId && <p className="error-state" role="alert">{fieldErrors.categoryId}</p>}
          </>
        )}

        {form.destinationType === 'DEAL' && (
          <>
            {form.dealId && <p className="field-hint">Selected deal: {dealTitle || form.dealId}</p>}
            <DealPicker
              token={token}
              value={form.dealId ?? null}
              onChange={(dealId, title) => {
                setForm((f) => ({ ...f, dealId }));
                setDealTitle(title);
              }}
            />
            {fieldErrors?.dealId && <p className="error-state" role="alert">{fieldErrors.dealId}</p>}
          </>
        )}

        <OutlinedTextField
          label="Sort order"
          type="number"
          value={String(form.sortOrder ?? 0)}
          onInput={(e: Event) => setForm((f) => ({ ...f, sortOrder: Number((e.target as HTMLInputElement).value) || 0 }))}
          error={Boolean(fieldErrors?.sortOrder)}
        />
        {fieldErrors?.sortOrder && <p className="error-state" role="alert">{fieldErrors.sortOrder}</p>}

        <OutlinedTextField
          label="Start date (optional)"
          type="date"
          value={toDateInputValue(form.startDate)}
          onInput={(e: Event) => setForm((f) => ({ ...f, startDate: (e.target as HTMLInputElement).value || undefined }))}
          error={Boolean(fieldErrors?.startDate)}
        />
        {fieldErrors?.startDate && <p className="error-state" role="alert">{fieldErrors.startDate}</p>}

        <OutlinedTextField
          label="End date (optional)"
          type="date"
          value={toDateInputValue(form.endDate)}
          onInput={(e: Event) => setForm((f) => ({ ...f, endDate: (e.target as HTMLInputElement).value || undefined }))}
          error={Boolean(fieldErrors?.endDate)}
        />
        {fieldErrors?.endDate && <p className="error-state" role="alert">{fieldErrors.endDate}</p>}

        <MediaUploader
          entityType="promotion"
          entityId={savedPromotion?.id ?? null}
          existingImages={savedPromotion?.mediaImages ?? []}
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

export default PromotionManagement;
