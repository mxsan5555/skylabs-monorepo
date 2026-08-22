import { useEffect, useRef, useState, type RefObject } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
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
} from '../../../../api/rbac/vendors';
import { listServices, type Service } from '../../../../api/rbac/services';
import { listProducts, type Product } from '../../../../api/rbac/products';
import { ApiRequestError } from '../../../../api/rbac/client';
import { MediaUploader } from '../../../components/media-uploader';

interface VendorBranchesProps {
  token: string | null;
  vendorId: string;
  isSelf: boolean;
  canEdit: boolean;
  canApproveDeal: boolean;
  categories: Category[];
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
  const [services, setServices] = useState<Service[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    // pageSize is capped at 100 server-side (PaginationQuerySchema) — 200 here 500s, which
    // silently left `services`/`products` empty and hid the "Add deal" button entirely.
    listServices(token, { status: 'active', pageSize: 100 }).then(({ data }) => setServices(data)).catch(() => setServices([]));
    listProducts(token, { status: 'active', pageSize: 100 }).then(({ data }) => setProducts(data)).catch(() => setProducts([]));
  }, [token]);

  const loadBranches = async () => {
    setBranchesLoading(true);
    setError('');
    try {
      const { data } = isSelf ? await listMyBranches(token) : await listBranches(token, vendorId);
      setBranches(data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load branches.');
    } finally {
      setBranchesLoading(false);
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
    setDealsLoading(true);
    (isSelf ? listMyDeals(token, selectedBranchId) : listDeals(token, vendorId, selectedBranchId))
      .then(({ data }) => setDeals(data))
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load deals.'))
      .finally(() => setDealsLoading(false));
  }, [token, vendorId, isSelf, selectedBranchId]);

  const reloadDeals = () => {
    if (!selectedBranchId) return;
    (isSelf ? listMyDeals(token, selectedBranchId) : listDeals(token, vendorId, selectedBranchId)).then(({ data }) => setDeals(data));
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
        )}
      </section>

      <section className="panel" aria-label="Deals">
        {!selectedBranchId ? (
          <p className="empty-state">Select a branch to manage its deals.</p>
        ) : (
          <>
            <div className="page-head">
              <h2>Deals</h2>
              {canEdit && (services.length > 0 || products.length > 0) && (
                <DealDialog categories={categories} services={services} products={products} token={token} fixedBranchId={selectedBranchId ?? undefined} onSave={(input) => saveDeal(input)} />
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
                          · {deal.service ? `Service: ${deal.service.name}` : deal.product ? `Product: ${deal.product.name}` : 'Unlinked'}
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
                      {canEdit && <DealDialog categories={categories} services={services} products={products} deal={deal} token={token} fixedBranchId={selectedBranchId ?? undefined} onSave={(input) => saveDeal(input, deal)} />}
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

function BranchDialog({ branch, onSave }: { branch?: Branch; onSave: (input: BranchInput) => Promise<void> }) {
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
  const [errors, setErrors] = useState<Partial<Record<'pincode' | 'latitude' | 'longitude', string>>>({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
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
      };
      await onSave(input);
      dialogRef.current?.close();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save branch.');
    } finally {
      setSubmitting(false);
    }
  };

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
          <OutlinedTextField label="City" value={form.city} onInput={(e: Event) => set('city', (e.target as HTMLInputElement).value)} />
          <OutlinedTextField label="State" value={form.state} onInput={(e: Event) => set('state', (e.target as HTMLInputElement).value)} />
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
 * A Deal always represents exactly one catalog item — a Service (bookable, needs a duration)
 * or a Product (no duration) — never both, never neither (enforced server-side in
 * vendor.service.ts). categoryId/subcategoryId are derived from whichever catalog item is
 * selected, not picked separately, so the vendor/admin can never submit a category that
 * mismatches the linked Service/Product (the backend still re-validates this — see
 * assertOfferingMatchesCatalogItem — this is just the UX guardrail).
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
  services,
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
  categories: Category[];
  services: Service[];
  products: Product[];
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
  const [offeringType, setOfferingType] = useState<OfferingType>(deal?.productId ? 'product' : 'service');
  const [branchId, setBranchId] = useState<string>(deal?.branchId ?? fixedBranchId ?? branches?.[0]?.id ?? '');
  const [form, setForm] = useState<DealInput>({
    categoryId: deal?.categoryId ?? '',
    subcategoryId: deal?.subcategoryId ?? undefined,
    serviceId: deal?.serviceId ?? undefined,
    productId: deal?.productId ?? undefined,
    title: deal?.title ?? '',
    slug: deal?.slug ?? '',
    originalPrice: deal?.originalPrice ?? '',
    salePrice: deal?.salePrice ?? '',
    durationMinutes: deal?.durationMinutes ?? undefined,
    shortDescription: deal?.shortDescription ?? undefined,
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

  const selectOffering = (type: OfferingType, id: string) => {
    const catalogItem = type === 'service' ? services.find((s) => s.id === id) : products.find((p) => p.id === id);
    setForm((f) => ({
      ...f,
      serviceId: type === 'service' ? id : undefined,
      productId: type === 'product' ? id : undefined,
      categoryId: catalogItem?.categoryId ?? f.categoryId,
      subcategoryId: catalogItem?.subcategoryId ?? undefined,
      durationMinutes: type === 'product' ? undefined : f.durationMinutes,
    }));
  };

  const submit = async () => {
    if (branches && !deal && !branchId) {
      setError('Select a branch.');
      return;
    }
    if (!form.title.trim() || !form.slug.trim() || !form.categoryId) {
      setError('Title, slug, and category are required.');
      return;
    }
    if (offeringType === 'service' && !form.serviceId) {
      setError('Select a service.');
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

    setSubmitting(true);
    setError('');
    try {
      const result = await onSave(payload, branches ? branchId : undefined);
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
              <OutlinedSelect
                label="Offering type"
                value={offeringType}
                onChange={(e: Event) => {
                  const type = (e.target as HTMLSelectElement).value as OfferingType;
                  setOfferingType(type);
                  setForm((f) => ({ ...f, serviceId: undefined, productId: undefined, durationMinutes: undefined }));
                }}
              >
                <SelectOption value="service">
                  <div slot="headline">Service</div>
                </SelectOption>
                <SelectOption value="product">
                  <div slot="headline">Product</div>
                </SelectOption>
              </OutlinedSelect>

              {offeringType === 'service' ? (
                <OutlinedSelect
                  label="Service"
                  value={form.serviceId ?? ''}
                  onChange={(e: Event) => selectOffering('service', (e.target as HTMLSelectElement).value)}
                >
                  {services.map((s) => (
                    <SelectOption key={s.id} value={s.id}>
                      <div slot="headline">{s.name}</div>
                    </SelectOption>
                  ))}
                </OutlinedSelect>
              ) : (
                <OutlinedSelect
                  label="Product"
                  value={form.productId ?? ''}
                  onChange={(e: Event) => selectOffering('product', (e.target as HTMLSelectElement).value)}
                >
                  {products.map((p) => (
                    <SelectOption key={p.id} value={p.id}>
                      <div slot="headline">{p.name}</div>
                    </SelectOption>
                  ))}
                </OutlinedSelect>
              )}

              {form.categoryId && (
                <p className="field-hint">Category: {categories.find((c) => c.id === form.categoryId)?.name ?? form.categoryId}</p>
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
          <FilledButton onClick={submit} disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</FilledButton>
        </div>
      </Dialog>
    </>
  );
}
