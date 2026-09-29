import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Divider, FilledButton, Icon, List, ListItem, TextButton, OutlinedTextField } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  approveVendor,
  deleteVendor,
  deleteVendorTherapist,
  getVendor,
  listCategories,
  listVendorTherapistsForAdmin,
  rejectVendor,
  reviewVendorKyc,
  setVendorStatus,
  type AdminTherapist,
  type Category,
  type Vendor,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useSetBreadcrumbs } from '../../../admin/breadcrumb-context';
import { ChoiceMenu, type ChoiceOption } from '../../../components/choice-menu/choice-menu';
import { CardGrid } from '../../../components/card-grid/card-grid';
import { useConfirmDialog } from '../../../components/confirm-dialog';
import { BranchesListPage } from './branches-list-page';
import { VendorDetailCustomers } from './vendor-detail-customers';
import { VendorDetailOrders } from './vendor-detail-orders';
import { VendorPipeline } from './vendor-pipeline';
import { getMissingPoints, getSetupSteps, setupHint, type SetupStep, type SetupStepKey } from './vendor-setup';

/** No tab strip — the Overview's cards (setup-progress + records) are the navigation, each
 *  Add/Edit/View button sending the admin to that section's own URL, `/account/vendors/:id/:section`.
 *  `profile` still hosts the old six-step wizard and is replaced by the Profile page in the next
 *  step of the plan; Branches and Therapists are replaced by their own pages after that. */
const SECTIONS = [
  { key: 'profile', label: 'Profile & setup' },
  { key: 'branches', label: 'Branches' },
  { key: 'therapists', label: 'Therapists' },
  { key: 'customers', label: 'Customers' },
  { key: 'orders', label: 'Orders' },
] as const;
type SectionKey = (typeof SECTIONS)[number]['key'];
const SECTION_LABEL: Record<SectionKey, string> = Object.fromEntries(SECTIONS.map((s) => [s.key, s.label])) as Record<SectionKey, string>;

/** Which section a setup-progress card's button opens. Products has no page of its own yet, so
 *  it opens the profile wizard (which still contains the old Products step internally). */
const STEP_SECTION: Record<SetupStepKey, SectionKey> = {
  profile: 'profile',
  branches: 'branches',
  deals: 'branches',
  therapists: 'therapists',
  products: 'profile',
};

const STATUS_LABEL: Record<string, string> = {
  PROFILE_INCOMPLETE: 'Profile incomplete',
  PENDING_VERIFICATION: 'Waiting for approval',
  APPROVED: 'Approved',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  REJECTED: 'Rejected',
  SUSPENDED: 'Suspended',
};

const KYC_LABEL: Record<string, string> = { PENDING: 'Not checked yet', VERIFIED: 'Verified', REJECTED: 'Rejected' };

/** `sky-badge` colour role for a member status: good = primary, in progress = tertiary,
 *  stopped = error, everything else = secondary. */
function statusBadgeVariant(status: string): 'primary' | 'secondary' | 'tertiary' | 'error' {
  if (status === 'ACTIVE' || status === 'APPROVED') return 'primary';
  if (status === 'REJECTED' || status === 'SUSPENDED') return 'error';
  if (status === 'PROFILE_INCOMPLETE' || status === 'PENDING_VERIFICATION') return 'tertiary';
  return 'secondary';
}

type PendingAction = 'reject' | 'deactivate' | 'suspend' | 'delete';

const ACTION_COPY: Record<PendingAction, { icon: string; title: string; body: string; confirm: string; needsReason: boolean }> = {
  reject: { icon: 'block', title: 'Reject this member', body: 'The member is told why. They can fix the profile and send it again.', confirm: 'Reject member', needsReason: true },
  deactivate: { icon: 'toggle_off', title: 'Deactivate this member', body: 'Their deals and products stop showing on the website. You can activate them again later.', confirm: 'Deactivate member', needsReason: true },
  suspend: { icon: 'pause_circle', title: 'Suspend this member', body: 'Use this for a rule break. Their deals and products stop showing until you activate them.', confirm: 'Suspend member', needsReason: true },
  delete: { icon: 'delete', title: 'Delete this member', body: 'This removes the member and all their branches, deals and products. It cannot be undone. If they have orders, deactivate them instead.', confirm: 'Delete member', needsReason: false },
};

const STEP_ICON: Record<SetupStepKey, string> = {
  profile: 'badge',
  branches: 'store',
  deals: 'sell',
  therapists: 'spa',
  products: 'inventory_2',
};

const THERAPIST_COLUMNS = JSON.stringify([
  { key: 'Type', label: 'Type' },
  { key: 'Name', label: 'Name' },
  { key: 'Branch', label: 'Branch' },
  { key: 'Specialization', label: 'Specialization' },
  { key: 'Experience', label: 'Experience' },
  { key: 'Status', label: 'Status', type: 'status', statusMap: { Active: 'success', Inactive: 'error' } },
]);
const THERAPIST_DELETE_ACTIONS = JSON.stringify([{ icon: 'delete', label: 'Delete', event: 'delete' }]);

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

/** One member's page: `/account/vendors/:vendorId` (Overview) and `/account/vendors/:vendorId/:section`
 *  (Profile & setup / Branches / Therapists / Customers / Orders). Admin only (`vendors:view`). */
export function VendorDetailPage() {
  const { vendorId, section: rawSection } = useParams<{ vendorId: string; section?: string }>();
  const section = SECTIONS.some((s) => s.key === rawSection) ? (rawSection as SectionKey) : undefined;
  const navigate = useNavigate();
  const { token, can, loginAsUser } = useAuth();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const canView = can('vendors', 'view');
  const canEditAny = can('vendors', 'edit');
  const canApprove = can('vendors', 'approve');
  const canReject = can('vendors', 'reject');
  const canStatusChange = can('vendors', 'status_change');
  const canDelete = can('vendors', 'delete');
  const canAccessDashboard = can('rbac.users', 'custom');

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  // Set when a URL is typed/bookmarked for a section that turns out to be locked or unknown —
  // shown once, on the Overview page this component redirects back to.
  const [lockNotice, setLockNotice] = useState('');
  // kept for a later plan's branch-scoped Deal form
  const [categories, setCategories] = useState<Category[]>([]);

  const load = useCallback(
    async (silent = false) => {
      if (!vendorId) return;
      if (!silent) setLoading(true);
      try {
        const { data } = await getVendor(token, vendorId);
        setVendor(data);
        setLoadError('');
      } catch (err) {
        if (!silent) setLoadError(err instanceof ApiRequestError ? err.message : 'Could not load this member.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [token, vendorId],
  );

  useEffect(() => {
    load();
  }, [load]);

  const steps = vendor ? getSetupSteps(vendor) : [];
  const stepByKey = (key: SetupStepKey) => steps.find((s) => s.key === key);
  const sectionLock = (key: SectionKey): string | undefined => {
    if (key === 'branches') return stepByKey('branches')?.locked ? stepByKey('branches')?.lockedReason : undefined;
    if (key === 'therapists') return stepByKey('therapists')?.locked ? stepByKey('therapists')?.lockedReason : undefined;
    return undefined;
  };

  const goToSection = useCallback(
    (next?: SectionKey) => {
      navigate(next ? `/account/vendors/${vendorId}/${next}` : `/account/vendors/${vendorId}`);
    },
    [navigate, vendorId],
  );

  // A bookmarked/typed URL for a section that turns out to be unknown or locked sends the admin
  // back to Overview with a one-line reason, instead of showing content the URL doesn't back up.
  useEffect(() => {
    if (!vendor || !rawSection) return;
    if (!section) {
      navigate(`/account/vendors/${vendorId}`, { replace: true });
      return;
    }
    const lock = sectionLock(section);
    if (lock) {
      setLockNotice(`${SECTION_LABEL[section]} is locked. ${lock}.`);
      navigate(`/account/vendors/${vendorId}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sectionLock reads `steps`, recomputed every render from `vendor`
  }, [vendor, rawSection, section, vendorId, navigate]);

  // Counts change while the member is edited in another section, so refresh them on the way back.
  useEffect(() => {
    if (!section) load(true);
  }, [section, load]);

  useEffect(() => {
    if (!vendorId) return;
    listCategories(token, { type: 'SERVICE', vendorId }).then(({ data }) => setCategories(data)).catch(() => setCategories([]));
  }, [token, vendorId]);

  const name = vendor ? vendor.businessName || vendor.owner?.name || 'Draft member' : 'Member';
  useSetBreadcrumbs(
    section
      ? [{ label: 'Members' }, { label: 'All Member', to: '/account/vendors' }, { label: name, to: `/account/vendors/${vendorId}` }, { label: SECTION_LABEL[section] }]
      : [{ label: 'Members' }, { label: 'All Member', to: '/account/vendors' }, { label: name }],
  );

  const reasonRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (pending) (reasonRef.current as HTMLElement | null)?.focus();
  }, [pending]);

  const finish = async (done: string) => {
    setMessage(done);
    setError('');
    setPending(null);
    setReason('');
    await load(true);
  };
  const fail = (err: unknown, fallback: string) => {
    setMessage('');
    setError(err instanceof ApiRequestError ? err.message : fallback);
  };

  const doApprove = async () => {
    if (!vendor) return;
    try {
      await approveVendor(token, vendor.id);
      await finish('Member approved and active.');
    } catch (err) {
      fail(err, 'Could not approve this member.');
    }
  };

  const doActivate = async () => {
    if (!vendor) return;
    try {
      await setVendorStatus(token, vendor.id, 'ACTIVE');
      await finish('Member is active again.');
    } catch (err) {
      fail(err, 'Could not activate this member.');
    }
  };

  const doAccessDashboard = async () => {
    if (!vendor?.owner) return;
    try {
      await loginAsUser(vendor.owner.id);
      navigate('/account/dashboard');
    } catch {
      fail(null, 'Could not open their dashboard.');
    }
  };

  const confirmPending = async () => {
    if (!vendor || !pending) return;
    setBusy(true);
    try {
      if (pending === 'reject') {
        await rejectVendor(token, vendor.id, reason.trim());
        await finish('Member rejected.');
      } else if (pending === 'deactivate' || pending === 'suspend') {
        await setVendorStatus(token, vendor.id, pending === 'deactivate' ? 'INACTIVE' : 'SUSPENDED', reason.trim());
        await finish(pending === 'deactivate' ? 'Member deactivated.' : 'Member suspended.');
      } else {
        await deleteVendor(token, vendor.id);
        navigate('/account/vendors');
      }
    } catch (err) {
      fail(err, 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const doKycReview = async (kycStatus: 'VERIFIED' | 'REJECTED', rejectionReason?: string) => {
    if (!vendor) return;
    try {
      await reviewVendorKyc(token, vendor.id, kycStatus, rejectionReason);
      await finish(kycStatus === 'VERIFIED' ? 'KYC verified.' : 'KYC rejected.');
    } catch (err) {
      fail(err, 'Could not review KYC.');
    }
  };

  const handlePipelineChange = (next: Vendor) => {
    // The wizard returns the vendor without the counts, so keep the ones we already have.
    setVendor((prev) => ({ ...next, _count: next._count ?? prev?._count, liveCounts: next.liveCounts ?? prev?.liveCounts }));
    setMessage('Saved.');
  };

  const actionOptions: ChoiceOption[] = [];
  if (vendor) {
    if (canAccessDashboard && vendor.owner) actionOptions.push({ value: 'dashboard', label: "Open member's dashboard" });
    if (canApprove && vendor.status !== 'ACTIVE') actionOptions.push({ value: 'approve', label: 'Approve' });
    if (canStatusChange && vendor.status === 'INACTIVE') actionOptions.push({ value: 'activate', label: 'Activate' });
    if (canReject && vendor.status !== 'REJECTED') actionOptions.push({ value: 'reject', label: 'Reject' });
    if (canStatusChange && vendor.status === 'ACTIVE') actionOptions.push({ value: 'deactivate', label: 'Deactivate' });
    if (canStatusChange && vendor.status !== 'SUSPENDED') actionOptions.push({ value: 'suspend', label: 'Suspend' });
    if (canDelete) actionOptions.push({ value: 'delete', label: 'Delete' });
  }

  const runAction = (value: string) => {
    setMessage('');
    setError('');
    if (value === 'dashboard') doAccessDashboard();
    else if (value === 'approve') doApprove();
    else if (value === 'activate') doActivate();
    else if (value === 'reject' || value === 'deactivate' || value === 'suspend' || value === 'delete') {
      setReason('');
      setPending(value);
    }
  };

  if (!canView) {
    return <p className="empty-state">You do not have access to Member Management.</p>;
  }
  if (loading) {
    return (
      <div className="admin-page admin-page--wide">
        <p className="loading-state">Loading member…</p>
      </div>
    );
  }
  if (loadError || !vendor) {
    return (
      <div className="admin-page admin-page--wide">
        <p className="error-state" role="alert">{loadError || 'Member not found.'}</p>
        <Link to="/account/vendors">Back to all members</Link>
      </div>
    );
  }

  const copy = pending ? ACTION_COPY[pending] : null;

  return (
    <div className="admin-page admin-page--wide">
      <title>{`${name} · ${section ? SECTION_LABEL[section] : 'Overview'} · MSD`}</title>
      <header className="page-head">
        <div>
          <h1>{name}</h1>
          <p>
            <sky-badge variant={statusBadgeVariant(vendor.status)}>{STATUS_LABEL[vendor.status] ?? vendor.status}</sky-badge>
          </p>
        </div>
        <div className="page-head__actions">
          {actionOptions.length > 0 && (
            <ChoiceMenu trigger="text" icon="more_vert" label="Actions" menuLabel={`Actions for ${name}`} options={actionOptions} value="" onChange={runAction} />
          )}
        </div>
      </header>

      {message && <p className="field-hint" role="status">{message}</p>}
      {error && <p className="error-state" role="alert">{error}</p>}

      {copy && pending && (
        <sky-feature-card color="surface-high" variant="outlined" icon={copy.icon} icon-style="surface" headline={copy.title} text={copy.body}>
          {copy.needsReason && (
            <OutlinedTextField
              ref={reasonRef as RefObject<never>}
              label="Reason (the member can see this)"
              type="textarea"
              rows={3}
              required
              value={reason}
              onInput={(e: Event) => setReason((e.target as HTMLTextAreaElement).value)}
            />
          )}
          <FilledButton slot="actions" disabled={busy || (copy.needsReason && reason.trim().length === 0)} onClick={confirmPending}>
            {copy.confirm}
          </FilledButton>
          <TextButton
            slot="actions"
            onClick={() => {
              setPending(null);
              setReason('');
            }}
          >
            Cancel
          </TextButton>
        </sky-feature-card>
      )}

      {lockNotice && <p className="field-hint" role="status">{lockNotice}</p>}

      {!section && (
        <div className="admin-tab-panel summary-layout" aria-label="Overview">
          <div>
            <section aria-labelledby="setup-progress-title">
              <h2 id="setup-progress-title" className="section-title">Setup progress</h2>
              <p className="field-hint">{setupHint(steps)}</p>
              <CardGrid layout="compact">
                {steps
                  .filter((step) => step.key !== 'profile')
                  .map((step) => (
                    <SetupCard key={step.key} step={step} href={step.locked ? undefined : `/account/vendors/${vendorId}/${STEP_SECTION[step.key]}`} />
                  ))}
              </CardGrid>
            </section>

            <section aria-labelledby="records-title">
              <h2 id="records-title" className="section-title">Records</h2>
              <CardGrid layout="compact">
                <NavCard icon="group" headline="Customers" text="This member's customers" href={`/account/vendors/${vendorId}/customers`} />
                <NavCard icon="receipt_long" headline="Orders" text="This member's orders" href={`/account/vendors/${vendorId}/orders`} />
              </CardGrid>
            </section>
          </div>

          <section aria-labelledby="profile-card-title">
            <h2 id="profile-card-title" className="section-title">Profile</h2>
            <MemberSummaryCard vendor={vendor} steps={steps} onEditProfile={() => goToSection('profile')} />
          </section>
        </div>
      )}

      {section === 'profile' && (
        <div className="admin-tab-panel" aria-label="Profile and setup">
          <VendorPipeline
            token={token}
            initialVendor={vendor}
            onVendorChange={handlePipelineChange}
            canReviewKyc={canApprove}
            onKycReview={doKycReview}
            canApprove={canApprove && vendor.status !== 'ACTIVE'}
            canReject={canReject && vendor.status !== 'REJECTED'}
            onApprove={doApprove}
            onReject={() => runAction('reject')}
          />
        </div>
      )}

      {section === 'branches' && (
        <div className="admin-tab-panel" aria-label="Branches">
          <BranchesListPage token={token} vendorId={vendor.id} canEdit={canEditAny} />
        </div>
      )}

      {section === 'therapists' && (
        <div className="admin-tab-panel" aria-label="Therapists">
          <TherapistsTab token={token} vendorId={vendor.id} canDelete={canDelete} confirm={confirm} />
        </div>
      )}

      {section === 'customers' && (
        <div className="admin-tab-panel" aria-label="Customers">
          <VendorDetailCustomers token={token} vendorId={vendor.id} />
        </div>
      )}

      {section === 'orders' && (
        <div className="admin-tab-panel" aria-label="Orders">
          <VendorDetailOrders token={token} vendorId={vendor.id} />
        </div>
      )}
      {ConfirmDialog}
    </div>
  );
}

/** The one line under a step's title: status, plus the action a click on the card performs (the
 *  whole tile is the link, so this is the only place that says "Add"/"Edit"). */
function stepText(step: SetupStep): string {
  if (step.locked) return step.lockedReason ?? 'Locked';
  const status = step.missing.length > 0
    ? step.key === 'profile'
      ? `Missing: ${step.missing.join(', ')}`
      : step.missing[0]
    : step.count !== undefined
      ? step.count.includes(' of ')
        ? `${step.count} live`
        : `${step.count} added`
      : 'Complete';
  return `${status} · ${step.done ? 'Edit' : 'Add'}`;
}

/** One setup step as a small `sky-tile-card`, the whole tile a link to its section (no `href` —
 *  and so no link — while locked). Not-done or locked uses the `tertiary` M3 role (this app's
 *  warning tone, same one the status badge uses for "incomplete"/"pending"); done uses
 *  `secondary`, so what still needs attention visibly stands out from what's finished. */
function SetupCard({ step, href }: { step: SetupStep; href?: string }) {
  const icon = step.locked ? 'lock' : step.done ? 'check_circle' : STEP_ICON[step.key];
  const color = step.done ? 'secondary' : 'tertiary';
  return <sky-tile-card color={color} variant="filled" icon={icon} icon-style="surface" headline={step.label} text={stepText(step)} href={href} />;
}

/** A plain browse-only tile (Customers, Orders) — no lock/done state, just a way in. */
function NavCard({ icon, headline, text, href }: { icon: string; headline: string; text: string; href: string }) {
  return <sky-tile-card color="surface" variant="filled" icon={icon} icon-style="surface" headline={headline} text={`${text} · View`} href={href} />;
}

/** The right-hand column of the summary tab: the member's profile card, under its own "Profile"
 *  heading so it reads as a third section alongside "Setup progress" and "Records" rather than a
 *  stray box. One `sky-card` (default `filled`, the same soft-surface language as the tile grid
 *  beside it) grouping three parts — identity, what's missing, the profile action — each on its
 *  own `List`, split by `Divider`. Every missing item carries a `sky-badge variant="error"`, the
 *  one shared component with a literal `--md-sys-color-error` role, so what still needs fixing is
 *  never just a plain grey row. */
function MemberSummaryCard({ vendor, steps, onEditProfile }: { vendor: Vendor; steps: SetupStep[]; onEditProfile: () => void }) {
  const profileDone = steps.find((s) => s.key === 'profile')?.done ?? false;
  const missing = getMissingPoints(steps);

  return (
    <sky-card aria-label="Member profile">
      <List>
        <ListItem>
          <Icon slot="start" aria-hidden="true">person</Icon>
          <div slot="headline">{vendor.owner?.name ?? 'Not linked yet'}</div>
          <div slot="supporting-text">Owner</div>
        </ListItem>
        <ListItem>
          <Icon slot="start" aria-hidden="true">call</Icon>
          <div slot="headline">{vendor.businessPhone || vendor.ownerMobile || 'Not added'}</div>
          <div slot="supporting-text">Contact</div>
        </ListItem>
        <ListItem>
          <Icon slot="start" aria-hidden="true">verified_user</Icon>
          <div slot="headline">{KYC_LABEL[vendor.kycStatus] ?? vendor.kycStatus}</div>
          <div slot="supporting-text">Identity check (KYC)</div>
        </ListItem>
      </List>

      <Divider />

      <List aria-label="What's missing">
        {missing.length === 0 ? (
          <ListItem>
            <Icon slot="start" aria-hidden="true">check_circle</Icon>
            <div slot="headline">Nothing missing</div>
          </ListItem>
        ) : (
          missing.map((point, i) => (
            <ListItem key={`${point.key}-${i}`}>
              <Icon slot="start" aria-hidden="true">{STEP_ICON[point.key]}</Icon>
              <div slot="headline">{point.text}</div>
              <div slot="supporting-text">{point.label}</div>
              <sky-badge slot="end" variant="error" size="small">Missing</sky-badge>
            </ListItem>
          ))
        )}
      </List>

      <Divider />

      <FilledButton onClick={onEditProfile}>{profileDone ? 'Edit profile' : 'Add profile'}</FilledButton>
    </sky-card>
  );
}

function TherapistsTab({
  token,
  vendorId,
  canDelete,
  confirm,
}: {
  token: string | null;
  vendorId: string;
  canDelete: boolean;
  confirm: (message: string) => Promise<boolean>;
}) {
  const [therapists, setTherapists] = useState<AdminTherapist[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await listVendorTherapistsForAdmin(token, vendorId);
      setTherapists(data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load therapists.');
    } finally {
      setLoading(false);
    }
  }, [token, vendorId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const el = tableRef.current;
    if (!el || !canDelete) return;
    const onRowAction = async (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; rowIndex: number }>).detail;
      const therapist = therapists[detail.rowIndex];
      if (!therapist || detail.action !== 'delete') return;
      if (!(await confirm(`Delete "${therapist.personName}"? This cannot be undone.`))) return;
      try {
        await deleteVendorTherapist(token, vendorId, therapist.id);
        load();
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : 'Could not delete therapist.');
      }
    };
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => el.removeEventListener('sky-dt-row-action', onRowAction);
  }, [therapists, canDelete, confirm, token, vendorId, load]);

  return (
    <>
      {error && <p className="error-state" role="alert">{error}</p>}
      <sky-data-table
        ref={tableRef as RefObject<HTMLElement>}
        caption="Therapists"
        columns={THERAPIST_COLUMNS}
        rows={JSON.stringify(therapists.map(toTherapistRow))}
        total={therapists.length}
        page={1}
        page-size={Math.max(therapists.length, 10)}
        loading={loading}
        actions={canDelete ? THERAPIST_DELETE_ACTIONS : undefined}
      />
    </>
  );
}

export default VendorDetailPage;
