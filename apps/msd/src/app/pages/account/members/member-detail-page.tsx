import { createElement, useCallback, useEffect, useId, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import '@skylabs-monorepo/shared-ui';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getMember, changeMemberStatus, deleteMember, sendMemberReminder } from '../../../../api/rbac/members';
import { updateVendor, type Vendor } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useSetBreadcrumbs } from '../../../admin/breadcrumb-context';
import { showSnackbar } from '../../../../snackbar/snackbar';
import { BranchesListPage } from './branches-list-page';
import { DealsListPage } from './deals-list-page';
import { TherapistsListPage } from './therapists-list-page';
import { ProductsListPage } from './products-list-page';
import { VendorProfileForm, extractVendorFieldErrors, type VendorFieldErrors } from './vendor-profile-form';
import { MemberHeaderActions } from './member-header-actions';
import { MemberDocumentsTab } from './member-documents-tab';
import { MemberActivityTab } from './member-activity-tab';
import { VendorCustomers } from './vendor-customers';
import { pluralize } from '../../../../utils/format';
import {
  MEMBER_STATUS_LABEL,
  MEMBER_STATUS_TONE,
  REVIEW_FLAG_LABEL,
  REVIEW_FLAG_REASON,
  REVIEW_FLAG_TONE,
  canBeReminded,
  documentsChipLabel,
  documentsChipTone,
  dueDateLabel,
  reminderOutcome,
} from './member-status';

const TABS = [
  { value: 'profile', label: 'Profile' },
  { value: 'documents', label: 'Documents' },
  { value: 'branches', label: 'Branches' },
  { value: 'deals', label: 'Deals' },
  { value: 'therapists', label: 'Therapists' },
  { value: 'products', label: 'Products' },
  { value: 'customers', label: 'Customers' },
  { value: 'activity', label: 'Activity' },
] as const;
type Tab = (typeof TABS)[number]['value'];

/** Tabs whose content renders its own `<h2>`; the page adds one for the rest. */
const OWN_HEADING: ReadonlySet<Tab> = new Set(['branches', 'deals', 'therapists', 'products']);

const STATUS_DONE: Record<'ACTIVE' | 'INACTIVE' | 'SUSPENDED', string> = {
  ACTIVE: 'Member is active again.',
  INACTIVE: 'Member is inactive and view only.',
  SUSPENDED: 'Member suspended. We told them by email and SMS.',
};

/**
 * One member's page: `/account/members/:memberId[/:section]`. Status actions and the customer and
 * order counts sit in the header, up to eight tabs below (Customers needs `customers:view`).
 * The tab strip is `md-tabs`, which supplies the ARIA tabs pattern (tablist and
 * tab roles, aria-selected, roving tabindex, Arrow, Home and End keys); this page adds the ids,
 * `aria-controls` and the `tabpanel`. Raw elements so jsdom tests can read the `active` property.
 */
export function MemberDetailPage() {
  const { memberId, section } = useParams<{ memberId: string; section?: string }>();
  const navigate = useNavigate();
  const { token, can } = useAuth();
  const idBase = useId();

  const canView = can('members', 'view');
  const canEdit = can('members', 'edit');
  const canApprove = can('members', 'approve');
  const canReject = can('members', 'reject');
  const canStatusChange = can('members', 'status_change');
  const canDelete = can('members', 'delete');

  // P10-49: the Customers tab lists the member's customers through the staff route.
  const visibleTabs = TABS.filter((t) => t.value !== 'customers' || can('customers', 'view'));
  const tab: Tab = visibleTabs.find((t) => t.value === section)?.value ?? 'profile';

  const [member, setMember] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<VendorFieldErrors | null>(null);
  const [activityKey, setActivityKey] = useState(0);

  const load = useCallback(
    async (silent = false) => {
      if (!memberId) return;
      if (!silent) setLoading(true);
      try {
        const { data } = await getMember(token, memberId);
        setMember(data);
        setLoadError('');
      } catch (err) {
        if (!silent) setLoadError(err instanceof ApiRequestError ? err.message : 'Could not load this member.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [token, memberId],
  );

  useEffect(() => {
    if (canView) load();
  }, [canView, load]);

  const name = member ? member.businessName || member.owner?.name || 'New member' : 'Member';
  useSetBreadcrumbs([{ label: 'Members' }, { label: 'All members', to: '/account/members' }, { label: name }]);

  if (!canView) return <p className="empty-state">You do not have access to Member Management.</p>;
  if (loading) {
    return (
      <div className="admin-page admin-page--wide">
        <p className="loading-state">Loading member…</p>
      </div>
    );
  }
  if (loadError || !member) {
    return (
      <div className="admin-page admin-page--wide">
        <p className="error-state" role="alert">
          {loadError || 'Member not found.'}
        </p>
        <Link to="/account/members">Back to all members</Link>
      </div>
    );
  }

  const refreshed = async (done: string) => {
    showSnackbar(done, { variant: 'success' });
    setError('');
    setActivityKey((k) => k + 1);
    await load(true);
  };

  // MemberHeaderActions shows the error itself, so these two let a failure throw.
  const onChangeStatus = async (status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED', reason: string) => {
    await changeMemberStatus(token, member.id, status, reason);
    await refreshed(STATUS_DONE[status]);
  };

  // Never throws: the outcome, or the server's reason it could not go (cooldown, no contact), is a snackbar.
  const onRemind = async () => {
    try {
      const { data } = await sendMemberReminder(token, member.id);
      showSnackbar(reminderOutcome(data), { variant: data.sentAt ? 'success' : 'error' });
      setActivityKey((k) => k + 1);
    } catch (err) {
      showSnackbar(err instanceof ApiRequestError ? err.message : 'The reminder did not go out. Try again.', { variant: 'error' });
    }
  };

  const onDelete = async (reason: string) => {
    const { data } = await deleteMember(token, member.id, reason);
    showSnackbar(data.outcome === 'ARCHIVED' ? 'Member archived. We kept their records.' : 'Member deleted.');
    navigate('/account/members', { replace: true });
  };

  const saveProfile = async (input: Parameters<typeof updateVendor>[2]) => {
    setSaving(true);
    setError('');
    setFieldErrors(null);
    try {
      await updateVendor(token, member.id, input);
      await refreshed('Profile saved.');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save the profile.');
      setFieldErrors(extractVendorFieldErrors(err));
    } finally {
      setSaving(false);
    }
  };

  const summary = member.documentsSummary;
  const due = dueDateLabel(summary);
  const reviewFlagged = Boolean(member.reviewFlaggedAt);
  const tabId = (value: Tab) => `${idBase}-tab-${value}`;
  const panelId = `${idBase}-panel`;
  const activeLabel = visibleTabs.find((t) => t.value === tab)?.label ?? '';
  // Each count links to its filtered list for staff who can open that list (P10-49).
  const countLink = (count: number, noun: string, to: string, allowed: boolean) => {
    const text = `${count} ${pluralize(count, noun)}`;
    return allowed ? (
      <Link className="text-link" to={to}>
        {text}
      </Link>
    ) : (
      <span>{text}</span>
    );
  };

  return (
    <div className="admin-page admin-page--wide">
      <title>{`${name} · ${activeLabel} · MSD`}</title>
      <meta name="robots" content="noindex" />
      <header className="page-head">
        <div>
          <h1>{name}</h1>
          <p>
            <sky-badge status={MEMBER_STATUS_TONE[member.status]}>{MEMBER_STATUS_LABEL[member.status]}</sky-badge>{' '}
            <sky-badge status={documentsChipTone(summary)}>{documentsChipLabel(summary)}</sky-badge>
            {due && <span className="field-hint"> {due}</span>}
          </p>
          {member.customerCount !== undefined && member.orderCount !== undefined && (
            <p className="field-hint">
              {countLink(member.customerCount, 'customer', `/account/members/${member.id}/customers`, can('customers', 'view'))}
              {' · '}
              {countLink(member.orderCount, 'order', `/account/orders?vendorId=${member.id}`, can('orders', 'view'))}
            </p>
          )}
          {reviewFlagged && member.status !== 'SUSPENDED' && (
            <p>
              <sky-badge status={REVIEW_FLAG_TONE}>{REVIEW_FLAG_LABEL}</sky-badge>
            </p>
          )}
        </div>
        <MemberHeaderActions
          status={member.status}
          canStatusChange={canStatusChange}
          canDelete={canDelete}
          reasonPrefill={reviewFlagged ? REVIEW_FLAG_REASON : ''}
          onChangeStatus={onChangeStatus}
          onDelete={onDelete}
          {...(canStatusChange && canBeReminded(member.status, summary) ? { onRemind } : {})}
        />
      </header>

      {member.status === 'SUSPENDED' && (
        <p className="error-state" role="status">
          This member cannot log in and the website hides their items.
          {member.statusReason ? ` Reason: ${member.statusReason}` : ''}
        </p>
      )}
      {member.status === 'INACTIVE' && (
        <p className="field-hint" role="status">
          This member is inactive and view only. They can log in and look at everything but cannot change anything, and the
          website hides their items.
        </p>
      )}
      {error && (
        <p className="error-state" role="alert">
          {error}
        </p>
      )}

      <div className="admin-tabs-wrap">
        {createElement(
          'md-tabs',
          { className: 'admin-tabs', 'aria-label': 'Member sections' },
          visibleTabs.map((t) =>
            createElement(
              'md-primary-tab',
              {
                key: t.value,
                id: tabId(t.value),
                active: t.value === tab,
                ...(t.value === tab ? { 'aria-controls': panelId } : {}),
                onClick: () => {
                  if (t.value !== tab) navigate(`/account/members/${member.id}/${t.value}`);
                },
              },
              t.label,
            ),
          ),
        )}
      </div>

      <section id={panelId} role="tabpanel" aria-labelledby={tabId(tab)} className="admin-tab-panel">
        {!OWN_HEADING.has(tab) && <h2 className="section-title">{activeLabel}</h2>}

        {tab === 'profile' && (
          <VendorProfileForm
            vendor={member}
            canEdit={canEdit}
            saving={saving}
            token={token}
            sections={['business', 'owner', 'address', 'bank']}
            serverFieldErrors={fieldErrors}
            onSave={saveProfile}
          />
        )}

        {tab === 'documents' && (
          <MemberDocumentsTab
            token={token}
            memberId={member.id}
            canEdit={canEdit}
            canApprove={canApprove}
            canReject={canReject}
            onChanged={() => refreshed('Documents updated.')}
          />
        )}

        {/* Catalog tabs follow the vendors.* keys the API checks (PLANNING §2.7). */}
        {tab === 'branches' && <BranchesListPage token={token} vendorId={member.id} canEdit={can('vendors.branches', 'edit')} />}
        {tab === 'deals' && (
          <DealsListPage token={token} vendorId={member.id} canEdit={can('vendors.deals', 'edit')} canDelete={can('vendors.deals', 'delete')} />
        )}
        {tab === 'therapists' && (
          <TherapistsListPage
            token={token}
            vendorId={member.id}
            canEdit={can('vendors.therapists', 'edit')}
            canDelete={can('vendors.therapists', 'delete')}
          />
        )}
        {tab === 'products' && <ProductsListPage token={token} vendorId={member.id} canEdit={canEdit} canDelete={canDelete} />}

        {tab === 'customers' && <VendorCustomers vendorId={member.id} />}

        {tab === 'activity' && <MemberActivityTab token={token} memberId={member.id} refreshKey={activityKey} />}
      </section>
    </div>
  );
}

export default MemberDetailPage;
