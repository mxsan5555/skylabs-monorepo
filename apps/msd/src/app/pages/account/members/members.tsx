import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { FilledButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  getMyVendor,
  listCategories,
  updateMyVendor,
  type Category,
  type Vendor,
  type VendorFields,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { listMembers, type MemberListFilter } from '../../../../api/rbac/members';
import { MemberList, type MemberTableParams } from './member-list';
import { VendorProfileForm, extractVendorFieldErrors, type VendorFieldErrors } from './vendor-profile-form';
import { MEMBER_STATUS_LABEL } from './member-status';
import { VendorBranches } from './vendor-branches';

/**
 * Member Management. Two audiences share this one page/route (`/account/members`):
 *  - Staff (`members:view`): the member list with lifecycle filters. Each row opens that
 *    member's own page (`/account/members/:vendorId`).
 *  - Member (`members:custom` only, never `members:view`): "my business" self-service.
 *    The server resolves ownership from the caller's JWT, never from a client-supplied id.
 */
export function MemberManagement() {
  const { token, can } = useAuth();
  if (can('members', 'view')) return <AdminMemberManagement canCreate={can('members', 'create')} />;
  if (can('members', 'custom')) return <SelfVendorManagement token={token} />;
  return <p className="empty-state">You do not have access to Member Management.</p>;
}

/** Maps the table's filter select value ('' = All) to the list query. */
function filterToQuery(filter: string): Pick<MemberListFilter, 'status' | 'documents' | 'reviewFlag'> {
  if (filter === 'ACTIVE' || filter === 'INACTIVE' || filter === 'SUSPENDED') return { status: filter };
  if (filter === 'documents') return { documents: 'incomplete' };
  if (filter === 'review') return { reviewFlag: 'true' };
  return {};
}

function legacyMemberLink(params: URLSearchParams): string | null {
  const vendorId = params.get('vendorId');
  if (!vendorId) return null;
  const base = `/account/members/${encodeURIComponent(vendorId)}`;
  const dealId = params.get('dealId');
  if (dealId) return `${base}/deals/${encodeURIComponent(dealId)}`;
  const branchId = params.get('branchId');
  if (branchId) return `${base}/branches/${encodeURIComponent(branchId)}`;
  return base;
}

const DEFAULT_PARAMS: MemberTableParams = { page: 1, pageSize: 10, search: '', filter: '', dir: 'asc' };

function AdminMemberManagement({ canCreate }: { canCreate: boolean }) {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const [members, setMembers] = useState<Vendor[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [params, setParams] = useState<MemberTableParams>(DEFAULT_PARAMS);

  const openMember = useCallback((id: string) => navigate(`/account/members/${id}`), [navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      const { data, meta } = await listMembers(token, {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
        ...filterToQuery(params.filter),
        sort: params.sort,
        dir: params.sort ? params.dir : undefined,
      });
      setMembers(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setListError(err instanceof ApiRequestError ? err.message : 'Could not load members.');
    } finally {
      setLoading(false);
    }
  }, [token, params]);

  useEffect(() => {
    load();
  }, [load]);

  // Old links used `/account/members?vendorId=<id>[&branchId=<id>][&dealId=<id>]`; each member,
  // branch and deal now has its own page.
  const legacyLink = legacyMemberLink(searchParams);
  if (legacyLink) return <Navigate to={legacyLink} replace />;

  return (
    <div className="admin-page admin-page--wide">
      <title>Member Management · MSD</title>
      <header className="page-head">
        <div>
          <h1>Member Management</h1>
          <p>Open a member to review their profile, documents and catalog.</p>
        </div>
        <div className="page-head__actions">
          {canCreate && (
            <FilledButton onClick={() => navigate('/account/members/new')}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              Add member
            </FilledButton>
          )}
        </div>
      </header>

      <section className="" aria-label="Members">
        {listError && <p className="error-state" role="alert">{listError}</p>}
        <MemberList
          members={members}
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
}

/** The logged-in vendor's own profile: fetch and save. Single source of
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
      const { data } = await updateMyVendor(token, input);
      setVendor(data);
      setMessage('Profile saved.');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save your profile.');
      setFieldErrors(extractVendorFieldErrors(err));
    } finally {
      setSaving(false);
    }
  };

  return { vendor, notFound, loading, saving, message, error, fieldErrors, save };
}

function SelfVendorManagement({ token }: { token: string | null }) {
  const { bootstrap } = useAuth();
  const { vendor, notFound, loading, saving, message, error, fieldErrors, save } = useMyVendor(token);
  // An inactive member may look but not change anything; admin-layout shows the view-only banner.
  const canEdit = bootstrap?.member?.status !== 'INACTIVE';
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
          {vendor && <p>{`Status: ${MEMBER_STATUS_LABEL[vendor.status]}`}</p>}
        </div>
      </header>

      {message && <p className="field-hint" role="status">{message}</p>}
      {error && <p className="error-state" role="alert">{error}</p>}
      {notFound && (
        <p className="error-state" role="alert">
          Your member profile was not found. Please contact support.
        </p>
      )}

      {/* Same field set as Superadmin's Create/Edit Vendor form (vendor-pipeline.tsx Step 1) —
          this app's "no duplicate vendor profile form" rule means every section is present here
          too, not a trimmed-down subset. */}
      {!notFound && (
      <VendorProfileForm
        vendor={vendor}
        canEdit={canEdit}
        saving={saving}
        token={token}
        selfService
        sections={['business', 'owner', 'address', 'kyc', 'bank']}
        onSave={save}
        serverFieldErrors={fieldErrors}
      />
      )}

      {vendor && vendor.status === 'ACTIVE' && (
        <>
          <h2 className="section-title">My Branches &amp; Deals</h2>
          <VendorBranches token={token} vendorId={vendor.id} isSelf canEdit canApproveDeal={false} categories={categories} />
        </>
      )}
    </div>
  );
}

export default MemberManagement;
