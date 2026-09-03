import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import type { MdFilledButton } from '@material/web/button/filled-button.js';
import { Dialog, FilledButton, OutlinedButton, OutlinedTextField, OutlinedSelect, SelectOption, TextButton, Icon, Tabs, PrimaryTab } from '@skylabs-monorepo/shared-ui/react';
import {
  approveDeal,
  createBranch,
  createDeal,
  createMyBranch,
  createMyDeal,
  listBranches,
  listDeals,
  listMyBranches,
  listMyDeals,
  listMyProducts,
  listVendorProducts,
  rejectDeal,
  setBranchStatus,
  setDealStatus,
  setMyBranchStatus,
  setMyDealStatus,
  updateBranch,
  updateDeal,
  updateMyBranch,
  updateMyDeal,
  type Branch,
  type BranchInput,
  type Category,
  type Deal,
  type DealInput,
  type DealPackageInput,
  type OpeningHours,
  type VendorProduct,
  type WeekdayKey,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { MediaUploader } from '../../../components/media-uploader';
import { useToast } from '../../../../toast/toast-context';
import { STATES, citiesForState } from '../../../../data/india-locations';
import { resolveCategoryTiers } from '../../../../utils/category-tree';

interface VendorBranchesProps {
  token: string | null;
  vendorId: string;
  isSelf: boolean;
  canEdit: boolean;
  canApproveDeal: boolean;
  /** The vendor's granted SERVICE categories (`listCategories({ type: 'SERVICE', vendorId })`)
   *  — a service Deal picks directly from these, no global Service master any more. */
  categories: Category[];
}

/** Groups branches by their `state` field for a "N branches across M states" summary — states
 *  are not a stored entity anywhere in the backend (see the direct-category-access plan's
 *  architecture notes), so this is pure client-side grouping, same approach as elsewhere in this
 *  app. Branches with no state set are grouped under "Unspecified" so they're never silently
 *  dropped from the count. */
export function groupBranchesByState(branches: Branch[]): { state: string; branches: Branch[] }[] {
  const groups = new Map<string, Branch[]>();
  for (const branch of branches) {
    const key = branch.state?.trim() || 'Unspecified';
    groups.set(key, [...(groups.get(key) ?? []), branch]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === 'Unspecified' ? 1 : b === 'Unspecified' ? -1 : a.localeCompare(b)))
    .map(([state, branches]) => ({ state, branches }));
}

/** Branch list + nested Deal list for a single vendor — reused for both the admin
 *  (`/vendors/:vendorId/branches...`) and self-service (`/vendors/me/branches...`) surfaces. */
export function VendorBranches({ token, vendorId, isSelf, canEdit, canApproveDeal, categories }: VendorBranchesProps) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [products, setProducts] = useState<VendorProduct[]>([]);
  // Guards against an in-flight branches/deals fetch for a PREVIOUS vendorId resolving after
  // the caller has already switched to a different vendorId (e.g. an admin browsing from one
  // vendor's detail page to another's without a full remount). Without this, a slower request
  // for vendor A can resolve after a faster request for vendor B already landed, silently
  // overwriting the correct vendor B branch list with vendor A's — the caller then unknowingly
  // selects a branch that belongs to a DIFFERENT vendor than the one `vendorId` now points to,
  // and the (correct) backend ownership check rejects it with a confusing "this branch does not
  // belong to your vendor" for what looks, from the UI, like the vendor's own branch. Bumped on
  // every vendorId/isSelf change; a resolving fetch only commits its result if its own captured
  // token still matches the latest one.
  const branchesRequestToken = useRef(0);
  const dealsRequestToken = useRef(0);

  useEffect(() => {
    // pageSize is capped at 100 server-side (PaginationQuerySchema) — 200 here 500s, which
    // would silently leave `products` empty and hide the "Add deal" button entirely.
    (isSelf ? listMyProducts(token, { status: 'active', pageSize: 100 }) : listVendorProducts(token, vendorId, { status: 'active', pageSize: 100 }))
      .then(({ data }) => setProducts(data))
      .catch(() => setProducts([]));
  }, [token, vendorId, isSelf]);

  const loadBranches = async () => {
    const requestId = ++branchesRequestToken.current;
    setBranchesLoading(true);
    setError('');
    try {
      const { data } = isSelf ? await listMyBranches(token) : await listBranches(token, vendorId);
      if (requestId !== branchesRequestToken.current) return; // superseded by a newer vendorId switch
      setBranches(data);
    } catch (err) {
      if (requestId !== branchesRequestToken.current) return;
      setError(err instanceof ApiRequestError ? err.message : 'Could not load branches.');
    } finally {
      if (requestId === branchesRequestToken.current) setBranchesLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
    setSelectedBranchId(null);
    setDeals([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId, isSelf]);

  useEffect(() => {
    if (!selectedBranchId) return;
    const requestId = ++dealsRequestToken.current;
    setDealsLoading(true);
    (isSelf ? listMyDeals(token, selectedBranchId) : listDeals(token, vendorId, selectedBranchId))
      .then(({ data }) => {
        if (requestId !== dealsRequestToken.current) return; // superseded by a newer branch/vendor switch
        setDeals(data);
      })
      .catch((err) => {
        if (requestId !== dealsRequestToken.current) return;
        setError(err instanceof ApiRequestError ? err.message : 'Could not load deals.');
      })
      .finally(() => {
        if (requestId === dealsRequestToken.current) setDealsLoading(false);
      });
  }, [token, vendorId, isSelf, selectedBranchId]);

  const stateGroups = useMemo(() => groupBranchesByState(branches), [branches]);

  const reloadDeals = () => {
    if (!selectedBranchId) return;
    const requestId = ++dealsRequestToken.current;
    (isSelf ? listMyDeals(token, selectedBranchId) : listDeals(token, vendorId, selectedBranchId)).then(({ data }) => {
      if (requestId !== dealsRequestToken.current) return;
      setDeals(data);
    });
  };

  const saveBranch = async (input: BranchInput, existing?: Branch) => {
    if (existing) {
      const { data } = isSelf ? await updateMyBranch(token, existing.id, input) : await updateBranch(token, vendorId, existing.id, input);
      setBranches((prev) => prev.map((b) => (b.id === data.id ? data : b)));
    } else {
      const { data } = isSelf ? await createMyBranch(token, input) : await createBranch(token, vendorId, input);
      setBranches((prev) => [data, ...prev]);
    }
  };

  const toggleBranchStatus = async (branch: Branch) => {
    try {
      const { data } = isSelf
        ? await setMyBranchStatus(token, branch.id, !branch.isActive)
        : await setBranchStatus(token, vendorId, branch.id, !branch.isActive);
      setBranches((prev) => prev.map((b) => (b.id === data.id ? data : b)));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change branch status.');
    }
  };

  const saveDeal = async (input: DealInput, existing?: Deal) => {
    if (!selectedBranchId) return;
    let result: Deal | undefined;
    if (existing) {
      const { data } = isSelf
        ? await updateMyDeal(token, selectedBranchId, existing.id, input)
        : await updateDeal(token, vendorId, selectedBranchId, existing.id, input);
      result = data;
    } else {
      const { data } = isSelf
        ? await createMyDeal(token, selectedBranchId, input)
        : await createDeal(token, vendorId, selectedBranchId, input);
      result = data;
    }
    reloadDeals();
    return result;
  };

  const toggleDealActive = async (deal: Deal) => {
    if (!selectedBranchId) return;
    try {
      const nextStatus = deal.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      isSelf
        ? await setMyDealStatus(token, selectedBranchId, deal.id, nextStatus)
        : await setDealStatus(token, vendorId, selectedBranchId, deal.id, nextStatus);
      reloadDeals();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change deal status.');
    }
  };

  const doApproveDeal = async (deal: Deal) => {
    if (!selectedBranchId) return;
    await approveDeal(token, vendorId, selectedBranchId, deal.id);
    reloadDeals();
  };

  const doRejectDeal = async (deal: Deal) => {
    if (!selectedBranchId) return;
    const reason = window.prompt('Reason for rejecting this deal?');
    if (!reason) return;
    await rejectDeal(token, vendorId, selectedBranchId, deal.id, reason);
    reloadDeals();
  };

  return (
    <div className="two-pane">
      <section className="panel" aria-label="Branches">
        <div className="page-head">
          <h2>Branches</h2>
          {canEdit && <BranchDialog onSave={(input) => saveBranch(input).then(() => setError(''))} />}
        </div>
        {error && <p className="error-state" role="alert">{error}</p>}
        {branchesLoading ? (
          <p className="loading-state">Loading branches…</p>
        ) : branches.length === 0 ? (
          <p className="empty-state">No branches yet.</p>
        ) : (
          <>
            <p className="field-hint">
              {branches.length} branch{branches.length === 1 ? '' : 'es'} across {stateGroups.length} state{stateGroups.length === 1 ? '' : 's'}.
            </p>
          <ul className="entity-list">
            {branches.map((branch) => (
              <li key={branch.id}>
                <button
                  type="button"
                  className={`entity-list__item${branch.id === selectedBranchId ? ' active' : ''}`}
                  onClick={() => setSelectedBranchId(branch.id)}
                  aria-current={branch.id === selectedBranchId ? 'true' : undefined}
                >
                  <span className="role-list__name">
                    {branch.name}
                    {branch._count && <span className="field-hint"> · {branch._count.deals} deal{branch._count.deals === 1 ? '' : 's'}</span>}
                  </span>
                  <span className={`status-pill ${branch.isActive ? 'status-pill--active' : 'status-pill--inactive'}`}>
                    {branch.isActive ? 'Active' : 'Inactive'}
                  </span>
                </button>
                {canEdit && (
                  <div className="page-head__actions">
                    <BranchDialog branch={branch} onSave={(input) => saveBranch(input, branch)} />
                    <OutlinedButton onClick={() => toggleBranchStatus(branch)}>
                      {branch.isActive ? 'Deactivate' : 'Activate'}
                    </OutlinedButton>
                  </div>
                )}
              </li>
            ))}
          </ul>
          </>
        )}
      </section>

      <section className="panel" aria-label="Deals">
        {!selectedBranchId ? (
          <p className="empty-state">Select a branch to manage its deals.</p>
        ) : (
          <>
            <div className="page-head">
              <h2>Deals</h2>
              {canEdit && (categories.length > 0 || products.length > 0) && (
                <DealDialog categories={categories} products={products} token={token} fixedBranchId={selectedBranchId ?? undefined} onSave={(input) => saveDeal(input)} />
              )}
            </div>
            {dealsLoading ? (
              <p className="loading-state">Loading deals…</p>
            ) : deals.length === 0 ? (
              <p className="empty-state">No deals on this branch yet.</p>
            ) : (
              <ul className="entity-list">
                {deals.map((deal) => (
                  <li key={deal.id}>
                    <div className="entity-list__item">
                      <span className="role-list__name">
                        {deal.title}
                        <span className="field-hint">
                          {' '}
                          · {deal.product ? `Product: ${deal.product.name}` : 'Service'}
                          {' '}
                          · ₹{deal.salePrice} (was ₹{deal.originalPrice})
                          {deal.durationMinutes && ` · ${deal.durationMinutes} min`}
                        </span>
                      </span>
                      <span className={`status-pill ${deal.status === 'ACTIVE' ? 'status-pill--active' : 'status-pill--inactive'}`}>
                        {deal.status} / {deal.approvalStatus}
                      </span>
                    </div>
                    {deal.approvalRejectionReason && <p className="error-state">Rejected: {deal.approvalRejectionReason}</p>}
                    <div className="page-head__actions">
                      {canEdit && <DealDialog categories={categories} products={products} deal={deal} token={token} fixedBranchId={selectedBranchId ?? undefined} onSave={(input) => saveDeal(input, deal)} />}
                      {canEdit && (
                        <OutlinedButton onClick={() => toggleDealActive(deal)}>
                          {deal.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                        </OutlinedButton>
                      )}
                      {canApproveDeal && deal.approvalStatus === 'PENDING' && (
                        <>
                          <FilledButton onClick={() => doApproveDeal(deal)}>Approve</FilledButton>
                          <OutlinedButton onClick={() => doRejectDeal(deal)}>Reject</OutlinedButton>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}

const BRANCH_PINCODE_REGEX = /^\d{6}$/;

/** Same `(value: string) => string | null`, empty-is-valid pattern as vendor-profile-form.tsx's
 *  own `FIELD_VALIDATORS` — mirrors the backend's `BranchFieldsSchema` range checks exactly
 *  (`z.number().min(-90).max(90)`/`.min(-180).max(180)` in vendor.schema.ts) so an out-of-range
 *  value is caught before submit, not just after a 422. */
function validateLatitude(value: string): string | null {
  if (!value.trim()) return null;
  const n = Number(value);
  if (Number.isNaN(n)) return 'Latitude must be a number';
  return n >= -90 && n <= 90 ? null : 'Latitude must be between -90 and 90';
}

function validateLongitude(value: string): string | null {
  if (!value.trim()) return null;
  const n = Number(value);
  if (Number.isNaN(n)) return 'Longitude must be a number';
  return n >= -180 && n <= 180 ? null : 'Longitude must be between -180 and 180';
}

function validateBranchPincode(value: string): string | null {
  if (!value.trim()) return null;
  return BRANCH_PINCODE_REGEX.test(value) ? null : 'Enter a valid 6-digit PIN code';
}

const WEEKDAYS: { key: WeekdayKey; label: string }[] = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

const DEFAULT_DAY_HOURS = { open: true, start: '09:00', end: '20:00' };

/** A structured 7-day operating-hours editor writing to `Branch.openingHours` (a loosely-
 *  structured `Json?` column — see `OpeningHours`'s own doc comment) — replaces having no UI at
 *  all for a field that already existed on the model. Each day is independently open/closed;
 *  open/close times only render (and only get submitted) for a day marked open. */
function OpeningHoursEditor({ value, onChange }: { value: OpeningHours; onChange: (next: OpeningHours) => void }) {
  const dayFor = (key: WeekdayKey) => value[key] ?? { open: false };

  const setDay = (key: WeekdayKey, patch: Partial<{ open: boolean; start: string; end: string }>) => {
    const current = dayFor(key);
    onChange({ ...value, [key]: { ...current, ...patch, ...(patch.open === true && !current.start ? DEFAULT_DAY_HOURS : {}) } });
  };

  return (
    <fieldset className="opening-hours-editor">
      <legend>Operating hours</legend>
      {WEEKDAYS.map(({ key, label }) => {
        const day = dayFor(key);
        return (
          <div className="opening-hours-editor__row" key={key}>
            <label className="opening-hours-editor__day">
              <input
                type="checkbox"
                checked={day.open}
                onChange={(e) => setDay(key, { open: e.target.checked })}
                aria-label={`${label} is open`}
              />
              {label}
            </label>
            {day.open ? (
              <>
                <label className="sr-only" htmlFor={`hours-${key}-start`}>{label} opening time</label>
                <input
                  id={`hours-${key}-start`}
                  type="time"
                  value={day.start ?? DEFAULT_DAY_HOURS.start}
                  onChange={(e) => setDay(key, { start: e.target.value })}
                />
                <span aria-hidden="true">–</span>
                <label className="sr-only" htmlFor={`hours-${key}-end`}>{label} closing time</label>
                <input
                  id={`hours-${key}-end`}
                  type="time"
                  value={day.end ?? DEFAULT_DAY_HOURS.end}
                  onChange={(e) => setDay(key, { end: e.target.value })}
                />
              </>
            ) : (
              <span className="field-hint">Closed</span>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}

/** Branch create/edit dialog — exported so it can be reused verbatim by the onboarding wizard's
 *  Step 2 (`vendor-wizard-branches.tsx`) as well as this file's own two-pane `VendorBranches`. */
export function BranchDialog({ branch, onSave }: { branch?: Branch; onSave: (input: BranchInput) => Promise<void> }) {
  const dialogRef = useRef<MdDialog>(null);
  const [form, setForm] = useState({
    name: branch?.name ?? '',
    address: branch?.address ?? '',
    city: branch?.city ?? '',
    state: branch?.state ?? '',
    pincode: branch?.pincode ?? '',
    latitude: branch?.latitude != null ? String(branch.latitude) : '',
    longitude: branch?.longitude != null ? String(branch.longitude) : '',
  });
  const [openingHours, setOpeningHours] = useState<OpeningHours>(branch?.openingHours ?? {});
  const [errors, setErrors] = useState<Partial<Record<'pincode' | 'latitude' | 'longitude', string>>>({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value, ...(key === 'state' ? { city: '' } : {}) }));
    setErrors((e) => (e[key as keyof typeof errors] ? { ...e, [key]: undefined } : e));
  };

  const submit = async () => {
    if (!form.name.trim()) {
      setError('Branch name is required.');
      return;
    }
    const nextErrors: typeof errors = {
      pincode: validateBranchPincode(form.pincode) ?? undefined,
      latitude: validateLatitude(form.latitude) ?? undefined,
      longitude: validateLongitude(form.longitude) ?? undefined,
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      setError('Fix the highlighted fields before saving.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const input: BranchInput = {
        name: form.name,
        address: form.address || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        pincode: form.pincode || undefined,
        latitude: form.latitude.trim() ? Number(form.latitude) : undefined,
        longitude: form.longitude.trim() ? Number(form.longitude) : undefined,
        openingHours: Object.keys(openingHours).length > 0 ? openingHours : undefined,
      };
      await onSave(input);
      dialogRef.current?.close();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save branch.');
    } finally {
      setSubmitting(false);
    }
  };

  const cityOptions = citiesForState(form.state);

  return (
    <>
      <OutlinedButton onClick={() => dialogRef.current?.show()}>
        <Icon slot="icon" aria-hidden="true">{branch ? 'edit' : 'add'}</Icon>
        {branch ? 'Edit' : 'Add branch'}
      </OutlinedButton>
      <Dialog ref={dialogRef}>
        <div slot="headline">{branch ? 'Edit branch' : 'Add branch'}</div>
        <div slot="content" className="form-grid">
          <OutlinedTextField label="Branch Name" value={form.name} onInput={(e: Event) => set('name', (e.target as HTMLInputElement).value)} />
          <OutlinedTextField label="Address" value={form.address} onInput={(e: Event) => set('address', (e.target as HTMLInputElement).value)} />

          <OutlinedSelect label="State" value={form.state} onChange={(e: Event) => set('state', (e.target as HTMLSelectElement).value)}>
            <SelectOption value="">
              <div slot="headline">Select a state</div>
            </SelectOption>
            {STATES.map((state) => (
              <SelectOption key={state} value={state}>
                <div slot="headline">{state}</div>
              </SelectOption>
            ))}
          </OutlinedSelect>

          <OutlinedSelect label="City" value={form.city} onChange={(e: Event) => set('city', (e.target as HTMLSelectElement).value)} disabled={!form.state}>
            <SelectOption value="">
              <div slot="headline">{form.state ? 'Select a city' : 'Select a state first'}</div>
            </SelectOption>
            {cityOptions.map((city) => (
              <SelectOption key={city} value={city}>
                <div slot="headline">{city}</div>
              </SelectOption>
            ))}
          </OutlinedSelect>

          <OutlinedTextField
            label="PIN Code"
            inputMode="numeric"
            maxLength={6}
            value={form.pincode}
            onInput={(e: Event) => set('pincode', (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6))}
            error={Boolean(errors.pincode)}
          />
          {errors.pincode && <p className="error-state" role="alert">{errors.pincode}</p>}
          <OutlinedTextField
            label="Latitude"
            type="number"
            value={form.latitude}
            onInput={(e: Event) => set('latitude', (e.target as HTMLInputElement).value)}
            error={Boolean(errors.latitude)}
          />
          {errors.latitude && <p className="error-state" role="alert">{errors.latitude}</p>}
          <OutlinedTextField
            label="Longitude"
            type="number"
            value={form.longitude}
            onInput={(e: Event) => set('longitude', (e.target as HTMLInputElement).value)}
            error={Boolean(errors.longitude)}
          />
          {errors.longitude && <p className="error-state" role="alert">{errors.longitude}</p>}

          <OpeningHoursEditor value={openingHours} onChange={setOpeningHours} />

          {error && <p className="error-state" role="alert">{error}</p>}
        </div>
        <div slot="actions">
          <TextButton onClick={() => dialogRef.current?.close()}>Cancel</TextButton>
          <FilledButton onClick={submit} disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</FilledButton>
        </div>
      </Dialog>
    </>
  );
}

type OfferingType = 'service' | 'product';

/**
 * A Deal always represents exactly one catalog item — a Service (bookable, needs a duration) or
 * a Product (no duration) — never both, never neither (enforced server-side in
 * vendor.service.ts). There is no global Service master any more (see the direct-category-access
 * plan): a service deal picks its own `categoryId`/`subcategoryId` directly, restricted to the
 * `categories` prop (the vendor's granted SERVICE categories); a product deal's categoryId/
 * subcategoryId are still derived from whichever vendor-owned Product is picked, since a Product
 * already carries its own category.
 *
 * Exported so the flat, cross-branch "Deals / Packages" page (`vendor-deals.tsx`) can reuse
 * this exact form instead of duplicating it. That page isn't already scoped to a single
 * branch the way this two-pane page is (branch is picked on the left before any deal shows),
 * so two optional additions support it without touching this page's own behavior:
 *  - `branches`: when supplied, an add-mode "Branch" selector is prepended to the form (and
 *    an edit-mode deal's branch is shown read-only, resolved from this list) — omitted here
 *    on this page's own two call sites, so no branch field renders and nothing changes.
 *  - `dialogRef`/`hideTrigger`: let a caller drive the dialog open/closed itself (e.g. from a
 *    `sky-data-table` row action) instead of using this component's own built-in trigger
 *    button — again opt-in, this page's own two call sites don't pass them.
 */
export function DealDialog({
  deal,
  categories,
  products,
  branches,
  token,
  fixedBranchId,
  dialogRef: externalDialogRef,
  hideTrigger,
  onSave,
  onClose,
}: {
  deal?: Deal;
  /** The vendor's granted SERVICE categories (`listCategories({ type: 'SERVICE', vendorId })`)
   *  — a flat list containing both top-level rows and their subcategories (parentId set); this
   *  component filters by `parentId` locally to build the Category → Subcategory cascade, same
   *  pattern as `products.tsx`'s `ProductFormDialog`. */
  categories: Category[];
  products: VendorProduct[];
  branches?: Branch[];
  token: string | null;
  /** The branch this dialog is already scoped to when the caller doesn't pass a `branches`
   *  selector (e.g. `VendorBranches`'s per-branch "Deals" tab, which knows its own
   *  `selectedBranchId` but never lets this dialog switch branches) — needed so `MediaUploader`
   *  knows the right branch to upload against even before the create-flow's own `branchId`
   *  state would otherwise resolve to one. */
  fixedBranchId?: string;
  dialogRef?: RefObject<MdDialog | null>;
  hideTrigger?: boolean;
  onSave: (input: DealInput, branchId?: string) => Promise<Deal | void>;
  onClose?: () => void;
}) {
  const internalDialogRef = useRef<MdDialog>(null);
  const dialogRef = externalDialogRef ?? internalDialogRef;
  const { showToast } = useToast();
  // Checked/set synchronously at the very top of submit(), before any await — a `submitting`
  // state guard alone can't stop a second click/tap/Enter that fires before React commits the
  // disabling re-render (same gap already fixed this session for TherapistFormDialog/
  // PackageFormDialog/checkout.tsx; DealDialog had the identical gap).
  const submittingRef = useRef(false);
  // Belt-and-suspenders on top of submittingRef: disables the actual DOM element synchronously,
  // in the same tick as the click, rather than waiting on React's `disabled={submitting}`
  // re-render to commit — closes the residual window where two clicks issued close enough
  // together can both reach submit() before either state update has visibly taken effect.
  const saveButtonRef = useRef<MdFilledButton>(null);
  const [branchId, setBranchId] = useState<string>(deal?.branchId ?? fixedBranchId ?? branches?.[0]?.id ?? '');
  const [form, setForm] = useState<DealInput>({
    categoryId: deal?.categoryId ?? '',
    subcategoryId: deal?.subcategoryId ?? undefined,
    productId: deal?.productId ?? undefined,
    title: deal?.title ?? '',
    slug: deal?.slug ?? '',
    originalPrice: deal?.originalPrice ?? '',
    salePrice: deal?.salePrice ?? '',
    durationMinutes: deal?.durationMinutes ?? undefined,
    shortDescription: deal?.shortDescription ?? undefined,
  });
  // Derived, never independently set — a Product picked in the always-visible "Product" select
  // below IS the signal (matches the backend's own `productId`-presence convention exactly, see
  // this component's own module doc comment). No separate "Offering type" UI control exists.
  const offeringType: OfferingType = form.productId ? 'product' : 'service';
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Tracks the entity MediaUploader should upload against — starts as the existing deal being
  // edited (already has an id), or undefined for a fresh create; set to the server's response
  // the moment `onSave` resolves, so a brand-new deal's id becomes available to MediaUploader
  // within the same dialog session instead of requiring a separate edit pass.
  const [savedDeal, setSavedDeal] = useState<Deal | undefined>(deal);
  // Purely a display grouping — every field still lives in the same `form`/`packages` state and
  // is still validated by `submit()` regardless of which tab is active. The "Pricing" tab shows
  // the Packages repeater for a Service offering (that IS its pricing — see DealPackage's schema
  // doc comment in msd-api) or the plain Original/Sale price fields for a Product.
  const [activeDealTab, setActiveDealTab] = useState<'general' | 'pricing' | 'media'>('general');
  const DEAL_TAB_DEFS = [
    { key: 'general' as const, label: 'General' },
    { key: 'pricing' as const, label: offeringType === 'service' ? 'Packages' : 'Pricing' },
    { key: 'media' as const, label: 'Media' },
  ];

  // A service deal's own duration/price menu — a real child table (DealPackage), never a
  // top-level single duration+price (see DealPackage's schema doc comment in msd-api). `id`
  // present on an entry = update that existing row on save; absent = create a new one — the
  // whole array is diffed server-side by `id` (vendor.service.ts#updateDeal).
  const [packages, setPackages] = useState<DealPackageInput[]>(
    deal?.packages?.map((p) => ({
      id: p.id,
      durationMinutes: p.durationMinutes,
      sellingPrice: Number(p.sellingPrice),
      originalPrice: p.originalPrice != null ? Number(p.originalPrice) : undefined,
      isActive: p.isActive,
      sortOrder: p.sortOrder,
    })) ?? [],
  );
  const setPackage = (index: number, patch: Partial<DealPackageInput>) =>
    setPackages((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  const addPackage = () => setPackages((prev) => [...prev, { durationMinutes: 30, sellingPrice: 0 }]);
  const removePackage = (index: number) => setPackages((prev) => prev.filter((_, i) => i !== index));

  /** Picking a real Product derives the Deal's categoryId/subcategoryId from it (a Product
   *  already carries its own category, the same way a Service picker used to, before the
   *  global Service master was removed) and switches this dialog into product mode. Picking
   *  "None" (`id === ''`) clears `productId` — the symmetric reset back to service mode, doing
   *  the same job the old separate "Offering type" toggle's `onChange` used to. */
  const selectProduct = (id: string) => {
    if (!id) {
      setForm((f) => ({ ...f, productId: undefined, categoryId: '', subcategoryId: undefined, durationMinutes: undefined }));
      return;
    }
    const product = products.find((p) => p.id === id);
    setForm((f) => ({
      ...f,
      productId: id,
      categoryId: product?.categoryId ?? f.categoryId,
      subcategoryId: product?.subcategoryId ?? undefined,
      durationMinutes: undefined,
    }));
  };

  /** Service offering only — category/subcategory/(optional) type are picked directly (no
   *  catalog item to derive them from any more), restricted to the vendor's granted SERVICE
   *  categories. `subcategoryTierId`/`selectedTypeId` split apart whatever `form.subcategoryId`
   *  currently holds — see `resolveCategoryTiers`'s doc comment for why no separate UI-only
   *  state is needed to track the extra tier. */
  const parentCategories = categories.filter((c) => !c.parentId);
  const { subcategoryOptions, typeOptions, subcategoryTierId, selectedTypeId } = resolveCategoryTiers(
    categories,
    form.categoryId,
    form.subcategoryId,
  );

  const submit = async () => {
    if (submittingRef.current) return;
    if (branches && !deal && !branchId) {
      setError('Select a branch.');
      return;
    }
    if (!form.title.trim() || !form.slug.trim() || !form.categoryId) {
      setError('Title, slug, and category are required.');
      return;
    }
    if (offeringType === 'product' && !form.productId) {
      setError('Select a product.');
      return;
    }
    if (offeringType === 'product' && (!form.originalPrice || !form.salePrice)) {
      setError('Original price and sale price are required.');
      return;
    }

    let payload = { ...form };

    if (offeringType === 'service') {
      if (packages.length === 0) {
        setError('At least one package (duration + price) is required for a service deal.');
        return;
      }
      for (const p of packages) {
        if (!p.durationMinutes || p.durationMinutes <= 0) {
          setError('Every package needs a duration greater than 0.');
          return;
        }
        if (p.sellingPrice == null || p.sellingPrice < 0) {
          setError('Every package needs a selling price of 0 or more.');
          return;
        }
        if (p.originalPrice !== undefined && p.originalPrice < p.sellingPrice) {
          setError("Each package's original price must be greater than or equal to its selling price.");
          return;
        }
      }
      // The Deal's own originalPrice/salePrice/durationMinutes are a synced "from price"/
      // default-duration display cache (see DealPackage's schema doc comment in msd-api) — the
      // server re-syncs them to the cheapest active package right after save regardless, but the
      // create/update schema still requires *some* value up front, so derive one here from the
      // cheapest package the admin actually entered rather than asking them to fill a redundant,
      // now-meaningless single duration+price pair.
      const cheapest = packages.reduce((min, p) => (p.sellingPrice < min.sellingPrice ? p : min), packages[0]);
      payload = {
        ...payload,
        durationMinutes: cheapest.durationMinutes,
        salePrice: String(cheapest.sellingPrice),
        originalPrice: String(cheapest.originalPrice ?? cheapest.sellingPrice),
        packages,
      };
    } else {
      delete payload.durationMinutes;
      delete payload.packages;
    }

    submittingRef.current = true;
    // Disables the real DOM element in the same synchronous tick, rather than waiting on
    // React's `disabled={submitting}` re-render to commit — see saveButtonRef's own doc comment.
    if (saveButtonRef.current) saveButtonRef.current.disabled = true;
    setSubmitting(true);
    setError('');
    try {
      const result = await onSave(payload, branches ? branchId : undefined);
      // Fired only here, after the API call has actually resolved — never optimistically, and
      // never for a failed request (see the catch block below, which shows an inline error
      // instead). Wording distinguishes Service vs Product per the offering type actually
      // submitted, and create vs update, matching what the caller just did.
      const kind = offeringType === 'service' ? 'Service' : 'Product';
      showToast(`${kind} ${deal ? 'updated' : 'added'} successfully`);
      if (!deal && result) {
        // A fresh create — keep the dialog open so MediaUploader can flush any staged photos/
        // video against the new id; an edit's dialog closes immediately as before, since
        // MediaUploader already had a real entityId the whole time (nothing was staged).
        setSavedDeal(result);
      } else {
        dialogRef.current?.close();
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save deal.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <>
      {!hideTrigger && (
        <OutlinedButton onClick={() => dialogRef.current?.show()}>
          <Icon slot="icon" aria-hidden="true">{deal ? 'edit' : 'add'}</Icon>
          {deal ? 'Edit' : 'Add deal'}
        </OutlinedButton>
      )}
      <Dialog ref={dialogRef} onClose={onClose}>
        <div slot="headline">{deal ? 'Edit deal' : 'Add deal'}</div>
        <div slot="content">
          <div className="admin-tabs-wrap">
            <Tabs
              className="admin-tabs"
              onChange={(e) => setActiveDealTab(DEAL_TAB_DEFS[(e.target as unknown as { activeTabIndex: number }).activeTabIndex].key)}
            >
              {DEAL_TAB_DEFS.map((tab) => (
                <PrimaryTab key={tab.key} active={activeDealTab === tab.key}>{tab.label}</PrimaryTab>
              ))}
            </Tabs>
          </div>

          {activeDealTab === 'general' && (
            <div className="form-grid">
              {branches && (
                deal ? (
                  <p className="field-hint">Branch: {branches.find((b) => b.id === deal.branchId)?.name ?? deal.branch?.name ?? '—'} (cannot be changed)</p>
                ) : (
                  <OutlinedSelect label="Branch" value={branchId} onChange={(e: Event) => setBranchId((e.target as HTMLSelectElement).value)}>
                    {branches.map((b) => (
                      <SelectOption key={b.id} value={b.id}>
                        <div slot="headline">{b.name}</div>
                      </SelectOption>
                    ))}
                  </OutlinedSelect>
                )
              )}
              {/* No separate "Offering type" control — picking a real Product here IS the
                  signal (matches the backend's own productId-presence convention exactly, see
                  this component's own module doc comment); leaving it at "None" is a service
                  deal, reached via the Category/Subcategory/Type pickers below instead. */}
              <OutlinedSelect
                label="Product (leave as None for a service deal)"
                value={form.productId ?? ''}
                onChange={(e: Event) => selectProduct((e.target as HTMLSelectElement).value)}
              >
                <SelectOption value="">
                  <div slot="headline">— None (Service deal) —</div>
                </SelectOption>
                {products.map((p) => (
                  <SelectOption key={p.id} value={p.id}>
                    <div slot="headline">{p.name}</div>
                  </SelectOption>
                ))}
              </OutlinedSelect>

              {offeringType === 'service' ? (
                <>
                  <OutlinedSelect
                    label="Category"
                    value={form.categoryId}
                    onChange={(e: Event) => setForm((f) => ({ ...f, categoryId: (e.target as HTMLSelectElement).value, subcategoryId: undefined }))}
                  >
                    <SelectOption value="">
                      <div slot="headline">Select a category</div>
                    </SelectOption>
                    {parentCategories.map((c) => (
                      <SelectOption key={c.id} value={c.id}>
                        <div slot="headline">{c.name}</div>
                      </SelectOption>
                    ))}
                  </OutlinedSelect>

                  {subcategoryOptions.length > 0 && (
                    <OutlinedSelect
                      label="Subcategory (optional)"
                      value={subcategoryTierId ?? ''}
                      onChange={(e: Event) => setForm((f) => ({ ...f, subcategoryId: (e.target as HTMLSelectElement).value || undefined }))}
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

                  {/* 3rd, Type tier (e.g. "Swedish Massage" under "Body Massage") — optional and
                      only shown once the chosen Subcategory actually has children; a Subcategory
                      with none (e.g. "Cleaning") skips straight to using it as-is, unchanged from
                      before. Picking a Type here becomes the Deal's own `subcategoryId` (see
                      `resolveCategoryTiers`'s doc comment). */}
                  {typeOptions.length > 0 && (
                    <OutlinedSelect
                      label="Type (optional)"
                      value={selectedTypeId ?? ''}
                      onChange={(e: Event) => {
                        const value = (e.target as HTMLSelectElement).value;
                        setForm((f) => ({ ...f, subcategoryId: value || subcategoryTierId }));
                      }}
                    >
                      <SelectOption value="">
                        <div slot="headline">None</div>
                      </SelectOption>
                      {typeOptions.map((c) => (
                        <SelectOption key={c.id} value={c.id}>
                          <div slot="headline">{c.name}</div>
                        </SelectOption>
                      ))}
                    </OutlinedSelect>
                  )}
                  {parentCategories.length === 0 && (
                    <p className="empty-state">This business has no granted Service categories yet — grant one under Business Modules &amp; Category Access first.</p>
                  )}
                </>
              ) : (
                form.categoryId && (
                  <p className="field-hint">Category: {products.find((p) => p.id === form.productId)?.category?.name ?? form.categoryId}</p>
                )
              )}

              <OutlinedTextField label="Title" value={form.title} onInput={(e: Event) => setForm((f) => ({ ...f, title: (e.target as HTMLInputElement).value }))} />
              <OutlinedTextField label="Slug" value={form.slug} onInput={(e: Event) => setForm((f) => ({ ...f, slug: (e.target as HTMLInputElement).value }))} />
              <OutlinedTextField label="Short description" value={form.shortDescription ?? ''} onInput={(e: Event) => setForm((f) => ({ ...f, shortDescription: (e.target as HTMLInputElement).value }))} />
            </div>
          )}

          {activeDealTab === 'pricing' && (
            <div className="form-grid">
              {offeringType === 'product' ? (
                <>
                  <OutlinedTextField label="Original price" value={form.originalPrice} onInput={(e: Event) => setForm((f) => ({ ...f, originalPrice: (e.target as HTMLInputElement).value }))} />
                  <OutlinedTextField label="Sale price" value={form.salePrice} onInput={(e: Event) => setForm((f) => ({ ...f, salePrice: (e.target as HTMLInputElement).value }))} />
                </>
              ) : (
                <fieldset>
                  <legend>Packages</legend>
                  <p className="field-hint">Every duration/price option a customer can select — at least one is required. For example: 30 Min → ₹999, 60 Min → ₹1,499.</p>
                  {packages.map((pkg, i) => (
                    <div className="form-grid" key={pkg.id ?? `new-${i}`}>
                      <OutlinedTextField
                        label="Duration (minutes)"
                        type="number"
                        value={pkg.durationMinutes ? String(pkg.durationMinutes) : ''}
                        onInput={(e: Event) => setPackage(i, { durationMinutes: Number((e.target as HTMLInputElement).value) || 0 })}
                      />
                      <OutlinedTextField
                        label="Selling price"
                        type="number"
                        value={pkg.sellingPrice ? String(pkg.sellingPrice) : ''}
                        onInput={(e: Event) => setPackage(i, { sellingPrice: Number((e.target as HTMLInputElement).value) || 0 })}
                      />
                      <OutlinedTextField
                        label="Original price (optional)"
                        type="number"
                        value={pkg.originalPrice !== undefined ? String(pkg.originalPrice) : ''}
                        onInput={(e: Event) => setPackage(i, { originalPrice: Number((e.target as HTMLInputElement).value) || undefined })}
                      />
                      <OutlinedButton onClick={() => removePackage(i)}>
                        <Icon slot="icon" aria-hidden="true">delete</Icon>
                        Remove
                      </OutlinedButton>
                    </div>
                  ))}
                  <OutlinedButton onClick={addPackage}>
                    <Icon slot="icon" aria-hidden="true">add</Icon>
                    Add package
                  </OutlinedButton>
                </fieldset>
              )}
            </div>
          )}

          {activeDealTab === 'media' && (
            <MediaUploader
              entityType="deal"
              entityId={savedDeal?.id ?? null}
              branchId={savedDeal?.branchId ?? (branches ? branchId : fixedBranchId)}
              existingImages={savedDeal?.mediaImages ?? []}
              existingVideo={savedDeal?.mediaVideo ?? null}
              token={token}
            />
          )}

          {error && <p className="error-state" role="alert">{error}</p>}
        </div>
        <div slot="actions">
          <TextButton onClick={() => dialogRef.current?.close()}>Cancel</TextButton>
          <FilledButton ref={saveButtonRef} onClick={submit} disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</FilledButton>
        </div>
      </Dialog>
    </>
  );
}
