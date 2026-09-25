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
  createHomeHeroSlide,
  deleteHomeHeroSlide,
  getHomeHeroEligibleCount,
  listHomeHeroSlides,
  MIN_ELIGIBLE_SLIDES,
  setHomeHeroSlideStatus,
  updateHomeHeroSlide,
  type EligibleCount,
  type HomeHeroSlide,
  type HomeHeroSlideInput,
} from '../../../../api/rbac/home-hero';
import { listCatalogLocations } from '../../../../api/catalog';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useConfirmDialog } from '../../../components/confirm-dialog';
import { DealPicker } from './promotions';

const GLOBAL_LABEL = 'Global / Default';

const STATUS_COLUMN = { key: 'Status', label: 'Status', type: 'status', statusMap: { Active: 'success', Inactive: 'error' } };

const COLUMNS = JSON.stringify([
  { key: 'Deal', label: 'Deal' },
  { key: 'Vendor', label: 'Vendor' },
  { key: 'Branch', label: 'Branch' },
  { key: 'Sort Order', label: 'Sort Order' },
  { key: 'Eligible', label: 'Eligible', type: 'status', statusMap: { Yes: 'success', No: 'error' } },
  STATUS_COLUMN,
]);

interface TableParams {
  page: number;
  pageSize: number;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 20 };

/**
 * Home page "Home Hero" (state-wise Deal slider) admin CRUD (`masters.home-hero`) — an admin
 * picks a State (or the Global/Default slider), then manages that slider's ordered slide list,
 * each slide always a live reference to an existing Deal (never a duplicated one — see
 * `HomeHeroSlide`'s schema doc comment). A state's slider only ever goes public once it has
 * `MIN_ELIGIBLE_SLIDES` (5) currently-eligible slides — the "X/5 eligible" indicator here makes
 * that requirement visible before the admin thinks it's live.
 */
export function HomeHeroManagement() {
  const { token, can } = useAuth();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const canCreate = can('masters.home-hero', 'create');
  const canEdit = can('masters.home-hero', 'edit');
  const canDelete = can('masters.home-hero', 'delete');

  const [states, setStates] = useState<string[]>([]);
  const [selectedState, setSelectedState] = useState<string | null>(null); // null = Global/Default
  const [slides, setSlides] = useState<HomeHeroSlide[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useState<TableParams>(DEFAULT_PARAMS);
  const [eligible, setEligible] = useState<EligibleCount | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [editingSlide, setEditingSlide] = useState<HomeHeroSlide | null>(null);
  const addDialogRef = useRef<MdDialog>(null);
  const editDialogRef = useRef<MdDialog>(null);
  const tableRef = useRef<HTMLElement>(null);

  useEffect(() => {
    listCatalogLocations()
      .then(({ data }) => setStates([...new Set((data ?? []).map((l) => l.state))].sort()))
      .catch(() => setStates([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [{ data, meta }, eligibleCount] = await Promise.all([
        listHomeHeroSlides(token, { page: params.page, pageSize: params.pageSize, state: selectedState }),
        getHomeHeroEligibleCount(token, selectedState),
      ]);
      setSlides(data);
      setTotal(meta?.total ?? data.length);
      setEligible(eligibleCount.data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load Home Hero slides.');
    } finally {
      setLoading(false);
    }
  }, [token, params, selectedState]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (input: HomeHeroSlideInput, existing?: HomeHeroSlide) => {
    const withState = { ...input, state: selectedState };
    if (existing) {
      const { data } = await updateHomeHeroSlide(token, existing.id, withState);
      setSlides((prev) => prev.map((s) => (s.id === data.id ? data : s)));
      setMessage('Saved.');
      return data;
    }
    const { data } = await createHomeHeroSlide(token, withState);
    setSlides((prev) => [...prev, data]);
    setTotal((t) => t + 1);
    setMessage('Saved.');
    load();
    return data;
  };

  const toggleStatus = async (slide: HomeHeroSlide) => {
    setError('');
    try {
      const { data } = await setHomeHeroSlideStatus(token, slide.id, !slide.isActive);
      setSlides((prev) => prev.map((s) => (s.id === data.id ? data : s)));
      load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change status.');
    }
  };

  const remove = async (slide: HomeHeroSlide) => {
    if (!(await confirm(`Remove "${slide.deal.title}" from this slider? This cannot be undone.`))) return;
    setError('');
    try {
      await deleteHomeHeroSlide(token, slide.id);
      setSlides((prev) => prev.filter((s) => s.id !== slide.id));
      setTotal((t) => t - 1);
      load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not remove slide.');
    }
  };

  const rows = useMemo(
    () =>
      JSON.stringify(
        slides.map((slide) => ({
          Deal: slide.deal.title,
          Vendor: slide.deal.vendor.businessName,
          Branch: slide.deal.branch.name,
          'Sort Order': slide.sortOrder,
          Eligible: slide.dealEligible ? 'Yes' : 'No',
          Status: slide.isActive ? 'Active' : 'Inactive',
        })),
      ),
    [slides],
  );

  const actions = useMemo(
    () =>
      JSON.stringify([
        ...(canEdit ? [{ icon: 'edit', label: 'Edit sort order', event: 'edit' }] : []),
        ...(canEdit ? [{ icon: 'toggle_on', label: 'Activate / Deactivate', event: 'toggle-status' }] : []),
        ...(canDelete ? [{ icon: 'delete', label: 'Remove', event: 'delete', variant: 'danger' }] : []),
      ]),
    [canEdit, canDelete],
  );

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;

    const onParamsChange = (e: Event) => {
      const detail = (e as CustomEvent<SkyDataTableParamsDetail>).detail;
      setParams({ page: detail.page, pageSize: detail.pageSize });
    };
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; row: Record<string, unknown>; rowIndex: number }>).detail;
      const slide = slides[detail.rowIndex];
      if (!slide) return;
      if (detail.action === 'edit') {
        setEditingSlide(slide);
        editDialogRef.current?.show();
      } else if (detail.action === 'toggle-status') {
        toggleStatus(slide);
      } else if (detail.action === 'delete') {
        remove(slide);
      }
    };

    el.addEventListener('sky-dt-params-change', onParamsChange);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParamsChange);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides]);

  const eligibleCount = eligible?.eligibleCount ?? 0;
  const publishable = eligibleCount >= MIN_ELIGIBLE_SLIDES;

  return (
    <div className="admin-page admin-page--wide">
      <title>Home Hero · MSD</title>
      <header className="page-head">
        <div>
          <h1>Home Hero</h1>
          <p>State-wise Home page hero Deal slider. A slider only goes public once it has {MIN_ELIGIBLE_SLIDES}+ eligible Deals.</p>
        </div>
        <div className="page-head__actions">
          {canCreate && (
            <OutlinedButton onClick={() => addDialogRef.current?.show()}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              Add slide
            </OutlinedButton>
          )}
        </div>
      </header>

      <OutlinedSelect
        label="State"
        value={selectedState ?? ''}
        onChange={(e: Event) => {
          const value = (e.target as HTMLSelectElement).value;
          setSelectedState(value || null);
          setParams(DEFAULT_PARAMS);
        }}
      >
        <SelectOption value=""><div slot="headline">{GLOBAL_LABEL}</div></SelectOption>
        {states.map((state) => (
          <SelectOption key={state} value={state}>
            <div slot="headline">{state}</div>
          </SelectOption>
        ))}
      </OutlinedSelect>

      <p className={publishable ? 'field-hint' : 'error-state'} role="status">
        {eligibleCount}/{MIN_ELIGIBLE_SLIDES} eligible Deals for {selectedState ?? GLOBAL_LABEL}.{' '}
        {publishable
          ? 'This slider is publishable.'
          : `Add ${MIN_ELIGIBLE_SLIDES - eligibleCount} more eligible Deal(s) before this slider can go public${selectedState ? ' — the Global/Default slider will show instead until then' : ''}.`}
      </p>

      {message && <p className="field-hint" role="status">{message}</p>}
      {error && <p className="error-state" role="alert">{error}</p>}

      <sky-data-table
        ref={tableRef as RefObject<HTMLElement>}
        caption={`${selectedState ?? GLOBAL_LABEL} slides`}
        columns={COLUMNS}
        rows={rows}
        total={total}
        page={params.page}
        page-size={params.pageSize}
        loading={loading}
        actions={actions}
      />

      {canCreate && (
        <SlideFormDialog dialogRef={addDialogRef} token={token} state={selectedState} onSave={(input) => save(input)} />
      )}

      {canEdit && (
        <SlideFormDialog
          key={editingSlide?.id ?? 'edit-empty'}
          dialogRef={editDialogRef}
          slide={editingSlide ?? undefined}
          token={token}
          state={selectedState}
          onSave={(input) => save(input, editingSlide ?? undefined)}
          onClose={() => setEditingSlide(null)}
        />
      )}
      {ConfirmDialog}
    </div>
  );
}

function SlideFormDialog({
  dialogRef,
  slide,
  token,
  state,
  onSave,
  onClose,
}: {
  dialogRef: RefObject<MdDialog | null>;
  slide?: HomeHeroSlide;
  token: string | null;
  state: string | null;
  onSave: (input: HomeHeroSlideInput) => Promise<HomeHeroSlide | void>;
  onClose?: () => void;
}) {
  const [dealId, setDealId] = useState(slide?.dealId ?? '');
  const [dealTitle, setDealTitle] = useState(slide?.deal?.title ?? '');
  const [sortOrder, setSortOrder] = useState(slide?.sortOrder ?? 0);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const saveButtonRef = useRef<MdFilledButton>(null);

  const submit = async () => {
    if (submittingRef.current) return;
    if (!dealId) {
      setError('Select a Deal.');
      return;
    }
    submittingRef.current = true;
    if (saveButtonRef.current) saveButtonRef.current.disabled = true;
    setSubmitting(true);
    setError('');
    try {
      await onSave({ dealId, sortOrder, state });
      dialogRef.current?.close();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save this slide.');
    } finally {
      submittingRef.current = false;
      if (saveButtonRef.current) saveButtonRef.current.disabled = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog ref={dialogRef} onClose={onClose}>
      <div slot="headline">{slide ? 'Edit slide' : 'Add slide'} — {state ?? GLOBAL_LABEL}</div>
      <div slot="content" className="form-grid">
        {!slide && (
          <DealPicker
            token={token}
            value={dealId || null}
            state={state ?? undefined}
            onChange={(id, title) => {
              setDealId(id);
              setDealTitle(title);
            }}
          />
        )}
        {slide && <p className="field-hint">Deal: {dealTitle || dealId} (cannot be changed — remove and add a new slide instead)</p>}

        <OutlinedTextField
          label="Sort order"
          type="number"
          value={String(sortOrder)}
          onInput={(e: Event) => setSortOrder(Number((e.target as HTMLInputElement).value) || 0)}
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

export default HomeHeroManagement;
