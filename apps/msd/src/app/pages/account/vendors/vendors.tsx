import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FilledButton, OutlinedButton, OutlinedTextField, Icon } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  approveVendor,
  createMyVendor,
  getMyVendor,
  listCategories,
  listVendors,
  rejectVendor,
  reviewVendorKyc,
  setVendorStatus,
  submitMyVendor,
  updateMyVendor,
  type Category,
  type Vendor,
  type VendorFields,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { VendorList } from './vendor-list';
import { VendorProfileForm } from './vendor-profile-form';
import { VendorBranches } from './vendor-branches';
import { VendorPipeline } from './vendor-pipeline';

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

  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    listCategories(token).then(({ data }) => setCategories(data)).catch(() => setCategories([]));
  }, [token]);

  if (canView) {
    return (
      <AdminVendorManagement
        token={token}
        canCreate={canCreate}
        canEditAny={canEditAny}
        canApprove={canApprove}
        canReject={canReject}
        canStatusChange={canStatusChange}
        categories={categories}
      />
    );
  }

  if (canCustom) {
    return <SelfVendorManagement token={token} categories={categories} />;
  }

  return <p className="empty-state">You do not have access to Vendor Management.</p>;
}

function AdminVendorManagement({
  token,
  canCreate,
  canEditAny,
  canApprove,
  canReject,
  canStatusChange,
  categories,
}: {
  token: string | null;
  canCreate: boolean;
  canEditAny: boolean;
  canApprove: boolean;
  canReject: boolean;
  canStatusChange: boolean;
  categories: Category[];
}) {
  const [searchParams] = useSearchParams();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [search, setSearch] = useState('');
  // Pre-selected from `?vendorId=` — the "View vendor" link on the Branches/Deals sidebar pages.
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get('vendorId'));
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedVendor = useMemo(() => vendors.find((v) => v.id === selectedId) ?? null, [vendors, selectedId]);

  const loadVendors = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      const { data, meta } = await listVendors(token, { search: search || undefined, pageSize: 50 });
      setVendors(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setListError(err instanceof ApiRequestError ? err.message : 'Could not load vendors.');
    } finally {
      setLoading(false);
    }
  }, [token, search]);

  useEffect(() => {
    loadVendors();
  }, [loadVendors]);

  useEffect(() => {
    setMessage('');
    setError('');
  }, [selectedId]);

  /** Passed to VendorPipeline — fires after every successful per-step save, whether that
   *  step just created the vendor (Step 1, first save) or updated an existing one. */
  const handlePipelineChange = (vendor: Vendor) => {
    setVendors((prev) => (prev.some((v) => v.id === vendor.id) ? prev.map((v) => (v.id === vendor.id ? vendor : v)) : [vendor, ...prev]));
    setSelectedId(vendor.id);
    setCreating(false);
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
            <FilledButton onClick={() => { setCreating(true); setSelectedId(null); }}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              Add vendor
            </FilledButton>
          )}
        </div>
      </header>

      <div className="two-pane">
        <section className="panel" aria-label="Vendors">
          <h2>Vendors ({total})</h2>
          <OutlinedTextField
            label="Search"
            value={search}
            onInput={(e: Event) => setSearch((e.target as HTMLInputElement).value)}
          />
          {loading ? (
            <p className="loading-state">Loading vendors…</p>
          ) : listError ? (
            <p className="error-state">{listError}</p>
          ) : (
            <VendorList vendors={vendors} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setCreating(false); }} />
          )}
        </section>

        <section className="panel" aria-label="Vendor details">
          {message && <p className="field-hint" role="status">{message}</p>}
          {error && <p className="error-state" role="alert">{error}</p>}

          {creating ? (
            <>
              <h2>New vendor</h2>
              <VendorPipeline token={token} initialVendor={null} onVendorChange={handlePipelineChange} />
            </>
          ) : !selectedVendor ? (
            <p className="empty-state">Select a vendor, or add a new one.</p>
          ) : (
            <>
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
                </div>
              </div>
              <VendorPipeline
                token={token}
                initialVendor={selectedVendor}
                onVendorChange={handlePipelineChange}
                canReviewKyc={canApprove}
                onKycReview={doKycReview}
              />
              <h2 className="section-title">Branches &amp; Deals</h2>
              <VendorBranches
                token={token}
                vendorId={selectedVendor.id}
                isSelf={false}
                canEdit={canEditAny}
                canApproveDeal={canApprove}
                categories={categories}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function SelfVendorManagement({ token, categories }: { token: string | null; categories: Category[] }) {
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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

      <VendorProfileForm vendor={vendor} canEdit canReviewKyc={false} saving={saving} onSave={save} onSubmitForVerification={submit} />

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
