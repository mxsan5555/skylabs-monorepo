import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Divider, FilledButton, Icon, List, ListItem, OutlinedButton, TextButton, OutlinedTextField } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  approveVendor,
  deleteVendor,
  getVendor,
  rejectVendor,
  reviewVendorKyc,
  setVendorStatus,
  type Vendor,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useSetBreadcrumbs } from '../../../admin/breadcrumb-context';
import { ChoiceMenu, type ChoiceOption } from '../../../components/choice-menu/choice-menu';
import { CardGrid } from '../../../components/card-grid/card-grid';
import { ChipNav } from '../../../components/chip-nav/chip-nav';
import { BranchesListPage } from './branches-list-page';
import { DealsListPage } from './deals-list-page';
import { TherapistsListPage } from './therapists-list-page';
import { ProductsListPage } from './products-list-page';
import { VendorDetailCustomers } from './vendor-detail-customers';
import { VendorDetailOrders } from './vendor-detail-orders';
import { VendorPipeline } from './vendor-pipeline';
import { getMissingPoints, getSetupSteps, setupHint, type SetupStep, type SetupStepKey } from './vendor-setup';

/** No tab strip — the Overview's cards (setup-progress + records) are the navigation, each
 *  Add/Edit/View button sending the admin to that section's own URL, `/account/vendors/:id/:section`.
 *  `profile` still hosts the old six-step wizard and is replaced by the Profile page in a later
 *  step of the plan. */
const SECTIONS = [
  { key: 'profile', label: 'Profile & setup' },
  { key: 'branches', label: 'Branches' },
  { key: 'deals', label: 'Deals' },
  { key: 'therapists', label: 'Therapists' },
  { key: 'products', label: 'Products' },
  { key: 'customers', label: 'Customers' },
  { key: 'orders', label: 'Orders' },
] as const;
type SectionKey = (typeof SECTIONS)[number]['key'];
const SECTION_LABEL: Record<SectionKey, string> = Object.fromEntries(SECTIONS.map((s) => [s.key, s.label])) as Record<SectionKey, string>;

/** Which section a setup-progress card's button opens. */
const STEP_SECTION: Record<SetupStepKey, SectionKey> = {
  profile: 'profile',
  branches: 'branches',
  deals: 'deals',
  therapists: 'therapists',
  products: 'products',
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

type PendingAction = 'reject' | 'suspend' | 'delete' | 'superadmin_deactivate' | 'superadmin_activate';

const ACTION_COPY: Record<PendingAction, { icon: string; title: string; body: string; confirm: string; needsReason: boolean }> = {
  reject: { icon: 'block', title: 'Reject this member', body: 'The member is told why. They can fix the profile and send it again.', confirm: 'Reject member', needsReason: true },
  suspend: { icon: 'pause_circle', title: 'Suspend this member', body: 'Use this for a rule break. Their deals and products stop showing until you activate them.', confirm: 'Suspend member', needsReason: true },
  delete: { icon: 'delete', title: 'Delete this member', body: 'This removes the member and all their branches, deals and products. It cannot be undone. If they have orders, deactivate them instead.', confirm: 'Delete member', needsReason: false },
  // Member-level Active/Deactivate is SuperAdmin-only (see the 2026-10-04 two-column design
  // spec §4) — the only entry point for this transition; it replaced the old `deactivate`/
  // `activate` options that used to sit in the header's Actions menu under the weaker
  // `vendors:status_change` permission.
  superadmin_deactivate: { icon: 'toggle_off', title: 'Deactivate this member', body: 'Their deals and products stop showing on the website. This is the SuperAdmin-level control — use it even if a support action was already tried.', confirm: 'Deactivate member', needsReason: true },
  superadmin_activate: { icon: 'toggle_on', title: 'Activate this member', body: 'Their deals and products become visible on the website again.', confirm: 'Activate member', needsReason: false },
};

const STEP_ICON: Record<SetupStepKey, string> = {
  profile: 'badge',
  branches: 'store',
  deals: 'sell',
  therapists: 'spa',
  products: 'inventory_2',
};

/** One member's page: `/account/vendors/:vendorId` (Overview) and `/account/vendors/:vendorId/:section`
 *  (Profile & setup / Branches / Therapists / Customers / Orders). Admin only (`vendors:view`). */
export function VendorDetailPage() {
  const { vendorId, section: rawSection } = useParams<{ vendorId: string; section?: string }>();
  const section = SECTIONS.some((s) => s.key === rawSection) ? (rawSection as SectionKey) : undefined;
  const navigate = useNavigate();
  const { token, can, loginAsUser, bootstrap } = useAuth();

  const canView = can('vendors', 'view');
  const canEditAny = can('vendors', 'edit');
  const canApprove = can('vendors', 'approve');
  const canReject = can('vendors', 'reject');
  const canStatusChange = can('vendors', 'status_change');
  const canDelete = can('vendors', 'delete');
  const canAccessDashboard = can('rbac.users', 'custom');
  // Member-level Active/Deactivate is restricted to SuperAdmin, not the `vendors:status_change`
  // permission every other status action here uses — a role flag, not a menu permission, so it
  // has to be read off the caller's own granted roles rather than `can()`.
  const isSuperAdmin = bootstrap?.roles.some((r) => r.isSuperAdmin) ?? false;

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
  // Overview's Records row — a ChipNav switch, not a navigation (Customers/Orders are never
  // locked, so there's nothing to deep-link; see the 2026-10-04 two-column design spec §3).
  const [recordsTab, setRecordsTab] = useState<'customers' | 'orders'>('customers');

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
    if (key === 'deals') return stepByKey('deals')?.locked ? stepByKey('deals')?.lockedReason : undefined;
    if (key === 'therapists') return stepByKey('therapists')?.locked ? stepByKey('therapists')?.lockedReason : undefined;
    if (key === 'products') return stepByKey('products')?.locked ? stepByKey('products')?.lockedReason : undefined;
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
      } else if (pending === 'suspend') {
        await setVendorStatus(token, vendor.id, 'SUSPENDED', reason.trim());
        await finish('Member suspended.');
      } else if (pending === 'superadmin_deactivate' || pending === 'superadmin_activate') {
        const nextStatus = pending === 'superadmin_deactivate' ? 'INACTIVE' : 'ACTIVE';
        await setVendorStatus(token, vendor.id, nextStatus, nextStatus === 'INACTIVE' ? reason.trim() : undefined);
        await finish(nextStatus === 'INACTIVE' ? 'Member deactivated.' : 'Member is active again.');
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
    if (canReject && vendor.status !== 'REJECTED') actionOptions.push({ value: 'reject', label: 'Reject' });
    // Deliberately no Activate/Deactivate here — that transition is SuperAdmin-only (see
    // `isSuperAdmin` above), surfaced solely by the profile card's own control, not this menu.
    if (canStatusChange && vendor.status !== 'SUSPENDED') actionOptions.push({ value: 'suspend', label: 'Suspend' });
    if (canDelete) actionOptions.push({ value: 'delete', label: 'Delete' });
  }

  const runAction = (value: string) => {
    setMessage('');
    setError('');
    if (value === 'dashboard') doAccessDashboard();
    else if (value === 'approve') doApprove();
    else if (value === 'reject' || value === 'suspend' || value === 'delete') {
      setReason('');
      setPending(value);
    }
  };

  const runSuperadminToggle = () => {
    if (!vendor) return;
    setMessage('');
    setError('');
    setReason('');
    setPending(vendor.status === 'ACTIVE' ? 'superadmin_deactivate' : 'superadmin_activate');
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
              <ChipNav
                items={[
                  { value: 'customers', label: 'Customers' },
                  { value: 'orders', label: 'Orders' },
                ]}
                value={recordsTab}
                onSelect={(value) => setRecordsTab(value as 'customers' | 'orders')}
                ariaLabel="Member records"
              />
              {recordsTab === 'customers' ? (
                <VendorDetailCustomers token={token} vendorId={vendor.id} />
              ) : (
                <VendorDetailOrders token={token} vendorId={vendor.id} />
              )}
            </section>
          </div>

          <section aria-labelledby="profile-card-title">
            <h2 id="profile-card-title" className="section-title">Profile</h2>
            <MemberSummaryCard
              vendor={vendor}
              steps={steps}
              onEditProfile={() => goToSection('profile')}
              isSuperAdmin={isSuperAdmin}
              onSuperadminToggle={runSuperadminToggle}
            />
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

      {section === 'deals' && (
        <div className="admin-tab-panel" aria-label="Deals">
          <DealsListPage token={token} vendorId={vendor.id} canEdit={canEditAny} canDelete={canDelete} />
        </div>
      )}

      {section === 'therapists' && (
        <div className="admin-tab-panel" aria-label="Therapists">
          <TherapistsListPage token={token} vendorId={vendor.id} canEdit={canEditAny} canDelete={canDelete} />
        </div>
      )}

      {section === 'products' && (
        <div className="admin-tab-panel" aria-label="Products">
          <ProductsListPage token={token} vendorId={vendor.id} canEdit={canEditAny} canDelete={canDelete} />
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
 *  and so no link — while locked; nothing to focus when nothing is actionable). Three visual
 *  states, per the 2026-10-04 two-column design spec §2: **locked** uses `tertiary` (this app's
 *  warning tone, same one the status badge uses for "incomplete"/"pending"); **done** uses
 *  `secondary`, so what's finished visibly stands out from what still needs attention; **unlocked
 *  but empty** uses `surface-high` — except Branches, which spends this app's one `primary`
 *  "start here" accent (the same role every `FilledButton` uses) while it's the single mandatory
 *  gateway nothing else unlocks without — it drops to the same `secondary` done state as the
 *  other three the moment a branch exists. */
function SetupCard({ step, href }: { step: SetupStep; href?: string }) {
  if (step.locked) {
    return <sky-tile-card color="tertiary" variant="filled" icon="lock" icon-style="surface" headline={step.label} text={stepText(step)} />;
  }
  if (step.done) {
    return <sky-tile-card color="secondary" variant="filled" icon="check_circle" icon-style="surface" headline={step.label} text={stepText(step)} href={href} />;
  }
  if (step.key === 'branches') {
    return <sky-tile-card color="primary" variant="filled" icon={STEP_ICON.branches} headline={step.label} text="No branch yet · Start here" href={href} />;
  }
  return <sky-tile-card color="surface-high" variant="filled" icon={STEP_ICON[step.key]} icon-style="surface" headline={step.label} text={stepText(step)} href={href} />;
}

/** The right-hand column of the summary tab: the member's profile card, under its own "Profile"
 *  heading so it reads as a third section alongside "Setup progress" and "Records" rather than a
 *  stray box. One `sky-card` (default `filled`, the same soft-surface language as the tile grid
 *  beside it) grouping three parts — identity, what's missing, the profile action — each on its
 *  own `List`, split by `Divider`. Every missing item carries a `sky-badge variant="error"`, the
 *  one shared component with a literal `--md-sys-color-error` role, so what still needs fixing is
 *  never just a plain grey row. */
function MemberSummaryCard({
  vendor,
  steps,
  onEditProfile,
  isSuperAdmin,
  onSuperadminToggle,
}: {
  vendor: Vendor;
  steps: SetupStep[];
  onEditProfile: () => void;
  /** Member-level Active/Deactivate is SuperAdmin-only — this control is absent from the DOM
   *  entirely for anyone else, rather than disabled-but-visible (see the 2026-10-04 two-column
   *  design spec §4: simplest implementation, and it never advertises an action a given admin
   *  can never take). */
  isSuperAdmin: boolean;
  onSuperadminToggle: () => void;
}) {
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

      {isSuperAdmin && (
        <>
          <Divider />
          <OutlinedButton onClick={onSuperadminToggle}>
            <Icon slot="icon" aria-hidden="true">{vendor.status === 'ACTIVE' ? 'toggle_off' : 'toggle_on'}</Icon>
            {vendor.status === 'ACTIVE' ? 'Deactivate member' : 'Activate member'}
          </OutlinedButton>
        </>
      )}
    </sky-card>
  );
}

export default VendorDetailPage;
