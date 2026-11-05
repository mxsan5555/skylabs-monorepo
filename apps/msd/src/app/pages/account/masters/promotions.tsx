import { createElement, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type RefObject } from 'react';
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
  BANNER_BUTTON_ROLES,
  BANNER_COLOR_ROLES,
  BANNER_SLOTS,
  PROMOTION_ROUTE_ALLOW_LIST,
  createPromotion,
  deletePromotion,
  listPromotions,
  setPromotionStatus,
  updatePromotion,
  type BannerColorRole,
  type BannerSlot,
  type Promotion,
  type PromotionInput,
} from '../../../../api/rbac/promotions';
import { listCategories, type Category } from '../../../../api/rbac/categories';
import type { StateItem } from '../../../../api/rbac/home-hero';
import { ApiRequestError } from '../../../../api/rbac/client';
import { MediaUploader } from '../../../components/media-uploader';
import { useConfirmDialog } from '../../../components/confirm-dialog';
import { CtaBannerCard } from '../../../components/banner-slot/banner-slot';
import { extractFieldErrors } from '../../../../utils/field-errors';
import { StateItemPicker } from './state-item-picker';
import { GLOBAL_LABEL, StatePicker, useBranchStates, type ChosenState } from './state-picker';

type PromotionFieldKey =
  | 'title'
  | 'description'
  | 'buttonLabel'
  | 'placements'
  | 'destinationType'
  | 'destinationRoute'
  | 'categoryId'
  | 'dealId'
  | 'productId'
  | 'sortOrder'
  | 'startDate'
  | 'endDate';

interface TableParams {
  page: number;
  pageSize: number;
  search: string;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 10, search: '' };

const STATUS_COLUMN = { key: 'Status', label: 'Status', type: 'status', statusMap: { Active: 'success', Inactive: 'error' } };

const COLUMNS = JSON.stringify([
  { key: 'Headline', label: 'Headline' },
  { key: 'Slots', label: 'Slots' },
  { key: 'Destination', label: 'Destination' },
  { key: 'Sort Order', label: 'Sort Order' },
  { key: 'Window', label: 'Visibility Window' },
  STATUS_COLUMN,
]);

const slotLabel = (slot: BannerSlot) => BANNER_SLOTS.find((s) => s.value === slot)?.label ?? slot;

function destinationLabel(promotion: Promotion): string {
  if (promotion.destinationType === 'ROUTE') return `Page: ${promotion.destinationRoute ?? '—'}`;
  if (promotion.destinationType === 'CATEGORY') return `Category: ${promotion.category?.name ?? '—'}`;
  if (promotion.destinationType === 'PRODUCT') return `Product: ${promotion.product?.name ?? '—'}`;
  return `Deal: ${promotion.deal?.title ?? '—'}`;
}

function windowLabel(promotion: Promotion): string {
  if (!promotion.startDate && !promotion.endDate) return 'Always';
  const from = promotion.startDate ? new Date(promotion.startDate).toLocaleDateString() : '…';
  const to = promotion.endDate ? new Date(promotion.endDate).toLocaleDateString() : '…';
  return `${from} → ${to}`;
}

/** The form's own shape: the destination picker is "page", "category" or "item" (deal or product). */
export interface BannerForm {
  title: string;
  description: string;
  buttonLabel: string;
  backgroundRole: BannerColorRole;
  buttonRole: BannerColorRole;
  placements: BannerSlot[];
  destinationKind: 'ROUTE' | 'CATEGORY' | 'ITEM';
  destinationRoute: string;
  categoryId: string;
  item: { type: 'deal' | 'product'; id: string; title: string } | null;
  sortOrder: number;
  startDate: string;
  endDate: string;
}

export function formFromPromotion(promotion?: Promotion): BannerForm {
  const item = promotion?.deal
    ? { type: 'deal' as const, id: promotion.deal.id, title: promotion.deal.title }
    : promotion?.product
      ? { type: 'product' as const, id: promotion.product.id, title: promotion.product.name }
      : null;
  return {
    title: promotion?.title ?? '',
    description: promotion?.description ?? '',
    buttonLabel: promotion?.buttonLabel ?? '',
    backgroundRole: promotion?.backgroundRole ?? 'PRIMARY',
    buttonRole: promotion?.buttonRole ?? 'PRIMARY',
    placements: promotion?.placements.map((p) => p.slot) ?? ['HOME_AFTER_DEALS'],
    destinationKind:
      promotion?.destinationType === 'CATEGORY' ? 'CATEGORY' : promotion && ['DEAL', 'PRODUCT'].includes(promotion.destinationType) ? 'ITEM' : 'ROUTE',
    destinationRoute: promotion?.destinationRoute ?? PROMOTION_ROUTE_ALLOW_LIST[0],
    categoryId: promotion?.categoryId ?? '',
    item,
    sortOrder: promotion?.sortOrder ?? 0,
    startDate: promotion?.startDate?.slice(0, 10) ?? '',
    endDate: promotion?.endDate?.slice(0, 10) ?? '',
  };
}

/** Form → API body. Only the chosen destination's field is sent; the others are cleared. */
export function buildBannerInput(form: BannerForm, state: string | null): PromotionInput {
  const destinationType =
    form.destinationKind === 'ITEM' ? (form.item?.type === 'product' ? 'PRODUCT' : 'DEAL') : form.destinationKind;
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    buttonLabel: form.buttonLabel.trim(),
    state,
    backgroundRole: form.backgroundRole,
    buttonRole: form.buttonRole,
    placements: form.placements,
    destinationType,
    destinationRoute: destinationType === 'ROUTE' ? form.destinationRoute : null,
    categoryId: destinationType === 'CATEGORY' ? form.categoryId || null : null,
    dealId: destinationType === 'DEAL' ? form.item?.id ?? null : null,
    productId: destinationType === 'PRODUCT' ? form.item?.id ?? null : null,
    sortOrder: form.sortOrder,
    startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
    endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
  };
}

/**
 * CTA banners console (`masters.promotions`; docs/msd/PLANNING.md §6). Choose a state (or
 * Global/Default) first, then create its banners: colour roles, one image, headline, subheadline,
 * button, destination (a page, a category, or a deal or product of that state) and slots.
 */
export function PromotionManagement() {
  const { token, can } = useAuth();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const canCreate = can('masters.promotions', 'create');
  const canEdit = can('masters.promotions', 'edit');
  const canDelete = can('masters.promotions', 'delete');

  const states = useBranchStates();
  const [selectedState, setSelectedState] = useState<ChosenState>(undefined);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [params, setParams] = useState<TableParams>(DEFAULT_PARAMS);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  const addDialogRef = useRef<MdDialog>(null);
  const editDialogRef = useRef<MdDialog>(null);
  const tableRef = useRef<HTMLElement>(null);

  const stateChosen = selectedState !== undefined;
  const stateLabel = selectedState ?? GLOBAL_LABEL;

  const load = useCallback(async () => {
    if (selectedState === undefined) return;
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listPromotions(token, {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
        state: selectedState,
      });
      setPromotions(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load banners.');
    } finally {
      setLoading(false);
    }
  }, [token, params, selectedState]);

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
    setMessage('Saved. Add the banner image below.');
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
      setError(err instanceof ApiRequestError ? err.message : 'Could not delete banner.');
    }
  };

  const rows = useMemo(
    () =>
      JSON.stringify(
        promotions.map((promotion) => ({
          Headline: promotion.title,
          Slots: promotion.placements.map((p) => slotLabel(p.slot)).join(', '),
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
  }, [promotions, stateChosen]);

  return (
    <div className="admin-page admin-page--wide">
      <title>CTA banners · MSD</title>
      <header className="page-head">
        <div>
          <h1>CTA banners</h1>
          <p>
            Choose a state, then create its banners and the pages they appear on. Visitors see their state&apos;s banners, or
            the Global / Default ones when their state has none for that place.
          </p>
        </div>
        <div className="page-head__actions">
          {canCreate && stateChosen && (
            <OutlinedButton onClick={() => addDialogRef.current?.show()}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              Add banner
            </OutlinedButton>
          )}
        </div>
      </header>

      <StatePicker
        states={states}
        value={selectedState}
        onChange={(state) => {
          setSelectedState(state);
          setParams(DEFAULT_PARAMS);
          setMessage('');
          if (state === undefined) setPromotions([]);
        }}
      />

      {!stateChosen && <p className="field-hint">Choose a state (or Global / Default) to see and create its banners.</p>}

      {stateChosen && (
        <>
          {message && <p className="field-hint" role="status">{message}</p>}
          {error && <p className="error-state" role="alert">{error}</p>}

          <sky-data-table
            ref={tableRef as RefObject<HTMLElement>}
            caption={`${stateLabel} banners`}
            columns={COLUMNS}
            rows={rows}
            total={total}
            page={params.page}
            page-size={params.pageSize}
            loading={loading}
            searchable
            search-placeholder="Search by headline…"
            actions={actions}
          />
        </>
      )}

      {canCreate && stateChosen && (
        <BannerFormDialog
          key={`add-${selectedState ?? 'global'}`}
          dialogRef={addDialogRef}
          token={token}
          state={selectedState}
          categories={categories}
          onSave={(input) => save(input)}
        />
      )}

      {canEdit && stateChosen && (
        <BannerFormDialog
          key={editingPromotion?.id ?? 'edit-empty'}
          dialogRef={editDialogRef}
          promotion={editingPromotion ?? undefined}
          token={token}
          state={selectedState}
          categories={categories}
          onSave={(input) => save(input, editingPromotion ?? undefined)}
          onClose={() => setEditingPromotion(null)}
        />
      )}
      {ConfirmDialog}
    </div>
  );
}

/** A radio group of M3 colour roles, raw md-radio elements so the choice is a real radio group. */
function RolePicker({
  legend,
  name,
  roles,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  roles: readonly { value: BannerColorRole; label: string }[];
  value: BannerColorRole;
  onChange: (role: BannerColorRole) => void;
}) {
  return (
    <fieldset className="form-grid">
      <legend className="label-large">{legend}</legend>
      {roles.map((role) => (
        <label key={role.value}>
          {createElement('md-radio', {
            name,
            value: role.value,
            checked: role.value === value,
            onChange: (e: ChangeEvent<HTMLElement & { checked: boolean }>) => {
              if (e.currentTarget.checked) onChange(role.value);
            },
          })}
          <span className="body-medium">{role.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

function BannerFormDialog({
  dialogRef,
  promotion,
  token,
  state,
  categories,
  onSave,
  onClose,
}: {
  dialogRef: RefObject<MdDialog | null>;
  promotion?: Promotion;
  token: string | null;
  state: string | null;
  categories: Category[];
  onSave: (input: PromotionInput) => Promise<Promotion | void>;
  onClose?: () => void;
}) {
  const [form, setForm] = useState<BannerForm>(() => formFromPromotion(promotion));
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<PromotionFieldKey, string>> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const saveButtonRef = useRef<MdFilledButton>(null);
  const [savedPromotion, setSavedPromotion] = useState<Promotion | undefined>(promotion);

  const set = <K extends keyof BannerForm>(key: K, value: BannerForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggleSlot = (slot: BannerSlot, on: boolean) =>
    set('placements', on ? [...new Set([...form.placements, slot])] : form.placements.filter((s) => s !== slot));

  const submit = async () => {
    if (submittingRef.current) return;
    if (!form.title.trim() || !form.buttonLabel.trim()) {
      setError('Headline and button label are required.');
      return;
    }
    if (form.placements.length === 0) {
      setError('Choose at least one place for this banner.');
      return;
    }
    if (form.destinationKind === 'ITEM' && !form.item) {
      setError('Choose the deal or product the button opens.');
      return;
    }
    submittingRef.current = true;
    if (saveButtonRef.current) saveButtonRef.current.disabled = true;
    setSubmitting(true);
    setError('');
    setFieldErrors(null);
    try {
      const result = await onSave(buildBannerInput(form, state));
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
        setError(err instanceof ApiRequestError ? err.message : 'Could not save banner.');
      }
    } finally {
      submittingRef.current = false;
      if (saveButtonRef.current) saveButtonRef.current.disabled = false;
      setSubmitting(false);
    }
  };

  const previewImage = savedPromotion?.mediaImages?.[0]?.storageKey ?? null;

  return (
    <Dialog ref={dialogRef} onClose={onClose}>
      <div slot="headline">
        {promotion ? 'Edit banner' : 'Add banner'} — {state ?? GLOBAL_LABEL}
      </div>
      <div slot="content" className="form-grid">
        <CtaBannerCard
          banner={{
            id: 'preview',
            title: form.title || 'Headline',
            description: form.description || null,
            buttonLabel: form.buttonLabel || 'Button',
            backgroundRole: form.backgroundRole,
            buttonRole: form.buttonRole,
            href: '#',
            image: previewImage,
          }}
        />

        <OutlinedTextField
          label="Headline"
          required
          maxLength={120}
          value={form.title}
          onInput={(e: Event) => set('title', (e.target as HTMLInputElement).value)}
          error={Boolean(fieldErrors?.title)}
          error-text={fieldErrors?.title}
        />
        <OutlinedTextField
          label="Subheadline"
          maxLength={300}
          value={form.description}
          onInput={(e: Event) => set('description', (e.target as HTMLInputElement).value)}
          error={Boolean(fieldErrors?.description)}
          error-text={fieldErrors?.description}
        />
        <OutlinedTextField
          label="Button label"
          required
          maxLength={40}
          value={form.buttonLabel}
          onInput={(e: Event) => set('buttonLabel', (e.target as HTMLInputElement).value)}
          error={Boolean(fieldErrors?.buttonLabel)}
          error-text={fieldErrors?.buttonLabel}
        />

        <RolePicker
          legend="Background colour"
          name="backgroundRole"
          roles={BANNER_COLOR_ROLES}
          value={form.backgroundRole}
          onChange={(role) => set('backgroundRole', role)}
        />
        <RolePicker
          legend="Button colour"
          name="buttonRole"
          roles={BANNER_BUTTON_ROLES}
          value={form.buttonRole}
          onChange={(role) => set('buttonRole', role)}
        />

        <fieldset className="form-grid">
          <legend className="label-large">Show on</legend>
          {BANNER_SLOTS.map((slot) => (
            <label key={slot.value}>
              {createElement('md-checkbox', {
                checked: form.placements.includes(slot.value),
                onChange: (e: ChangeEvent<HTMLElement & { checked: boolean }>) => toggleSlot(slot.value, e.currentTarget.checked),
              })}
              <span className="body-medium">{slot.label}</span>
            </label>
          ))}
          {fieldErrors?.placements && <p className="error-state" role="alert">{fieldErrors.placements}</p>}
        </fieldset>

        <OutlinedSelect
          label="Button opens"
          value={form.destinationKind}
          onChange={(e: Event) => set('destinationKind', (e.target as HTMLSelectElement).value as BannerForm['destinationKind'])}
        >
          <SelectOption value="ROUTE"><div slot="headline">A page</div></SelectOption>
          <SelectOption value="CATEGORY"><div slot="headline">A category</div></SelectOption>
          <SelectOption value="ITEM"><div slot="headline">A deal or product in {state ?? 'any state'}</div></SelectOption>
        </OutlinedSelect>

        {form.destinationKind === 'ROUTE' && (
          <OutlinedSelect
            label="Page"
            value={form.destinationRoute}
            onChange={(e: Event) => set('destinationRoute', (e.target as HTMLSelectElement).value)}
            error={Boolean(fieldErrors?.destinationRoute)}
          >
            {PROMOTION_ROUTE_ALLOW_LIST.map((route) => (
              <SelectOption key={route} value={route}>
                <div slot="headline">{route}</div>
              </SelectOption>
            ))}
          </OutlinedSelect>
        )}

        {form.destinationKind === 'CATEGORY' && (
          <OutlinedSelect
            label="Category"
            value={form.categoryId}
            onChange={(e: Event) => set('categoryId', (e.target as HTMLSelectElement).value)}
            error={Boolean(fieldErrors?.categoryId)}
          >
            <SelectOption value=""><div slot="headline">Select a category</div></SelectOption>
            {categories.map((c) => (
              <SelectOption key={c.id} value={c.id}>
                <div slot="headline">{c.name}</div>
              </SelectOption>
            ))}
          </OutlinedSelect>
        )}

        {form.destinationKind === 'ITEM' && (
          <>
            {form.item && (
              <p className="field-hint">
                Opens: {form.item.type === 'deal' ? 'Deal' : 'Product'} “{form.item.title}”
              </p>
            )}
            <StateItemPicker
              token={token}
              base="/promotions"
              state={state}
              pickLabel="Select"
              pickedLabel="Selected"
              excludeIds={form.item ? [form.item.id] : []}
              onPick={(item: StateItem) => set('item', { type: item.type, id: item.id, title: item.title })}
            />
            {(fieldErrors?.dealId || fieldErrors?.productId) && (
              <p className="error-state" role="alert">{fieldErrors?.dealId ?? fieldErrors?.productId}</p>
            )}
          </>
        )}

        <OutlinedTextField
          label="Sort order"
          type="number"
          min="0"
          value={String(form.sortOrder)}
          onInput={(e: Event) => set('sortOrder', Number((e.target as HTMLInputElement).value) || 0)}
          error={Boolean(fieldErrors?.sortOrder)}
        />
        <OutlinedTextField
          label="Start date (optional)"
          type="date"
          value={form.startDate}
          onInput={(e: Event) => set('startDate', (e.target as HTMLInputElement).value)}
          error={Boolean(fieldErrors?.startDate)}
        />
        <OutlinedTextField
          label="End date (optional)"
          type="date"
          value={form.endDate}
          onInput={(e: Event) => set('endDate', (e.target as HTMLInputElement).value)}
          error={Boolean(fieldErrors?.endDate)}
          error-text={fieldErrors?.endDate}
        />

        <p className="field-hint">One image per banner. Save the banner first, then add its image.</p>
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
