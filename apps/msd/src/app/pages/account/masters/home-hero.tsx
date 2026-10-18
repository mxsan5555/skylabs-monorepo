import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import type { MdFilledButton } from '@material/web/button/filled-button.js';
import { Dialog, FilledButton, OutlinedButton, OutlinedTextField, TextButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  createHomeHeroSlide,
  deleteHomeHeroSlide,
  getHomeHeroEligibleCount,
  listHomeHeroSlides,
  MIN_ELIGIBLE_SLIDES,
  setHomeHeroSlideStatus,
  slideTitle,
  updateHomeHeroSlide,
  type EligibleCount,
  type HomeHeroSlide,
  type StateItem,
} from '../../../../api/rbac/home-hero';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useConfirmDialog } from '../../../components/confirm-dialog';
import { StateItemPicker } from './state-item-picker';
import { GLOBAL_LABEL, StatePicker, useBranchStates, type ChosenState } from './state-picker';

const STATUS_COLUMN = { key: 'Status', label: 'Status', type: 'status', statusMap: { Active: 'success', Inactive: 'error' } };

const COLUMNS = JSON.stringify([
  { key: 'Type', label: 'Type' },
  { key: 'Item', label: 'Item' },
  { key: 'Member', label: 'Member' },
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
 * Home hero slider console (`masters.home-hero`; docs/msd/PLANNING.md §7). Choose a state (or
 * Global/Default) first, then search that state's deals and products and add them. A slider goes
 * public once it has `MIN_ELIGIBLE_SLIDES` (5) eligible slides; the "n/5 eligible" line says how
 * far along it is.
 */
export function HomeHeroManagement() {
  const { token, can } = useAuth();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const canCreate = can('masters.home-hero', 'create');
  const canEdit = can('masters.home-hero', 'edit');
  const canDelete = can('masters.home-hero', 'delete');

  const states = useBranchStates();
  /** `undefined` until the admin chooses; `null` = Global/Default. */
  const [selectedState, setSelectedState] = useState<ChosenState>(undefined);
  const [slides, setSlides] = useState<HomeHeroSlide[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [params, setParams] = useState<TableParams>(DEFAULT_PARAMS);
  const [eligible, setEligible] = useState<EligibleCount | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [editingSlide, setEditingSlide] = useState<HomeHeroSlide | null>(null);
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

  const addItem = async (item: StateItem) => {
    if (selectedState === undefined) return;
    setError('');
    try {
      const nextSort = slides.reduce((max, s) => Math.max(max, s.sortOrder + 1), 0);
      await createHomeHeroSlide(token, { itemType: item.type, itemId: item.id, state: selectedState, sortOrder: nextSort });
      setMessage(`Added "${item.title}" to ${stateLabel}.`);
      load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not add this item.');
    }
  };

  const saveSortOrder = async (slide: HomeHeroSlide, sortOrder: number) => {
    const { data } = await updateHomeHeroSlide(token, slide.id, { sortOrder });
    setSlides((prev) => prev.map((s) => (s.id === data.id ? data : s)));
    setMessage('Saved.');
    load();
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
    if (!(await confirm(`Remove "${slideTitle(slide)}" from this slider? This cannot be undone.`))) return;
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
          Type: slide.itemType === 'deal' ? 'Deal' : 'Product',
          Item: slideTitle(slide),
          Member: slide.deal?.vendor.businessName ?? slide.product?.vendor.businessName ?? '',
          Branch: slide.deal?.branch.name ?? '—',
          'Sort Order': slide.sortOrder,
          Eligible: slide.itemEligible ? 'Yes' : 'No',
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
  }, [slides, stateChosen]);

  const eligibleCount = eligible?.eligibleCount ?? 0;
  const publishable = eligibleCount >= MIN_ELIGIBLE_SLIDES;

  return (
    <div className="admin-page admin-page--wide">
      <title>Home Hero · MSD</title>
      <header className="page-head">
        <div>
          <h1>Home Hero</h1>
          <p>
            Choose a state, then add its deals and products. A slider goes public once it has {MIN_ELIGIBLE_SLIDES} eligible
            items; until then visitors see the Global / Default slider.
          </p>
        </div>
        <div className="page-head__actions">
          {canCreate && stateChosen && (
            <OutlinedButton onClick={() => addDialogRef.current?.show()}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              Add items
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
          if (state === undefined) setSlides([]);
        }}
      />

      {!stateChosen && <p className="field-hint">Choose a state (or Global / Default) to see and build its slider.</p>}

      {stateChosen && (
        <>
          <p className={publishable ? 'field-hint' : 'error-state'} role="status">
            {eligibleCount}/{MIN_ELIGIBLE_SLIDES} eligible items for {stateLabel}.{' '}
            {publishable
              ? 'This slider is live.'
              : `Add ${MIN_ELIGIBLE_SLIDES - eligibleCount} more eligible item(s) before this slider can go public${selectedState ? ' — the Global / Default slider shows instead until then' : ''}.`}
          </p>

          {message && <p className="field-hint" role="status">{message}</p>}
          {error && <p className="error-state" role="alert">{error}</p>}

          <sky-data-table
            ref={tableRef as RefObject<HTMLElement>}
            caption={`${stateLabel} slides`}
            columns={COLUMNS}
            rows={rows}
            total={total}
            page={params.page}
            page-size={params.pageSize}
            loading={loading}
            actions={actions}
          />
        </>
      )}

      {canCreate && stateChosen && (
        <Dialog ref={addDialogRef}>
          <div slot="headline">Add items — {stateLabel}</div>
          <div slot="content">
            <StateItemPicker
              token={token}
              base="/home-hero"
              state={selectedState}
              excludeIds={slides.map((s) => s.dealId ?? s.productId ?? '')}
              onPick={addItem}
            />
            {message && <p className="field-hint" role="status">{message}</p>}
            {error && <p className="error-state" role="alert">{error}</p>}
          </div>
          <div slot="actions">
            <TextButton onClick={() => addDialogRef.current?.close()}>Done</TextButton>
          </div>
        </Dialog>
      )}

      {canEdit && (
        <SortOrderDialog
          key={editingSlide?.id ?? 'edit-empty'}
          dialogRef={editDialogRef}
          slide={editingSlide ?? undefined}
          onSave={(sortOrder) => (editingSlide ? saveSortOrder(editingSlide, sortOrder) : Promise.resolve())}
          onClose={() => setEditingSlide(null)}
        />
      )}
      {ConfirmDialog}
    </div>
  );
}

/** Only the order changes; to show another item, remove the slide and add a new one. */
function SortOrderDialog({
  dialogRef,
  slide,
  onSave,
  onClose,
}: {
  dialogRef: RefObject<MdDialog | null>;
  slide?: HomeHeroSlide;
  onSave: (sortOrder: number) => Promise<void>;
  onClose?: () => void;
}) {
  const [sortOrder, setSortOrder] = useState(slide?.sortOrder ?? 0);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const saveButtonRef = useRef<MdFilledButton>(null);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await onSave(sortOrder);
      dialogRef.current?.close();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save this slide.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog ref={dialogRef} onClose={onClose}>
      <div slot="headline">Sort order</div>
      <div slot="content" className="form-grid">
        {slide && <p className="field-hint">{slideTitle(slide)} (to show another item, remove this slide and add a new one)</p>}
        <OutlinedTextField
          label="Sort order"
          type="number"
          min="0"
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
