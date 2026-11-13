import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import { Dialog, FilledButton, OutlinedButton, OutlinedTextField, OutlinedSelect, SelectOption, TextButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import {
  createBranch,
  createMyBranch,
  deleteDeal,
  listBranches,
  listDeals,
  listMyBranches,
  listMyDeals,
  setBranchStatus,
  setDealStatus,
  setMyBranchStatus,
  setMyDealStatus,
  updateBranch,
  updateMyBranch,
  type Branch,
  type BranchInput,
  type Deal,
  type OpeningHours,
  type WeekdayKey,
} from '../../../../api/rbac/vendors';
import { fromPriceLabel } from './deal-format';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useConfirmDialog } from '../../../components/confirm-dialog';
import { showSnackbar } from '../../../../snackbar/snackbar';
import { STATES, citiesForState } from '@skylabs-monorepo/shared-utils';

interface VendorBranchesProps {
  token: string | null;
  vendorId: string;
  isSelf: boolean;
  canEdit: boolean;
  /** Superadmin-only hard delete — no self-service equivalent exists (vendors can only
   *  Activate/Deactivate their own deals), so this is always `false` on the `isSelf` surface. */
  canDeleteDeal?: boolean;
}

/** Groups branches by their `state` field for a "N branches across M states" summary — states
 *  are not a stored entity anywhere in the backend (they come from the India location list), so
 *  this is pure client-side grouping. Branches with no state set are grouped under "Unspecified" so they're never silently
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
export function VendorBranches({ token, vendorId, isSelf, canEdit, canDeleteDeal = false }: VendorBranchesProps) {
  const navigate = useNavigate();
  // Deals are added and edited on the shared deal form (PLANNING §2.7).
  const dealFormPath = (dealId?: string) =>
    isSelf ? `/account/vendor-deals/${dealId ?? 'new'}` : `/account/members/${vendorId}/deals/${dealId ?? 'new'}`;
  // Deep-link support for a "New Deal Pending Approval" notification click (see
  // notification-bell.tsx) — both params are optional and purely additive; this page behaves
  // exactly as before when neither is present.
  const [searchParams] = useSearchParams();
  const dealIdParam = searchParams.get('dealId');
  const branchIdParam = searchParams.get('branchId');
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealsLoading, setDealsLoading] = useState(false);
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

  // Auto-selects the branch a notification deep-link points at, once branches have loaded —
  // a no-op when `branchIdParam` is absent or doesn't match a real branch (e.g. stale link).
  useEffect(() => {
    if (branchIdParam && branches.some((b) => b.id === branchIdParam)) {
      setSelectedBranchId(branchIdParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches, branchIdParam]);

  // Scrolls to the deal a notification deep-link points at, once that branch's deals have loaded.
  useEffect(() => {
    if (!dealIdParam || deals.length === 0) return;
    document.getElementById(`deal-${dealIdParam}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [deals, dealIdParam]);

  const reloadDeals = () => {
    if (!selectedBranchId) return;
    const requestId = ++dealsRequestToken.current;
    (isSelf ? listMyDeals(token, selectedBranchId) : listDeals(token, vendorId, selectedBranchId)).then(({ data }) => {
      if (requestId !== dealsRequestToken.current) return;
      setDeals(data);
    });
  };

  const saveBranch = async (input: BranchInput, existing?: Branch): Promise<Branch> => {
    if (existing) {
      const { data } = isSelf ? await updateMyBranch(token, existing.id, input) : await updateBranch(token, vendorId, existing.id, input);
      setBranches((prev) => prev.map((b) => (b.id === data.id ? data : b)));
      return data;
    }
    const { data } = isSelf ? await createMyBranch(token, input) : await createBranch(token, vendorId, input);
    setBranches((prev) => [data, ...prev]);
    return data;
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

  const doDeleteDeal = async (deal: Deal) => {
    if (!selectedBranchId) return;
    if (!(await confirm(`Delete "${deal.title}"? This cannot be undone.`))) return;
    try {
      await deleteDeal(token, vendorId, selectedBranchId, deal.id);
      reloadDeals();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not delete deal.');
    }
  };

  return (
    <div className="two-pane">
      <section className="panel" aria-label="Branches">
        <div className="page-head">
          <h2>Branches</h2>
          {canEdit && (
            <BranchDialog onSave={(input) => saveBranch(input).then((data) => { setError(''); return data; })} />
          )}
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
              {canEdit && (
                <OutlinedButton onClick={() => navigate(`${dealFormPath()}?branchId=${selectedBranchId}`)}>
                  <Icon slot="icon" aria-hidden="true">add</Icon>
                  Add deal
                </OutlinedButton>
              )}
            </div>
            {dealsLoading ? (
              <p className="loading-state">Loading deals…</p>
            ) : deals.length === 0 ? (
              <p className="empty-state">No deals on this branch yet.</p>
            ) : (
              <ul className="entity-list">
                {deals.map((deal) => (
                  <li key={deal.id} id={`deal-${deal.id}`}>
                    <div className={`entity-list__item${deal.id === dealIdParam ? ' entity-list__item--highlighted' : ''}`}>
                      <span className="role-list__name">
                        {deal.title}
                        <span className="field-hint"> · {fromPriceLabel(deal)}</span>
                      </span>
                      <span className={`status-pill ${deal.status === 'ACTIVE' ? 'status-pill--active' : 'status-pill--inactive'}`}>{deal.status}</span>
                    </div>
                    <div className="page-head__actions">
                      {canEdit && (
                        <OutlinedButton onClick={() => navigate(dealFormPath(deal.id))}>
                          <Icon slot="icon" aria-hidden="true">edit</Icon>
                          Edit
                        </OutlinedButton>
                      )}
                      {canEdit && (
                        <OutlinedButton onClick={() => toggleDealActive(deal)}>
                          {deal.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                        </OutlinedButton>
                      )}
                      {canDeleteDeal && <OutlinedButton onClick={() => doDeleteDeal(deal)}>Delete</OutlinedButton>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
      {ConfirmDialog}
    </div>
  );
}

const BRANCH_PINCODE_REGEX = /^\d{6}$/;

/** Same `(value: string) => string | null`, empty-is-valid pattern as vendor-profile-form.tsx's
 *  own `FIELD_VALIDATORS` — a light, client-side "does this look like a URL" check only. The
 *  actual link (host, whether it resolves to a place) is validated server-side by
 *  `googleMapsUrlResolver.provider.ts`, whose message is surfaced via `errors.mapLocationUrl`
 *  from the submit handler's catch block (see `BranchDialog`'s `submit`). */
export function validateMapLocationUrl(value: string): string | null {
  if (!value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? null : 'Enter a valid Google Maps link';
  } catch {
    return 'Enter a valid Google Maps link';
  }
}

export function validateBranchPincode(value: string): string | null {
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

const WEEKDAY_KEYS: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const LEGACY_HOURS_PATTERN = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Pre-migration `Branch.openingHours` rows were written as a plain string per day
 * (`"09:00-20:00"` / `"closed"`) — a convention that predates the current structured
 * `{ open, start, end }` per-day shape (`OpeningHoursSchema` on the server, `DayHours` here).
 * `Json?` columns carry no schema, so nothing ever migrated those rows. Left unnormalized, this
 * dialog would silently echo the legacy string blob straight back in the save payload for a
 * branch whose Operating Hours the admin never even touched, which the server's Zod schema then
 * rightly rejects (`expected object, received string`) — the actual root cause behind "editing
 * any field and saving" failing with a generic `VALIDATION_ERROR` on branches seeded before the
 * structured-hours migration. This is a one-time read-side compatibility shim, not a schema
 * change: the server contract stays exactly as strict as before, this just guarantees the value
 * this dialog holds (and ultimately re-submits) is always in the shape that contract expects,
 * regardless of which shape the branch happened to load with.
 */
export function normalizeOpeningHours(raw: unknown): OpeningHours {
  if (!raw || typeof raw !== 'object') return {};
  const result: OpeningHours = {};
  for (const key of WEEKDAY_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (value == null) continue;
    if (typeof value === 'string') {
      const match = LEGACY_HOURS_PATTERN.exec(value);
      result[key] = match ? { open: true, start: match[0].slice(0, 5), end: match[0].slice(6) } : { open: false };
    } else if (typeof value === 'object') {
      result[key] = value as { open: boolean; start?: string; end?: string };
    }
  }
  return result;
}

/** A structured 7-day operating-hours editor writing to `Branch.openingHours` (a loosely-
 *  structured `Json?` column — see `OpeningHours`'s own doc comment) — replaces having no UI at
 *  all for a field that already existed on the model. Each day is independently open/closed;
 *  open/close times only render (and only get submitted) for a day marked open. */
export function OpeningHoursEditor({ value, onChange }: { value: OpeningHours; onChange: (next: OpeningHours) => void }) {
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

/**
 * Branch create/edit dialog for this file's two-pane `VendorBranches`. No category step:
 * categories are open to every member (D10).
 */
export function BranchDialog({
  branch,
  onSave,
  dialogRef: externalDialogRef,
  hideTrigger,
}: {
  branch?: Branch;
  /** Resolves to the created/updated `Branch`. */
  onSave: (input: BranchInput) => Promise<Branch>;
  /** Lets a caller drive this dialog open from a trigger it renders itself (e.g.
   *  `vendor-wizard-branches.tsx`'s `BranchRow`, which owns a per-branch "Edit" button so opening
   *  one branch's dialog can never affect another's) instead of using this component's own
   *  built-in trigger button — same opt-in pattern as `DealDialog`'s own `dialogRef`/`hideTrigger`. */
  dialogRef?: RefObject<MdDialog | null>;
  hideTrigger?: boolean;
}) {
  const internalDialogRef = useRef<MdDialog>(null);
  const dialogRef = externalDialogRef ?? internalDialogRef;
  const [form, setForm] = useState({
    name: branch?.name ?? '',
    address: branch?.address ?? '',
    addressLine2: branch?.addressLine2 ?? '',
    city: branch?.city ?? '',
    state: branch?.state ?? '',
    pincode: branch?.pincode ?? '',
    mapLocationUrl: branch?.mapLocationUrl ?? '',
  });
  const [openingHours, setOpeningHours] = useState<OpeningHours>(() => normalizeOpeningHours(branch?.openingHours));
  const [errors, setErrors] = useState<Partial<Record<'name' | 'state' | 'city' | 'pincode' | 'mapLocationUrl', string>>>({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Same double-submit guard convention used elsewhere in this file (DealDialog's submittingRef).
  const submittingRef = useRef(false);

  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value, ...(key === 'state' ? { city: '' } : {}) }));
    setErrors((e) => (e[key as keyof typeof errors] ? { ...e, [key]: undefined } : e));
  };

  const submit = async () => {
    if (submittingRef.current) return;
    const nextErrors: typeof errors = {
      name: form.name.trim() ? undefined : 'Branch name is required.',
      state: form.state ? undefined : 'Select the state first.',
      city: form.city ? undefined : 'Select a city.',
      pincode: validateBranchPincode(form.pincode) ?? undefined,
      mapLocationUrl: validateMapLocationUrl(form.mapLocationUrl) ?? undefined,
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      setError('Fix the highlighted fields before saving.');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      const input: BranchInput = {
        name: form.name,
        address: form.address || undefined,
        addressLine2: form.addressLine2 || undefined,
        city: form.city,
        state: form.state,
        pincode: form.pincode || undefined,
        mapLocationUrl: form.mapLocationUrl.trim() || undefined,
        openingHours: Object.keys(openingHours).length > 0 ? openingHours : undefined,
      };
      await onSave(input);

      showSnackbar(branch ? 'Branch updated successfully.' : 'Branch created successfully.', { variant: 'success' });
      dialogRef.current?.close();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'VALIDATION_ERROR') {
        // Two different things share this one code, distinguished by whether a per-field
        // breakdown is present:
        //  - `validateBody`'s Zod schema failure — `details.fieldErrors` names the actual
        //    field(s) that failed (which may not be Map Location at all — e.g. a branch whose
        //    stored `openingHours` predates the current structured shape). Route each reported
        //    field to its own error slot instead of always blaming Map Location, so the real
        //    cause is visible and nothing is silently misattributed.
        //  - the Google Maps URL resolver's own `ApiError('VALIDATION_ERROR', message)` — no
        //    `details`, always about the Map Location field specifically.
        const fieldErrors = (err.details as { fieldErrors?: Record<string, string[]> } | undefined)?.fieldErrors;
        if (fieldErrors && Object.keys(fieldErrors).length > 0) {
          const known: typeof errors = {};
          const other: string[] = [];
          for (const [field, messages] of Object.entries(fieldErrors)) {
            const message = messages[0];
            if (field === 'name' || field === 'state' || field === 'city' || field === 'pincode' || field === 'mapLocationUrl') {
              known[field] = message;
            } else {
              other.push(`${field}: ${message}`);
            }
          }
          setErrors((e) => ({ ...e, ...known }));
          setError(other.length > 0 ? `Could not save: ${other.join('; ')}` : 'Fix the highlighted fields before saving.');
        } else {
          setErrors((e) => ({ ...e, mapLocationUrl: err.message }));
          setError('Fix the highlighted fields before saving.');
        }
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Could not save branch.');
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const cityOptions = citiesForState(form.state);

  return (
    <>
      {!hideTrigger && (
        <OutlinedButton onClick={() => dialogRef.current?.show()}>
          <Icon slot="icon" aria-hidden="true">{branch ? 'edit' : 'add'}</Icon>
          {branch ? 'Edit' : 'Add branch'}
        </OutlinedButton>
      )}
      <Dialog ref={dialogRef}>
        <div slot="headline">{branch ? 'Edit branch' : 'Add branch'}</div>
        <div slot="content" className="form-grid">
          <OutlinedTextField
            label="Branch Name"
            required
            value={form.name}
            onInput={(e: Event) => set('name', (e.target as HTMLInputElement).value)}
            error={Boolean(errors.name)}
          />
          {errors.name && <p className="error-state" role="alert">{errors.name}</p>}

          {/* State first, then its city: the branch lines up with the storefront location. */}
          <OutlinedSelect label="State" required value={form.state} error={Boolean(errors.state)} onChange={(e: Event) => set('state', (e.target as HTMLSelectElement).value)}>
            <SelectOption value="">
              <div slot="headline">Select a state</div>
            </SelectOption>
            {STATES.map((state) => (
              <SelectOption key={state} value={state}>
                <div slot="headline">{state}</div>
              </SelectOption>
            ))}
          </OutlinedSelect>

          {errors.state && <p className="error-state" role="alert">{errors.state}</p>}
          <OutlinedSelect label="City" required value={form.city} error={Boolean(errors.city)} onChange={(e: Event) => set('city', (e.target as HTMLSelectElement).value)} disabled={!form.state}>
            <SelectOption value="">
              <div slot="headline">{form.state ? 'Select a city' : 'Select a state first'}</div>
            </SelectOption>
            {cityOptions.map((city) => (
              <SelectOption key={city} value={city}>
                <div slot="headline">{city}</div>
              </SelectOption>
            ))}
          </OutlinedSelect>
          {errors.city && <p className="error-state" role="alert">{errors.city}</p>}
          <OutlinedTextField label="Address" value={form.address} onInput={(e: Event) => set('address', (e.target as HTMLInputElement).value)} />
          <OutlinedTextField label="Address line 2 (optional)" value={form.addressLine2} onInput={(e: Event) => set('addressLine2', (e.target as HTMLInputElement).value)} />

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
            label="Map Location"
            type="url"
            placeholder="Paste Google Maps location link"
            value={form.mapLocationUrl}
            onInput={(e: Event) => set('mapLocationUrl', (e.target as HTMLInputElement).value)}
            error={Boolean(errors.mapLocationUrl)}
          />
          {errors.mapLocationUrl && <p className="error-state" role="alert">{errors.mapLocationUrl}</p>}

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
