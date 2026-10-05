import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { FilledButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  createMyVendor,
  getMyVendor,
  listCategories,
  listVendors,
  submitMyVendor,
  updateMyVendor,
  type Category,
  type Vendor,
  type VendorFields,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { VendorList } from './vendor-list';
import { VendorProfileForm, extractVendorFieldErrors, type VendorFieldErrors } from './vendor-profile-form';
import { VendorBranches } from './vendor-branches';

/**
 * Vendor Management. Two audiences share this one page/route (`/account/vendors`):
 *  - Admin/SuperAdmin (`vendors:view`): the member list. Each row opens that member's own page
 *    (`/account/vendors/:vendorId`, see vendor-detail-page.tsx).
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

  if (canView) {
    return <AdminVendorManagement canCreate={canCreate} />;
  }

  if (canCustom) {
    return <SelfVendorManagement token={token} />;
  }

  return <p className="empty-state">You do not have access to Member Management.</p>;
}

interface VendorTableParams {
  page: number;
  pageSize: number;
  search: string;
}

const DEFAULT_VENDOR_PARAMS: VendorTableParams = { page: 1, pageSize: 10, search: '' };

function AdminVendorManagement({ canCreate }: { canCreate: boolean }) {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [params, setParams] = useState<VendorTableParams>(DEFAULT_VENDOR_PARAMS);

  const openMember = useCallback((id: string) => navigate(`/account/vendors/${id}`), [navigate]);

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
      setListError(err instanceof ApiRequestError ? err.message : 'Could not load members.');
    } finally {
      setLoading(false);
    }
  }, [token, params]);

  useEffect(() => {
    loadVendors();
  }, [loadVendors]);

  // Old links used `/account/vendors?vendorId=<id>`; each member now has its own page.
  const legacyVendorId = searchParams.get('vendorId');
  if (legacyVendorId) return <Navigate to={`/account/vendors/${legacyVendorId}`} replace />;

  return (
    <div className="admin-page admin-page--wide">
      <title>Member Management · MSD</title>
      <header className="page-head">
        <div>
          <h1>Member Management</h1>
          <p>Open a member to review their profile, branches and deals.</p>
        </div>
        <div className="page-head__actions">
          {canCreate && (
            <FilledButton onClick={() => navigate('/account/vendors/new')}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              Add member
            </FilledButton>
          )}
        </div>
      </header>

      <section className="panel" aria-label="Members">
        <h2>Member ({total})</h2>
        {listError && <p className="error-state" role="alert">{listError}</p>}
        <VendorList
          vendors={vendors}
          onSelect={openMember}
          total={total}
          page={params.page}
          pageSize={params.pageSize}
          loading={loading}
          onParamsChange={setParams}
        />
      </section>
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
