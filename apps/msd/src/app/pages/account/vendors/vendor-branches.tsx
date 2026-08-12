import { useEffect, useRef, useState, type RefObject } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import { Dialog, FilledButton, OutlinedButton, OutlinedTextField, OutlinedSelect, SelectOption, TextButton, Icon } from '@skylabs-monorepo/shared-ui/react';
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
} from '../../../../api/rbac/vendors';
import { listServices, type Service } from '../../../../api/rbac/services';
import { listProducts, type Product } from '../../../../api/rbac/products';
import { ApiRequestError } from '../../../../api/rbac/client';

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
    if (existing) {
      isSelf
        ? await updateMyDeal(token, selectedBranchId, existing.id, input)
        : await updateDeal(token, vendorId, selectedBranchId, existing.id, input);
    } else {
      isSelf ? await createMyDeal(token, selectedBranchId, input) : await createDeal(token, vendorId, selectedBranchId, input);
    }
    reloadDeals();
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
                <DealDialog categories={categories} services={services} products={products} onSave={(input) => saveDeal(input)} />
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
                      {canEdit && <DealDialog categories={categories} services={services} products={products} deal={deal} onSave={(input) => saveDeal(input, deal)} />}
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

function BranchDialog({ branch, onSave }: { branch?: Branch; onSave: (input: BranchInput) => Promise<void> }) {
  const dialogRef = useRef<MdDialog>(null);
  const [form, setForm] = useState<BranchInput>({ name: branch?.name ?? '', city: branch?.city ?? '', address: branch?.address ?? '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!form.name.trim()) {
      setError('Branch name is required.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSave(form);
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
          <OutlinedTextField label="Name" value={form.name} onInput={(e: Event) => setForm((f) => ({ ...f, name: (e.target as HTMLInputElement).value }))} />
          <OutlinedTextField label="Address" value={form.address ?? ''} onInput={(e: Event) => setForm((f) => ({ ...f, address: (e.target as HTMLInputElement).value }))} />
          <OutlinedTextField label="City" value={form.city ?? ''} onInput={(e: Event) => setForm((f) => ({ ...f, city: (e.target as HTMLInputElement).value }))} />
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
  dialogRef?: RefObject<MdDialog | null>;
  hideTrigger?: boolean;
  onSave: (input: DealInput, branchId?: string) => Promise<void>;
  onClose?: () => void;
}) {
  const internalDialogRef = useRef<MdDialog>(null);
  const dialogRef = externalDialogRef ?? internalDialogRef;
  const [offeringType, setOfferingType] = useState<OfferingType>(deal?.productId ? 'product' : 'service');
  const [branchId, setBranchId] = useState<string>(deal?.branchId ?? branches?.[0]?.id ?? '');
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
    if (!form.title.trim() || !form.slug.trim() || !form.originalPrice || !form.salePrice || !form.categoryId) {
      setError('Title, slug, original price, and sale price are required.');
      return;
    }
    if (offeringType === 'service' && !form.serviceId) {
      setError('Select a service.');
      return;
    }
    if (offeringType === 'service' && !form.durationMinutes) {
      setError('Duration is required for a service deal.');
      return;
    }
    if (offeringType === 'product' && !form.productId) {
      setError('Select a product.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSave(form, branches ? branchId : undefined);
      dialogRef.current?.close();
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
        <div slot="content" className="form-grid">
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
            <>
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
              <OutlinedTextField
                label="Duration (minutes)"
                type="number"
                value={form.durationMinutes !== undefined ? String(form.durationMinutes) : ''}
                onInput={(e: Event) => setForm((f) => ({ ...f, durationMinutes: Number((e.target as HTMLInputElement).value) || undefined }))}
              />
            </>
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
          <OutlinedTextField label="Original price" value={form.originalPrice} onInput={(e: Event) => setForm((f) => ({ ...f, originalPrice: (e.target as HTMLInputElement).value }))} />
          <OutlinedTextField label="Sale price" value={form.salePrice} onInput={(e: Event) => setForm((f) => ({ ...f, salePrice: (e.target as HTMLInputElement).value }))} />
          <OutlinedTextField label="Short description" value={form.shortDescription ?? ''} onInput={(e: Event) => setForm((f) => ({ ...f, shortDescription: (e.target as HTMLInputElement).value }))} />
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
