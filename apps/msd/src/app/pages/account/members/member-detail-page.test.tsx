import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Vendor } from '../../../../api/rbac/vendors';
import { BreadcrumbProvider } from '../../../admin/breadcrumb-context';
import { SnackbarHost } from '../../../../snackbar/snackbar';
import { MemberDetailPage } from './member-detail-page';
import { REVIEW_FLAG_LABEL, REVIEW_FLAG_REASON, REVIEW_FLAG_TONE } from './member-status';
import { ApiRequestError } from '../../../../api/rbac/client';

const getMemberMock = vi.fn();
const changeStatusMock = vi.fn();
const deleteMemberMock = vi.fn();
const sendReminderMock = vi.fn();
const useAuthMock = vi.fn();
const headerProps = vi.fn();
const documentsProps = vi.fn();
const activityProps = vi.fn();
const profileProps = vi.fn();

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => useAuthMock() }));
vi.mock('../../../../api/rbac/members', () => ({
  getMember: (...a: unknown[]) => getMemberMock(...a),
  changeMemberStatus: (...a: unknown[]) => changeStatusMock(...a),
  deleteMember: (...a: unknown[]) => deleteMemberMock(...a),
  sendMemberReminder: (...a: unknown[]) => sendReminderMock(...a),
}));
vi.mock('./branches-list-page', () => ({ BranchesListPage: () => <p>branches-tab</p> }));
vi.mock('./deals-list-page', () => ({ DealsListPage: () => <p>deals-tab</p> }));
vi.mock('./therapists-list-page', () => ({ TherapistsListPage: () => <p>therapists-tab</p> }));
vi.mock('./products-list-page', () => ({ ProductsListPage: () => <p>products-tab</p> }));
vi.mock('./vendor-profile-form', () => ({
  VendorProfileForm: (props: { canEdit: boolean }) => {
    profileProps(props);
    return <p>profile-form</p>;
  },
  extractVendorFieldErrors: () => null,
}));
vi.mock('./member-documents-tab', () => ({
  MemberDocumentsTab: (props: Record<string, unknown>) => {
    documentsProps(props);
    return <h3>documents-tab</h3>;
  },
}));
vi.mock('./member-activity-tab', () => ({
  MemberActivityTab: (props: { refreshKey: number }) => {
    activityProps(props);
    return <p>activity-tab {props.refreshKey}</p>;
  },
}));
vi.mock('./member-header-actions', () => ({
  MemberHeaderActions: (props: {
    reasonPrefill: string;
    canStatusChange: boolean;
    canDelete: boolean;
    onChangeStatus: (s: string, r: string) => Promise<void>;
    onDelete: (r: string) => Promise<void>;
  }) => {
    headerProps(props);
    return (
      <div>
        <button type="button" onClick={() => props.onChangeStatus('INACTIVE', 'Owner asked for a pause')}>
          stub-change
        </button>
        <button type="button" onClick={() => props.onDelete('Closed the business for good')}>
          stub-delete
        </button>
      </div>
    );
  },
}));

const MEMBER = {
  id: 'm1',
  businessName: 'Vitality Wellness',
  status: 'ACTIVE',
  statusReason: null,
  reviewFlaggedAt: null,
  owner: { id: 'o1', name: 'Arjun', status: 'active', roles: [] },
  documentsSummary: { complete: false, missing: ['PAN'], rejected: [], dueAt: '2026-10-20T00:00:00Z', overdue: false },
} as unknown as Vendor;

function Where() {
  const { pathname } = useLocation();
  return <p data-testid="where">{pathname}</p>;
}

function renderAt(path: string) {
  return render(
    <BreadcrumbProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/account/members" element={<p>members-list</p>} />
          <Route path="/account/members/:memberId" element={<MemberDetailPage />} />
          <Route path="/account/members/:memberId/:section" element={<MemberDetailPage />} />
        </Routes>
        <Where />
      </MemoryRouter>
      <SnackbarHost />
    </BreadcrumbProvider>,
  );
}

function tabs(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('md-primary-tab'));
}

function tab(label: string): HTMLElement {
  const el = tabs().find((t) => t.textContent?.trim() === label);
  if (!el) throw new Error(`Tab "${label}" not found`);
  return el;
}

beforeEach(() => {
  vi.clearAllMocks();
  getMemberMock.mockResolvedValue({ data: MEMBER });
  changeStatusMock.mockResolvedValue({ data: MEMBER });
  deleteMemberMock.mockResolvedValue({ data: { outcome: 'DELETED' } });
  useAuthMock.mockReturnValue({ token: 't', can: () => true });
});

describe('MemberDetailPage', () => {
  it('shows the status chip, the documents chip and the due date in the header', async () => {
    renderAt('/account/members/m1');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Vitality Wellness' })).toBeTruthy());
    const badges = Array.from(document.querySelectorAll('sky-badge')).map((b) => b.textContent);
    expect(badges).toContain('Active');
    expect(badges).toContain('Documents incomplete');
    expect(screen.getByText(/Due 20 Oct 2026/)).toBeTruthy();
  });

  it('opens the profile tab by default and the deals tab from the URL', async () => {
    renderAt('/account/members/m1');
    await waitFor(() => expect(screen.getByText('profile-form')).toBeTruthy());
    renderAt('/account/members/m1/deals');
    await waitFor(() => expect(screen.getByText('deals-tab')).toBeTruthy());
  });

  it('renders the seven tabs wired to one labelled tab panel', async () => {
    renderAt('/account/members/m1/documents');
    await waitFor(() => expect(screen.getByText('documents-tab')).toBeTruthy());
    expect(tabs().map((t) => t.textContent?.trim())).toEqual(['Profile', 'Documents', 'Branches', 'Deals', 'Therapists', 'Products', 'Activity']);
    expect(document.querySelector('md-tabs')?.getAttribute('aria-label')).toBe('Member sections');
    const active = tab('Documents');
    const panel = screen.getByRole('tabpanel');
    expect(active.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(active.id);
    expect((active as HTMLElement & { active: boolean }).active).toBe(true);
    expect((tab('Profile') as HTMLElement & { active: boolean }).active).toBe(false);
    expect(tabs().filter((t) => t.hasAttribute('aria-controls'))).toHaveLength(1);
  });

  it('puts an h2 between the page h1 and the documents tab h3', async () => {
    renderAt('/account/members/m1/documents');
    await waitFor(() => expect(screen.getByText('documents-tab')).toBeTruthy());
    const levels = Array.from(document.querySelectorAll('h1, h2, h3')).map((h) => Number(h.tagName[1]));
    expect(levels).toEqual([1, 2, 3]);
    expect(screen.getByRole('heading', { level: 2, name: 'Documents' })).toBeTruthy();
  });

  it('changes the URL when a tab is chosen', async () => {
    renderAt('/account/members/m1');
    await waitFor(() => expect(screen.getByText('profile-form')).toBeTruthy());
    fireEvent.click(tab('Activity'));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/account/members/m1/activity'));
    expect(screen.getByText(/activity-tab/)).toBeTruthy();
  });

  it('does not show Approve, Reject, setup progress, Customers or Orders', async () => {
    renderAt('/account/members/m1');
    await waitFor(() => expect(screen.getByText('profile-form')).toBeTruthy());
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/Approve|Reject|Setup progress|Customers|Orders/);
  });

  it('explains a suspended member', async () => {
    getMemberMock.mockResolvedValue({ data: { ...MEMBER, status: 'SUSPENDED', statusReason: 'Documents not completed' } });
    renderAt('/account/members/m1');
    await waitFor(() => expect(screen.getByText(/This member cannot log in and the website hides their items\./)).toBeTruthy());
    expect(screen.getByText(/Documents not completed/)).toBeTruthy();
  });

  it('shows a view-only note for an inactive member', async () => {
    getMemberMock.mockResolvedValue({ data: { ...MEMBER, status: 'INACTIVE' } });
    renderAt('/account/members/m1');
    await waitFor(() => expect(screen.getByText(/view only/i)).toBeTruthy());
  });

  it('shows the review badge and prefills the suspend reason only when flagged', async () => {
    getMemberMock.mockResolvedValue({ data: { ...MEMBER, reviewFlaggedAt: '2026-10-14T00:00:00Z' } });
    renderAt('/account/members/m1');
    const badge = await screen.findByText(REVIEW_FLAG_LABEL);
    expect(badge.closest('sky-badge')?.getAttribute('status')).toBe(REVIEW_FLAG_TONE);
    expect(headerProps).toHaveBeenLastCalledWith(expect.objectContaining({ reasonPrefill: REVIEW_FLAG_REASON }));
  });

  it('passes no reason prefill when the member is not flagged', async () => {
    renderAt('/account/members/m1');
    await waitFor(() => expect(headerProps).toHaveBeenCalled());
    expect(screen.queryByText(REVIEW_FLAG_LABEL)).toBeNull();
    expect(headerProps).toHaveBeenLastCalledWith(expect.objectContaining({ reasonPrefill: '' }));
  });

  it('drops the review badge once the flagged member is suspended', async () => {
    getMemberMock.mockResolvedValue({ data: { ...MEMBER, status: 'SUSPENDED', reviewFlaggedAt: '2026-10-14T00:00:00Z' } });
    renderAt('/account/members/m1');
    await waitFor(() => expect(headerProps).toHaveBeenCalled());
    expect(screen.queryByText(REVIEW_FLAG_LABEL)).toBeNull();
  });

  it('refetches the member and bumps the activity key after a status change', async () => {
    renderAt('/account/members/m1/activity');
    await waitFor(() => expect(screen.getByText('activity-tab 0')).toBeTruthy());
    getMemberMock.mockResolvedValue({ data: { ...MEMBER, status: 'INACTIVE' } });
    fireEvent.click(screen.getByText('stub-change'));
    await waitFor(() => expect(screen.getByText('activity-tab 1')).toBeTruthy());
    expect(changeStatusMock).toHaveBeenCalledWith('t', 'm1', 'INACTIVE', 'Owner asked for a pause');
    expect(document.querySelector('sky-snackbar')?.textContent).toContain('Member is inactive and view only.');
    expect(getMemberMock).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(Array.from(document.querySelectorAll('sky-badge')).map((b) => b.textContent)).toContain('Inactive'));
  });

  it('goes back to the member list after a delete', async () => {
    renderAt('/account/members/m1');
    await waitFor(() => expect(screen.getByText('stub-delete')).toBeTruthy());
    fireEvent.click(screen.getByText('stub-delete'));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/account/members'));
    expect(deleteMemberMock).toHaveBeenCalledWith('t', 'm1', 'Closed the business for good');
  });

  it('wires the permissions to the tabs and actions', async () => {
    useAuthMock.mockReturnValue({
      token: 't',
      can: (_menu: string, action: string) => action === 'view' || action === 'approve',
    });
    renderAt('/account/members/m1');
    await waitFor(() => expect(screen.getByText('profile-form')).toBeTruthy());
    expect(profileProps).toHaveBeenLastCalledWith(expect.objectContaining({ canEdit: false }));
    expect(headerProps).toHaveBeenLastCalledWith(expect.objectContaining({ canStatusChange: false, canDelete: false }));
    fireEvent.click(tab('Documents'));
    await waitFor(() => expect(documentsProps).toHaveBeenCalled());
    expect(documentsProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ token: 't', memberId: 'm1', canEdit: false, canApprove: true, canReject: false }),
    );
  });

  it('shows an access message without members:view', async () => {
    useAuthMock.mockReturnValue({ token: 't', can: () => false });
    renderAt('/account/members/m1');
    expect(screen.getByText(/do not have access/i)).toBeTruthy();
    expect(getMemberMock).not.toHaveBeenCalled();
  });

  it('shows an error when the member cannot load', async () => {
    getMemberMock.mockRejectedValue(new Error('boom'));
    renderAt('/account/members/m1');
    expect((await screen.findByRole('alert')).textContent).toMatch(/Could not load this member/);
  });
});

describe('MemberDetailPage Remind now', () => {
  type HeaderProps = { onRemind?: () => Promise<void> };
  const lastHeader = () => headerProps.mock.lastCall?.[0] as HeaderProps;
  const asStaff = (granted: string[]) =>
    useAuthMock.mockReturnValue({ token: 't', can: (key: string, action: string) => key === 'members' && granted.includes(action) });

  it('offers Remind now to members:status_change while documents are incomplete', async () => {
    asStaff(['view', 'status_change']);
    renderAt('/account/members/m1');
    await waitFor(() => expect(lastHeader()?.onRemind).toBeTypeOf('function'));
  });

  it.each([
    ['without members:status_change', ['view'], MEMBER],
    ['once documents are complete', ['view', 'status_change'], { ...MEMBER, documentsSummary: { complete: true, missing: [], rejected: [], dueAt: null, overdue: false } }],
    ['for a suspended member', ['view', 'status_change'], { ...MEMBER, status: 'SUSPENDED' }],
  ])('hides Remind now %s', async (_label, granted, found) => {
    asStaff(granted as string[]);
    getMemberMock.mockResolvedValue({ data: found });
    renderAt('/account/members/m1');
    await waitFor(() => expect(headerProps).toHaveBeenCalled());
    expect(lastHeader()).not.toHaveProperty('onRemind');
  });

  it('sends the reminder, shows what reached the member and refreshes Activity', async () => {
    asStaff(['view', 'status_change']);
    sendReminderMock.mockResolvedValue({ data: { emailStatus: 'SENT', smsStatus: 'SENT', sentAt: '2026-10-17T04:30:00Z' } });
    renderAt('/account/members/m1/activity');
    await waitFor(() => expect(lastHeader()?.onRemind).toBeTypeOf('function'));
    const before = activityProps.mock.lastCall?.[0].refreshKey;
    await lastHeader().onRemind?.();
    expect(sendReminderMock).toHaveBeenCalledWith('t', 'm1');
    expect(await screen.findByText('Reminder sent by email and SMS.')).toBeTruthy();
    await waitFor(() => expect(activityProps.mock.lastCall?.[0].refreshKey).toBe(before + 1));
  });

  it('shows the server reason when the reminder is refused', async () => {
    asStaff(['view', 'status_change']);
    sendReminderMock.mockRejectedValue(new ApiRequestError('RATE_LIMITED', 'A reminder already went to this member in the last 24 hours.', 429));
    renderAt('/account/members/m1');
    await waitFor(() => expect(lastHeader()?.onRemind).toBeTypeOf('function'));
    await lastHeader().onRemind?.();
    expect(await screen.findByText('A reminder already went to this member in the last 24 hours.')).toBeTruthy();
  });
});
