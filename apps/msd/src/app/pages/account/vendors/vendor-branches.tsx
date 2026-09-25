import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import type { MdFilledButton } from '@material/web/button/filled-button.js';
import { Dialog, FilledButton, OutlinedButton, OutlinedTextField, OutlinedSelect, SelectOption, TextButton, Icon, Tabs, PrimaryTab } from '@skylabs-monorepo/shared-ui/react';
import {
  approveDeal,
  createBranch,
  createDeal,
  createMyBranch,
  createMyDeal,
  deleteDeal,
  getBranchCategoryAccess,
  getMyBranchCategoryAccess,
  listBranches,
  listCategories,
  listDeals,
  listMyBranches,
  listMyDeals,
  listMyProducts,
  listVendorProducts,
  rejectDeal,
  setBranchCategoryAccess,
  setBranchStatus,
  setDealStatus,
  setMyBranchStatus,
  setMyDealStatus,
  updateBranch,
  updateDeal,
  updateMyBranch,
  updateMyDeal,
  type Branch,
  type BranchCategoryAccessRow,
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

interface VendorBranchesProps {
  token: string | null;
  vendorId: string;
  isSelf: boolean;
  canEdit: boolean;
  canApproveDeal: boolean;
  /** Superadmin-only hard delete — no self-service equivalent exists (vendors can only
   *  Activate/Deactivate their own deals), so this is always `false` on the `isSelf` surface. */
  canDeleteDeal?: boolean;
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
export function VendorBranches({ token, vendorId, isSelf, canEdit, canApproveDeal, canDeleteDeal = false, categories }: VendorBranchesProps) {
  // Deep-link support for a "New Deal Pending Approval" notification click (see
  // notification-bell.tsx) — both params are optional and purely additive; this page behaves
  // exactly as before when neither is present.
  const [searchParams] = useSearchParams();
  const dealIdParam = searchParams.get('dealId');
  const branchIdParam = searchParams.get('branchId');
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

  const doDeleteDeal = async (deal: Deal) => {
    if (!selectedBranchId) return;
    if (!window.confirm(`Delete "${deal.title}"? This cannot be undone.`)) return;
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
            <BranchDialog
              token={token}
              vendorId={vendorId}
              isSelf={isSelf}
              onSave={(input) => saveBranch(input).then((data) => { setError(''); return data; })}
            />
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
                    <BranchDialog branch={branch} token={token} vendorId={vendorId} isSelf={isSelf} onSave={(input) => saveBranch(input, branch)} />
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
                <DealDialog categories={categories} products={products} token={token} vendorId={vendorId} isSelf={isSelf} fixedBranchId={selectedBranchId ?? undefined} onSave={(input) => saveDeal(input)} />
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
                        <span className="field-hint">
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
                      {canEdit && <DealDialog categories={categories} products={products} deal={deal} token={token} vendorId={vendorId} isSelf={isSelf} fixedBranchId={selectedBranchId ?? undefined} onSave={(input) => saveDeal(input, deal)} />}
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
                      {canDeleteDeal && <OutlinedButton onClick={() => doDeleteDeal(deal)}>Delete</OutlinedButton>}
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
 *  own `FIELD_VALIDATORS` — a light, client-side "does this look like a URL" check only. The
 *  actual link (host, whether it resolves to a place) is validated server-side by
 *  `googleMapsUrlResolver.provider.ts`, whose message is surfaced via `errors.mapLocationUrl`
 *  from the submit handler's catch block (see `BranchDialog`'s `submit`). */
function validateMapLocationUrl(value: string): string | null {
  if (!value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? null : 'Enter a valid Google Maps link';
  } catch {
    return 'Enter a valid Google Maps link';
  }
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

/**
 * Branch create/edit dialog — exported so it can be reused verbatim by the onboarding wizard's
 * Step 2 (`vendor-wizard-branches.tsx`) as well as this file's own two-pane `VendorBranches`.
 *
 * Also owns the branch's Service/Therapy "Categories & Subcategories" mapping (folded in from the
 * now-deleted `branch-category-access-dialog.tsx` — see that file's own former doc comment for the
 * original design). Service/Therapy category access is per-branch only now: there's no more
 * vendor-wide grant screen for those two types (see `VendorProductCategoryAccess` in
 * `vendor-wizard-modules.tsx`, which keeps that grant screen for Product alone), so the category
 * picker here fetches every active top-level SERVICE + THERAPY category unfiltered by vendor
 * (`listCategories({ type })`, no `vendorId`) — this dialog IS the granting surface for those two
 * types now. The backend (`setBranchCategoryAccess`) auto-creates the vendor's `VendorCategoryAccess`
 * grant the first time any branch maps a category, so no separate "grant it first" step exists any
 * more either.
 *
 * Admin-only (`!isSelf`): there is no self-service `PUT` route for a branch's category mapping
 * (see msd-api's `GET /vendors/me/branches/:branchId/category-access` route doc comment — reading
 * your own branch's mapping is self-service, editing it stays an admin/Data-Entry action), so the
 * whole Categories & Subcategories section is omitted entirely on the `isSelf` surface rather than
 * rendering controls that would silently fail to save.
 */
export function BranchDialog({
  branch,
  onSave,
  token,
  vendorId,
  isSelf = false,
  dialogRef: externalDialogRef,
  hideTrigger,
}: {
  branch?: Branch;
  /** Resolves to the created/updated `Branch` (never just `void`) — for a brand-new branch this
   *  is the only place its real `id` becomes available, needed to save this dialog's own category
   *  mapping against the right branch right after creation. */
  onSave: (input: BranchInput) => Promise<Branch>;
  token: string | null;
  vendorId: string;
  /** True on the self-service "Branches & Deals" surface — see this component's own doc comment
   *  on why the category section is entirely omitted rather than attempting a save that has no
   *  backend route to land on. Defaults to `false` since most call sites are admin-scoped. */
  isSelf?: boolean;
  /** Lets a caller drive this dialog open from more than one trigger (e.g. `vendor-wizard-branches.tsx`'s
   *  "Edit" and "Categories" buttons both opening this same dialog instance) instead of using this
   *  component's own built-in trigger button — same opt-in pattern as `DealDialog`'s own
   *  `dialogRef`/`hideTrigger`. */
  dialogRef?: RefObject<MdDialog | null>;
  hideTrigger?: boolean;
}) {
  const internalDialogRef = useRef<MdDialog>(null);
  const dialogRef = externalDialogRef ?? internalDialogRef;
  const { showToast } = useToast();
  const [form, setForm] = useState({
    name: branch?.name ?? '',
    address: branch?.address ?? '',
    city: branch?.city ?? '',
    state: branch?.state ?? '',
    pincode: branch?.pincode ?? '',
    mapLocationUrl: branch?.mapLocationUrl ?? '',
  });
  const [openingHours, setOpeningHours] = useState<OpeningHours>(branch?.openingHours ?? {});
  const [errors, setErrors] = useState<Partial<Record<'pincode' | 'mapLocationUrl', string>>>({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Same double-submit guard convention used elsewhere in this file (DealDialog's submittingRef).
  const submittingRef = useRef(false);

  // ─── Categories & Subcategories (admin-only — see this component's own doc comment) ─────────
  const [serviceCategories, setServiceCategories] = useState<Category[]>([]);
  const [therapyCategories, setTherapyCategories] = useState<Category[]>([]);
  const [categoryMap, setCategoryMap] = useState<Map<string, Set<string>>>(new Map());
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState('');

  // Flat set of every active top-level SERVICE/THERAPY category (top level + children) — fetched
  // once on mount (same "fetch alongside the dialog it belongs to" pattern as this file's own
  // `DealDialog`'s branch-category-access effect), unfiltered by vendor (see this component's own
  // doc comment).
  const flatCategories = [...serviceCategories, ...therapyCategories];
  const topLevelCategories = flatCategories.filter((c) => !c.parentId);
  const branchId = branch?.id;

  useEffect(() => {
    if (isSelf) return; // no self-service category editing — see this component's own doc comment
    let cancelled = false;
    setCategoriesLoading(true);
    setCategoriesError('');
    (async () => {
      try {
        const [{ data: svc }, { data: thr }] = await Promise.all([
          listCategories(token, { type: 'SERVICE' }),
          listCategories(token, { type: 'THERAPY' }),
        ]);
        if (cancelled) return;
        setServiceCategories(svc);
        setTherapyCategories(thr);
        if (branchId) {
          const { data: access } = await getBranchCategoryAccess(token, vendorId, branchId);
          if (cancelled) return;
          const next = new Map<string, Set<string>>();
          access.forEach((row) => next.set(row.categoryId, new Set(row.subcategories.map((s) => s.subcategoryId))));
          setCategoryMap(next);
        } else {
          setCategoryMap(new Map());
        }
      } catch (err) {
        if (cancelled) return;
        setCategoriesError(err instanceof ApiRequestError ? err.message : 'Could not load categories.');
      } finally {
        if (!cancelled) setCategoriesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, vendorId, branchId, isSelf]);

  const toggleCategory = (categoryId: string) =>
    setCategoryMap((prev) => {
      const next = new Map(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.set(categoryId, new Set());
      return next;
    });

  const toggleSubcategory = (categoryId: string, subcategoryId: string) =>
    setCategoryMap((prev) => {
      const next = new Map(prev);
      // A subcategory can't be enabled without its parent — auto-check the parent category too
      // if the user reaches for a subcategory checkbox first (mirrors BranchDialog's own
      // State-clears-City idiom: related fields reset/adjust in the same state update).
      const current = next.get(categoryId) ?? new Set<string>();
      const subs = new Set(current);
      if (subs.has(subcategoryId)) subs.delete(subcategoryId);
      else subs.add(subcategoryId);
      next.set(categoryId, subs);
      return next;
    });

  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value, ...(key === 'state' ? { city: '' } : {}) }));
    setErrors((e) => (e[key as keyof typeof errors] ? { ...e, [key]: undefined } : e));
  };

  const submit = async () => {
    if (submittingRef.current) return;
    if (!form.name.trim()) {
      setError('Branch name is required.');
      return;
    }
    const nextErrors: typeof errors = {
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
        city: form.city || undefined,
        state: form.state || undefined,
        pincode: form.pincode || undefined,
        mapLocationUrl: form.mapLocationUrl.trim() || undefined,
        openingHours: Object.keys(openingHours).length > 0 ? openingHours : undefined,
      };
      const savedBranch = await onSave(input);

      if (!isSelf) {
        try {
          const mappings = [...categoryMap.entries()].map(([categoryId, subcategoryIds]) => ({ categoryId, subcategoryIds: [...subcategoryIds] }));
          await setBranchCategoryAccess(token, vendorId, savedBranch.id, { mappings });
        } catch (categoryErr) {
          // The branch itself already saved successfully above — never leave the admin unsure
          // whether that part worked, and never silently drop the category data either.
          const message = categoryErr instanceof ApiRequestError ? categoryErr.message : 'Could not save categories.';
          const combined = `Branch saved, but categories could not be saved: ${message}`;
          setError(combined);
          showToast(combined, 'error');
          return; // keep the dialog open so the admin can retry the category save
        }
      }

      showToast(branch ? 'Branch updated successfully.' : 'Branch created successfully.');
      dialogRef.current?.close();
    } catch (err) {
      // The Google Maps URL resolver throws a single `ApiError('VALIDATION_ERROR', message)`
      // with no per-field `details.fieldErrors` breakdown (it's not a Zod validation error) —
      // surface it directly under the Map Location field rather than only as a generic banner.
      if (err instanceof ApiRequestError && err.code === 'VALIDATION_ERROR') {
        setErrors((e) => ({ ...e, mapLocationUrl: err.message }));
        setError('Fix the highlighted fields before saving.');
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
            label="Map Location"
            type="url"
            placeholder="Paste Google Maps location link"
            value={form.mapLocationUrl}
            onInput={(e: Event) => set('mapLocationUrl', (e.target as HTMLInputElement).value)}
            error={Boolean(errors.mapLocationUrl)}
          />
          {errors.mapLocationUrl && <p className="error-state" role="alert">{errors.mapLocationUrl}</p>}

          <OpeningHoursEditor value={openingHours} onChange={setOpeningHours} />

          {!isSelf && (
            <>
              <h3 className="section-title">Categories &amp; Subcategories</h3>
              {categoriesLoading ? (
                <p className="loading-state">Loading categories…</p>
              ) : categoriesError ? (
                <p className="error-state" role="alert">{categoriesError}</p>
              ) : topLevelCategories.length === 0 ? (
                <p className="empty-state">No active Service or Therapy categories exist in Category Master yet.</p>
              ) : (
                <div className="category-grant-grid">
                  {topLevelCategories.map((category) => {
                    const subcategoryOptions = flatCategories.filter((c) => c.parentId === category.id);
                    const checked = categoryMap.has(category.id);
                    return (
                      <div className="category-grant-grid__group" key={category.id}>
                        <label className="category-grant-grid__option">
                          <input type="checkbox" checked={checked} onChange={() => toggleCategory(category.id)} />
                          {category.name}
                        </label>
                        {checked && subcategoryOptions.length > 0 && (
                          <div className="category-grant-grid__subgroup">
                            {subcategoryOptions.map((sub) => (
                              <label key={sub.id} className="category-grant-grid__option category-grant-grid__option--indented">
                                <input
                                  type="checkbox"
                                  checked={categoryMap.get(category.id)?.has(sub.id) ?? false}
                                  onChange={() => toggleSubcategory(category.id, sub.id)}
                                />
                                {sub.name}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {error && <p className="error-state" role="alert">{error}</p>}
        </div>
        <div slot="actions">
          <TextButton onClick={() => dialogRef.current?.close()}>Cancel</TextButton>
          <FilledButton onClick={submit} disabled={submitting || categoriesLoading}>{submitting ? 'Saving…' : 'Save'}</FilledButton>
        </div>
      </Dialog>
    </>
  );
}

/**
 * A Deal always represents a bookable Service — needs a duration, priced via its own child
 * `DealPackage` rows (enforced server-side in vendor.service.ts). Product is a fully independent,
 * directly-purchasable catalog entity now (see msd-api's Product schema doc comment), never a
 * Deal — there is no global Service master either (see the direct-category-access plan): a deal
 * picks its own `categoryId`/`subcategoryId` directly, restricted to the `categories` prop (the
 * vendor's granted SERVICE categories).
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
 *
 * Category/Subcategory are now branch-scoped: whichever branch is active (the `branches`
 * selector's current pick, or `fixedBranchId` when there's no selector) drives a
 * `getBranchCategoryAccess` fetch, and the Category/Subcategory pickers below list only what
 * THIS branch has been mapped to (`branch-category-access-dialog.tsx`'s Step 2 config) — never
 * the vendor-wide `categories` prop, which now only backs the "no longer mapped" stale-value
 * name lookup (see `categoryStale`/`subcategoryStale` below). The backend hard-validates the
 * same mapping server-side regardless of what this form sends (see `vendor.service.ts`).
 */
export function DealDialog({
  deal,
  categories,
  products,
  branches,
  token,
  vendorId,
  isSelf = false,
  fixedBranchId,
  dialogRef: externalDialogRef,
  hideTrigger,
  onSave,
  onClose,
}: {
  deal?: Deal;
  /** The vendor's granted SERVICE categories (`listCategories({ type: 'SERVICE', vendorId })`)
   *  — a flat list containing both top-level rows and their subcategories (parentId set). No
   *  longer the source of the Category/Subcategory picker options (that's branch-scoped now,
   *  see this component's own doc comment) — kept only as a name-lookup fallback for a stale
   *  category/subcategory value that's no longer in the branch's mapping. */
  categories: Category[];
  products: VendorProduct[];
  branches?: Branch[];
  token: string | null;
  /** The vendor this deal belongs to — needed (alongside the active branch) to fetch that
   *  branch's `getBranchCategoryAccess` mapping. */
  vendorId: string;
  /** True on the self-service surface (`VendorBranches`/`vendor-deals.tsx` with `isSelf`), where
   *  the caller only holds `vendors:custom`, not `vendors:view` — routes the category-access
   *  fetch below to `getMyBranchCategoryAccess` (`/vendors/me/branches/:branchId/category-access`)
   *  instead of the admin-scoped `getBranchCategoryAccess`, which would otherwise 403. Defaults
   *  to `false` since most call sites (the admin wizard) are admin-scoped. */
  isSelf?: boolean;
  /** The branch this dialog is already scoped to when the caller doesn't pass a `branches`
   *  selector (e.g. `VendorBranches`'s per-branch "Deals" tab, which knows its own
   *  `selectedBranchId` but never lets this dialog switch branches) — needed so `MediaUploader`
   *  knows the right branch to upload against even before the create-flow's own `branchId`
   *  state would otherwise resolve to one, and now also so the category-access fetch tracks a
   *  branch switch made in the caller (e.g. picking a different branch in the left pane) even
   *  though this dialog never remounts for it. */
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
    title: deal?.title ?? '',
    slug: deal?.slug ?? '',
    originalPrice: deal?.originalPrice ?? '',
    salePrice: deal?.salePrice ?? '',
    durationMinutes: deal?.durationMinutes ?? undefined,
    shortDescription: deal?.shortDescription ?? undefined,
    description: deal?.description ?? undefined,
    notes: deal?.notes ?? undefined,
    policy: deal?.policy ?? undefined,
    termsAndConditions: deal?.termsAndConditions ?? undefined,
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Tracks the entity MediaUploader should upload against — starts as the existing deal being
  // edited (already has an id), or undefined for a fresh create; set to the server's response
  // the moment `onSave` resolves, so a brand-new deal's id becomes available to MediaUploader
  // within the same dialog session instead of requiring a separate edit pass.
  const [savedDeal, setSavedDeal] = useState<Deal | undefined>(deal);
  // Purely a display grouping — every field still lives in the same `form`/`packages` state and
  // is still validated by `submit()` regardless of which tab is active. The "Pricing" tab shows
  // the Packages repeater (that IS a Deal's pricing — see DealPackage's schema doc comment in
  // msd-api).
  const [activeDealTab, setActiveDealTab] = useState<'general' | 'pricing' | 'media'>('general');
  const DEAL_TAB_DEFS = [
    { key: 'general' as const, label: 'General' },
    { key: 'pricing' as const, label: 'Packages' },
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

  // The branch whose category access mapping actually drives the pickers below: the `branches`
  // selector's live pick when one is rendered, otherwise `fixedBranchId` read directly (not the
  // `branchId` state, which never changes in that mode) — this dialog is never remounted when
  // the caller's `fixedBranchId` prop changes (e.g. VendorBranches's left-pane branch switch), so
  // reading the prop directly here is what lets the fetch below react to that switch anyway.
  const activeBranchId = branches ? branchId : (fixedBranchId ?? '');
  const [branchCategoryAccess, setBranchCategoryAccess] = useState<BranchCategoryAccessRow[]>([]);
  // Starts `true` so the very first render (before the effect below has had a chance to run)
  // never briefly flags the deal's existing category/subcategory as "stale" just because
  // `branchCategoryAccess` hasn't loaded yet.
  const [branchCategoryAccessLoading, setBranchCategoryAccessLoading] = useState(true);
  const [branchCategoryAccessError, setBranchCategoryAccessError] = useState('');

  useEffect(() => {
    if (!activeBranchId || !vendorId) {
      setBranchCategoryAccess([]);
      setBranchCategoryAccessError('');
      setBranchCategoryAccessLoading(false);
      return;
    }
    let cancelled = false;
    setBranchCategoryAccessLoading(true);
    setBranchCategoryAccessError('');
    (isSelf ? getMyBranchCategoryAccess(token, activeBranchId) : getBranchCategoryAccess(token, vendorId, activeBranchId))
      .then(({ data }) => {
        if (cancelled) return;
        setBranchCategoryAccess(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setBranchCategoryAccess([]);
        setBranchCategoryAccessError(err instanceof ApiRequestError ? err.message : "Could not load this branch's category access.");
      })
      .finally(() => {
        if (!cancelled) setBranchCategoryAccessLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, vendorId, activeBranchId, isSelf]);

  /** Service offering only — category/subcategory are picked directly (no catalog item to
   *  derive them from any more), restricted to whatever THIS branch has been mapped to in Step 2
   *  (`branch-category-access-dialog.tsx`), not merely the vendor-wide grant. A deal's existing
   *  category/subcategory that's since fallen out of the branch's mapping (branch remapped after
   *  the deal was created) is never silently cleared — `categoryStale`/`subcategoryStale` drive an
   *  injected option + warning banner instead, so saving without touching the field keeps the
   *  existing value (the backend re-validates it regardless — see `vendor.service.ts`). */
  const matchedCategoryRow = branchCategoryAccess.find((row) => row.categoryId === form.categoryId);
  const subcategoryOptions = matchedCategoryRow?.subcategories.map((s) => s.subcategory) ?? [];
  const branchCategoryAccessReady = !branchCategoryAccessLoading && !branchCategoryAccessError;
  const categoryStale = branchCategoryAccessReady && Boolean(form.categoryId) && !matchedCategoryRow;
  const subcategoryStale =
    branchCategoryAccessReady &&
    !categoryStale &&
    Boolean(form.subcategoryId) &&
    !subcategoryOptions.some((c) => c.id === form.subcategoryId);
  const staleCategoryName = deal?.category?.name ?? categories.find((c) => c.id === form.categoryId)?.name ?? 'Unknown category';
  const staleSubcategoryName =
    deal?.subcategory?.name ?? categories.find((c) => c.id === form.subcategoryId)?.name ?? 'Unknown subcategory';

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
    if (packages.length === 0) {
      setError('At least one package (duration + price) is required for a deal.');
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
    const payload: DealInput = {
      ...form,
      durationMinutes: cheapest.durationMinutes,
      salePrice: String(cheapest.sellingPrice),
      originalPrice: String(cheapest.originalPrice ?? cheapest.sellingPrice),
      packages,
    };

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
      // instead); `submittingRef`/`saveButtonRef` above already guard against a double-submit
      // firing this twice.
      showToast(`Deal ${deal ? 'updated' : 'created'} successfully`);
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
                  <OutlinedSelect
                    label="Branch"
                    value={branchId}
                    onChange={(e: Event) => {
                      const value = (e.target as HTMLSelectElement).value;
                      // Same reset-in-same-update idiom as BranchDialog's State→City cascade —
                      // a category/subcategory picked for the previous branch is never valid
                      // (or even meaningful) under a newly-picked branch's own mapping.
                      setBranchId(value);
                      setForm((f) => ({ ...f, categoryId: '', subcategoryId: undefined }));
                    }}
                  >
                    {branches.map((b) => (
                      <SelectOption key={b.id} value={b.id}>
                        <div slot="headline">{b.name}</div>
                      </SelectOption>
                    ))}
                  </OutlinedSelect>
                )
              )}
              <OutlinedSelect
                label="Category"
                value={form.categoryId}
                disabled={branchCategoryAccessLoading}
                onChange={(e: Event) => setForm((f) => ({ ...f, categoryId: (e.target as HTMLSelectElement).value, subcategoryId: undefined }))}
              >
                <SelectOption value="">
                  <div slot="headline">{branchCategoryAccessLoading ? 'Loading categories…' : 'Select a category'}</div>
                </SelectOption>
                {categoryStale && (
                  <SelectOption value={form.categoryId}>
                    <div slot="headline">{staleCategoryName}</div>
                  </SelectOption>
                )}
                {branchCategoryAccess.map((row) => (
                  <SelectOption key={row.categoryId} value={row.categoryId}>
                    <div slot="headline">{row.category.name}</div>
                  </SelectOption>
                ))}
              </OutlinedSelect>
              {categoryStale && (
                <p className="error-state" role="alert">
                  This category is no longer mapped to this branch. Saving without changing it keeps the existing value — or pick a currently mapped option.
                </p>
              )}

              {(subcategoryOptions.length > 0 || subcategoryStale) && (
                <OutlinedSelect
                  label="Subcategory (optional)"
                  value={form.subcategoryId ?? ''}
                  disabled={branchCategoryAccessLoading}
                  onChange={(e: Event) => setForm((f) => ({ ...f, subcategoryId: (e.target as HTMLSelectElement).value || undefined }))}
                >
                  <SelectOption value="">
                    <div slot="headline">None</div>
                  </SelectOption>
                  {subcategoryStale && (
                    <SelectOption value={form.subcategoryId ?? ''}>
                      <div slot="headline">{staleSubcategoryName}</div>
                    </SelectOption>
                  )}
                  {subcategoryOptions.map((c) => (
                    <SelectOption key={c.id} value={c.id}>
                      <div slot="headline">{c.name}</div>
                    </SelectOption>
                  ))}
                </OutlinedSelect>
              )}
              {subcategoryStale && (
                <p className="error-state" role="alert">
                  This subcategory is no longer mapped to this branch/category. Saving without changing it keeps the existing value — or pick a currently mapped option.
                </p>
              )}

              {branchCategoryAccessError && <p className="error-state" role="alert">{branchCategoryAccessError}</p>}

              {!branchCategoryAccessLoading && !branchCategoryAccessError && branchCategoryAccess.length === 0 && !categoryStale && (
                <p className="empty-state">No categories are mapped to this branch yet — map one under Business Modules &amp; Category Access first.</p>
              )}

              <OutlinedTextField label="Title" value={form.title} onInput={(e: Event) => setForm((f) => ({ ...f, title: (e.target as HTMLInputElement).value }))} />
              <OutlinedTextField label="Slug" value={form.slug} onInput={(e: Event) => setForm((f) => ({ ...f, slug: (e.target as HTMLInputElement).value }))} />
              <OutlinedTextField label="Short description" value={form.shortDescription ?? ''} onInput={(e: Event) => setForm((f) => ({ ...f, shortDescription: (e.target as HTMLInputElement).value }))} />
              <OutlinedTextField
                label="Description"
                type="textarea"
                rows={4}
                value={form.description ?? ''}
                onInput={(e: Event) => setForm((f) => ({ ...f, description: (e.target as HTMLTextAreaElement).value }))}
              />
              <OutlinedTextField
                label="Notes"
                type="textarea"
                rows={3}
                value={form.notes ?? ''}
                onInput={(e: Event) => setForm((f) => ({ ...f, notes: (e.target as HTMLTextAreaElement).value }))}
              />
              <OutlinedTextField
                label="Policy"
                type="textarea"
                rows={3}
                value={form.policy ?? ''}
                onInput={(e: Event) => setForm((f) => ({ ...f, policy: (e.target as HTMLTextAreaElement).value }))}
              />
              <OutlinedTextField
                label="Terms & Conditions"
                type="textarea"
                rows={3}
                value={form.termsAndConditions ?? ''}
                onInput={(e: Event) => setForm((f) => ({ ...f, termsAndConditions: (e.target as HTMLTextAreaElement).value }))}
              />
            </div>
          )}

          {activeDealTab === 'pricing' && (
            <div className="form-grid">
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
