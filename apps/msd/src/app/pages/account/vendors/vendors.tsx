import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FilledButton, OutlinedButton, Icon, Tabs, PrimaryTab } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  approveVendor,
  createMyVendor,
  deleteVendor,
  deleteVendorTherapist,
  getMyVendor,
  listCategories,
  listVendors,
  listVendorTherapistsForAdmin,
  rejectVendor,
  reviewVendorKyc,
  setVendorStatus,
  submitMyVendor,
  updateMyVendor,
  type AdminTherapist,
  type Category,
  type Vendor,
  type VendorFields,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { VendorList } from './vendor-list';
import { VendorProfileForm, extractVendorFieldErrors, type VendorFieldErrors } from './vendor-profile-form';
import { VendorBranches } from './vendor-branches';
import { VendorPipeline } from './vendor-pipeline';
import { VendorDetailCustomers } from './vendor-detail-customers';
import { VendorDetailOrders } from './vendor-detail-orders';

/**
 * Vendor Management. Two audiences share this one page/route (`/account/vendors`):
 *  - Admin/SuperAdmin (`vendors:view`): full list + drill into any vendor's profile,
 *    KYC review, approve/reject/activate/suspend, and manage its branches/deals.
 *  - Vendor (`vendors:custom` only, never `vendors:view` — see roles.tsx's SuperAdmin
 *    note on why a role never gets a permission wider than it needs): "my business"
 *    self-service — complete/edit own profile, submit for verification, manage own
 *    branches/deals. Ownership is always resolved server-side from the caller's JWT,
 *    never from a client-supplied vendorId.
 */
export function VendorManagement() {
  const { token, can } = useAuth();
  const canView = can('vendors', 'view');
  const canCustom = can('vendors', 'custom');
  const canCreate = can('vendors', 'create');
  const canEditAny = can('vendors', 'edit');
  const canApprove = can('vendors', 'approve');
  const canReject = can('vendors', 'reject');
  const canStatusChange = can('vendors', 'status_change');
  const canDelete = can('vendors', 'delete');

  if (canView) {
    return (
      <AdminVendorManagement
        token={token}
        canCreate={canCreate}
        canEditAny={canEditAny}
        canApprove={canApprove}
        canReject={canReject}
        canStatusChange={canStatusChange}
        canDelete={canDelete}
      />
    );
  }

  if (canCustom) {
    return <SelfVendorManagement token={token} />;
  }

  return <p className="empty-state">You do not have access to Vendor Management.</p>;
}

interface VendorTableParams {
  page: number;
  pageSize: number;
  search: string;
}

const DEFAULT_VENDOR_PARAMS: VendorTableParams = { page: 1, pageSize: 10, search: '' };

const THERAPIST_COLUMNS = JSON.stringify([
  { key: 'Type', label: 'Type' },
  { key: 'Name', label: 'Name' },
  { key: 'Branch', label: 'Branch' },
  { key: 'Specialization', label: 'Specialization' },
  { key: 'Experience', label: 'Experience' },
  { key: 'Status', label: 'Status', type: 'status', statusMap: { Active: 'success', Inactive: 'error' } },
]);

const THERAPIST_ADMIN_DELETE_ACTIONS = JSON.stringify([{ icon: 'delete', label: 'Delete', event: 'delete' }]);

function toTherapistRow(t: AdminTherapist): Record<string, string | number> {
  return {
    Type: t.therapistType,
    Name: t.personName,
    Branch: t.branch.name,
    Specialization: t.specialization || '—',
    Experience: t.experienceYears ? `${t.experienceYears} yrs` : '—',
    Status: t.isActive ? 'Active' : 'Inactive',
  };
}

/** Vendor Detail tab order — Overview (profile) first, then the two genuinely-coupled
 *  Branches & Deals (kept as one tab, same reasoning already applied to the vendor
 *  self-service side: a branch and its deals are one browsing flow, not two), then the
 *  read-only contextual views (Therapists/Customers/Orders — Orders already covers every
 *  purchase kind, Deal/Product/Therapist alike, so there is no separate Bookings tab). */
const VENDOR_DETAIL_TABS = ['Overview', 'Branches & Deals', 'Therapists', 'Customers', 'Orders'] as const;

function AdminVendorManagement({
  token,
  canCreate,
  canEditAny,
  canApprove,
  canReject,
  canStatusChange,
  canDelete,
}: {
  token: string | null;
  canCreate: boolean;
  canEditAny: boolean;
  canApprove: boolean;
  canReject: boolean;
  canStatusChange: boolean;
  canDelete: boolean;
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [params, setParams] = useState<VendorTableParams>(DEFAULT_VENDOR_PARAMS);
  // Pre-selected from `?vendorId=` — the "View vendor" link on the Branches/Deals sidebar pages.
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get('vendorId'));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  // The selected vendor's granted SERVICE categories — a service Deal picks directly from these
  // (see vendor-branches.tsx's DealDialog); scoped per-vendor since access is vendor-specific.
  const [categories, setCategories] = useState<Category[]>([]);

  const selectedVendor = useMemo(() => vendors.find((v) => v.id === selectedId) ?? null, [vendors, selectedId]);

  useEffect(() => {
    if (!selectedVendor) {
      setCategories([]);
      return;
    }
    listCategories(token, { type: 'SERVICE', vendorId: selectedVendor.id }).then(({ data }) => setCategories(data)).catch(() => setCategories([]));
  }, [token, selectedVendor?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed on id, not object identity

  const loadVendors = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      const { data, meta } = await listVendors(token, {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
      });
      setVendors(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setListError(err instanceof ApiRequestError ? err.message : 'Could not load vendors.');
    } finally {
      setLoading(false);
    }
  }, [token, params]);

  useEffect(() => {
    loadVendors();
  }, [loadVendors]);

  useEffect(() => {
    setMessage('');
    setError('');
    setActiveTab(0);
  }, [selectedId]);

  const [therapists, setTherapists] = useState<AdminTherapist[]>([]);
  const [therapistsLoading, setTherapistsLoading] = useState(false);
  const [therapistsError, setTherapistsError] = useState('');

  const loadTherapists = useCallback(async () => {
    if (!selectedVendor) {
      setTherapists([]);
      return;
    }
    setTherapistsLoading(true);
    setTherapistsError('');
    try {
      const { data } = await listVendorTherapistsForAdmin(token, selectedVendor.id);
      setTherapists(data);
    } catch (err) {
      setTherapistsError(err instanceof ApiRequestError ? err.message : 'Could not load therapists.');
    } finally {
      setTherapistsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the vendor id, not the object identity (which changes on every vendors[] refresh, e.g. approve/reject)
  }, [token, selectedVendor?.id]);

  useEffect(() => {
    loadTherapists();
  }, [loadTherapists]);

  const therapistsTableRef = useRef<HTMLElement>(null);

  const doDeleteTherapist = async (therapist: AdminTherapist) => {
    if (!selectedVendor) return;
    if (!window.confirm(`Delete "${therapist.personName}"? This cannot be undone.`)) return;
    try {
      await deleteVendorTherapist(token, selectedVendor.id, therapist.id);
      loadTherapists();
    } catch (err) {
      setTherapistsError(err instanceof ApiRequestError ? err.message : 'Could not delete therapist.');
    }
  };

  useEffect(() => {
    const el = therapistsTableRef.current;
    if (!el || !canDelete) return;
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; row: Record<string, unknown>; rowIndex: number }>).detail;
      const therapist = therapists[detail.rowIndex];
      if (!therapist) return;
      if (detail.action === 'delete') doDeleteTherapist(therapist);
    };
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => el.removeEventListener('sky-dt-row-action', onRowAction);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [therapists, canDelete]);

  /** Passed to VendorPipeline — fires after every successful per-step save, whether that
   *  step just created the vendor (Step 1, first save) or updated an existing one. */
  const handlePipelineChange = (vendor: Vendor) => {
    setVendors((prev) => (prev.some((v) => v.id === vendor.id) ? prev.map((v) => (v.id === vendor.id ? vendor : v)) : [vendor, ...prev]));
    setSelectedId(vendor.id);
    setMessage('Saved.');
  };

  const doApprove = async () => {
    if (!selectedVendor) return;
    try {
      const { data } = await approveVendor(token, selectedVendor.id);
      setVendors((prev) => prev.map((v) => (v.id === data.id ? data : v)));
      setMessage('Vendor approved and activated.');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not approve vendor.');
    }
  };

  const doReject = async () => {
    if (!selectedVendor) return;
    const reason = window.prompt('Reason for rejecting this vendor?');
    if (!reason) return;
    try {
      const { data } = await rejectVendor(token, selectedVendor.id, reason);
      setVendors((prev) => prev.map((v) => (v.id === data.id ? data : v)));
      setMessage('Vendor rejected.');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not reject vendor.');
    }
  };

  const doStatusChange = async (status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED') => {
    if (!selectedVendor) return;
    const reason = status === 'ACTIVE' ? undefined : window.prompt(`Reason for setting status to ${status}?`) ?? undefined;
    if (status !== 'ACTIVE' && !reason) return;
    try {
      const { data } = await setVendorStatus(token, selectedVendor.id, status, reason);
      setVendors((prev) => prev.map((v) => (v.id === data.id ? data : v)));
      setMessage(`Vendor status set to ${status}.`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change vendor status.');
    }
  };

  const doKycReview = async (kycStatus: 'VERIFIED' | 'REJECTED', rejectionReason?: string) => {
    if (!selectedVendor) return;
    try {
      const { data } = await reviewVendorKyc(token, selectedVendor.id, kycStatus, rejectionReason);
      setVendors((prev) => prev.map((v) => (v.id === data.id ? data : v)));
      setMessage(`KYC ${kycStatus.toLowerCase()}.`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not review KYC.');
    }
  };

  const doDelete = async () => {
    if (!selectedVendor) return;
    if (!window.confirm(`Delete "${selectedVendor.businessName || 'this vendor'}"? This cannot be undone.`)) return;
    try {
      await deleteVendor(token, selectedVendor.id);
      setVendors((prev) => prev.filter((v) => v.id !== selectedVendor.id));
      setSelectedId(null);
      setMessage('Vendor deleted.');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not delete vendor.');
    }
  };

  return (
    <div className="admin-page admin-page--wide">
      <title>Vendor Management · MSD</title>
      <header className="page-head">
        <div>
          <h1>Vendor Management</h1>
          <p>Onboard vendors, review KYC, and manage their branches and deals.</p>
        </div>
        <div className="page-head__actions">
          {canCreate && (
            <FilledButton onClick={() => navigate('/account/vendors/new')}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              Add vendor
            </FilledButton>
          )}
        </div>
      </header>

      <section className="panel" aria-label="Vendors">
        <h2>Vendors ({total})</h2>
        {listError && <p className="error-state" role="alert">{listError}</p>}
        <VendorList
          vendors={vendors}
          selectedId={selectedId}
          onSelect={setSelectedId}
          total={total}
          page={params.page}
          pageSize={params.pageSize}
          loading={loading}
          onParamsChange={setParams}
        />
      </section>

      {selectedVendor && (
        <section className="panel vendor-detail" aria-label="Vendor details">
          {message && <p className="field-hint" role="status">{message}</p>}
          {error && <p className="error-state" role="alert">{error}</p>}

          <div className="page-head">
            <h2>{selectedVendor.businessName || selectedVendor.owner?.name || 'Draft vendor'}</h2>
            <div className="page-head__actions">
              {canApprove && selectedVendor.status !== 'ACTIVE' && <FilledButton onClick={doApprove}>Approve</FilledButton>}
              {canReject && selectedVendor.status !== 'REJECTED' && <OutlinedButton onClick={doReject}>Reject</OutlinedButton>}
              {canStatusChange && selectedVendor.status === 'ACTIVE' && (
                <OutlinedButton onClick={() => doStatusChange('INACTIVE')}>Deactivate</OutlinedButton>
              )}
              {canStatusChange && selectedVendor.status === 'INACTIVE' && (
                <OutlinedButton onClick={() => doStatusChange('ACTIVE')}>Activate</OutlinedButton>
              )}
              {canStatusChange && selectedVendor.status !== 'SUSPENDED' && (
                <OutlinedButton onClick={() => doStatusChange('SUSPENDED')}>Suspend</OutlinedButton>
              )}
              {canDelete && <OutlinedButton onClick={doDelete}>Delete</OutlinedButton>}
            </div>
          </div>

          <div className="admin-tabs-wrap">
            <Tabs
              className="admin-tabs"
              onChange={(e) => setActiveTab((e.target as unknown as { activeTabIndex: number }).activeTabIndex)}
            >
              {VENDOR_DETAIL_TABS.map((label, i) => (
                <PrimaryTab key={label} active={activeTab === i}>
                  {label}
                </PrimaryTab>
              ))}
            </Tabs>
          </div>

          {activeTab === 0 && (
            <div className="admin-tab-panel" aria-label="Overview">
              <VendorPipeline
                token={token}
                initialVendor={selectedVendor}
                onVendorChange={handlePipelineChange}
                canReviewKyc={canApprove}
                onKycReview={doKycReview}
                canApprove={canApprove && selectedVendor.status !== 'ACTIVE'}
                canReject={canReject && selectedVendor.status !== 'REJECTED'}
                onApprove={doApprove}
                onReject={doReject}
              />
            </div>
          )}

          {activeTab === 1 && (
            <div className="admin-tab-panel" aria-label="Branches and Deals">
              <VendorBranches
                token={token}
                vendorId={selectedVendor.id}
                isSelf={false}
                canEdit={canEditAny}
                canApproveDeal={canApprove}
                canDeleteDeal={canDelete}
                categories={categories}
              />
            </div>
          )}

          {activeTab === 2 && (
            <div className="admin-tab-panel" aria-label="Therapists">
              {therapistsError && <p className="error-state" role="alert">{therapistsError}</p>}
              <sky-data-table
                ref={therapistsTableRef as RefObject<HTMLElement>}
                caption="Therapists"
                columns={THERAPIST_COLUMNS}
                rows={JSON.stringify(therapists.map(toTherapistRow))}
                total={therapists.length}
                page={1}
                page-size={Math.max(therapists.length, 10)}
                loading={therapistsLoading}
                actions={canDelete ? THERAPIST_ADMIN_DELETE_ACTIONS : undefined}
              />
            </div>
          )}

          {activeTab === 3 && (
            <div className="admin-tab-panel" aria-label="Customers">
              <VendorDetailCustomers token={token} vendorId={selectedVendor.id} />
            </div>
          )}

          {activeTab === 4 && (
            <div className="admin-tab-panel" aria-label="Orders">
              <VendorDetailOrders token={token} vendorId={selectedVendor.id} />
            </div>
          )}

        </section>
      )}

      {!selectedVendor && <p className="empty-state">Select a vendor, or add a new one.</p>}
    </div>
  );
}

export interface UseMyVendorResult {
  vendor: Vendor | null;
  notFound: boolean;
  loading: boolean;
  saving: boolean;
  message: string;
  error: string;
  fieldErrors: VendorFieldErrors | null;
  save: (input: VendorFields) => Promise<void>;
  submit: () => Promise<void>;
}

/** The logged-in vendor's own profile: fetch/save/submit-for-verification. Single source of
 *  truth for `GET /vendors/me`, shared by the combined "My Business" page below and the split
 *  "Business Profile" / "Branches & Deals" self-service pages — kept here (rather than
 *  duplicated in each page) so there's exactly one `getMyVendor` fetch implementation to
 *  keep in sync. */
export function useMyVendor(token: string | null): UseMyVendorResult {
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<VendorFieldErrors | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getMyVendor(token);
      setVendor(data);
      setNotFound(false);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'NOT_FOUND') {
        setNotFound(true);
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Could not load your vendor profile.');
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (input: VendorFields) => {
    setSaving(true);
    setError('');
    setFieldErrors(null);
    try {
      if (notFound) {
        const { data } = await createMyVendor(token, input);
        setVendor(data);
        setNotFound(false);
        setMessage('Profile created. Complete every section, then submit for verification.');
      } else {
        const { data } = await updateMyVendor(token, input);
        setVendor(data);
        setMessage('Profile saved.');
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save your profile.');
      setFieldErrors(extractVendorFieldErrors(err));
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    setError('');
    try {
      const { data } = await submitMyVendor(token);
      setVendor(data);
      setMessage('Submitted for verification.');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Profile is incomplete — fill in every section before submitting.');
    }
  };

  return { vendor, notFound, loading, saving, message, error, fieldErrors, save, submit };
}

function SelfVendorManagement({ token }: { token: string | null }) {
  const { vendor, notFound, loading, saving, message, error, fieldErrors, save, submit } = useMyVendor(token);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    if (!vendor) {
      setCategories([]);
      return;
    }
    listCategories(token, { type: 'SERVICE', vendorId: vendor.id }).then(({ data }) => setCategories(data)).catch(() => setCategories([]));
  }, [token, vendor?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed on id, not object identity

  if (loading) {
    return (
      <div className="admin-page">
        <p className="loading-state">Loading your business profile…</p>
      </div>
    );
  }

  return (
    <div className="admin-page admin-page--wide">
      <title>My Business · MSD</title>
      <header className="page-head">
        <div>
          <h1>My Business</h1>
          <p>{notFound ? 'Complete your business profile to get started.' : `Status: ${vendor?.status}`}</p>
        </div>
      </header>

      {message && <p className="field-hint" role="status">{message}</p>}
      {error && <p className="error-state" role="alert">{error}</p>}

      {/* Same field set as Superadmin's Create/Edit Vendor form (vendor-pipeline.tsx Step 1) —
          this app's "no duplicate vendor profile form" rule means every section is present here
          too, not a trimmed-down subset. */}
      <VendorProfileForm
        vendor={vendor}
        canEdit
        canReviewKyc={false}
        saving={saving}
        token={token}
        selfService
        sections={['business', 'owner', 'address', 'kyc', 'bank']}
        onSave={save}
        onSubmitForVerification={submit}
        serverFieldErrors={fieldErrors}
      />

      {vendor && vendor.status === 'ACTIVE' && (
        <>
          <h2 className="section-title">My Branches &amp; Deals</h2>
          <VendorBranches token={token} vendorId={vendor.id} isSelf canEdit canApproveDeal={false} categories={categories} />
        </>
      )}
    </div>
  );
}

export default VendorManagement;
