import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemberManagement } from './members';

const useAuthMock = vi.fn();
const getMyVendorMock = vi.fn();

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => useAuthMock() }));
vi.mock('../../../../api/rbac/members', () => ({ listMembers: vi.fn().mockResolvedValue({ data: [], meta: { total: 0 } }) }));
vi.mock('../../../../api/rbac/vendors', () => ({
  getMyVendor: (...a: unknown[]) => getMyVendorMock(...a),
  updateMyVendor: vi.fn(),
  listCategories: vi.fn().mockResolvedValue({ data: [] }),
}));
vi.mock('./vendor-profile-form', () => ({
  VendorProfileForm: (props: { canEdit: boolean }) => <p>{`profile-form canEdit=${String(props.canEdit)}`}</p>,
  extractVendorFieldErrors: () => null,
}));
vi.mock('./vendor-branches', () => ({ VendorBranches: () => <p>branches</p> }));
vi.mock('./member-list', () => ({ MemberList: () => <p>member-list</p> }));

function Where() {
  const { pathname, search } = useLocation();
  return <p>{`at ${pathname}${search}`}</p>;
}

function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/account/members" element={<MemberManagement />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

const VENDOR = { id: 'v1', businessName: 'Glow', status: 'ACTIVE' };

beforeEach(() => {
  vi.clearAllMocks();
  getMyVendorMock.mockResolvedValue({ data: VENDOR });
});

describe('MemberManagement legacy links', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({ token: 't', can: (key: string, action: string) => key === 'members' && action === 'view' });
  });

  it('sends an old ?vendorId= link to the member page', async () => {
    renderAt('/account/members?vendorId=v1');
    expect(await screen.findByText('at /account/members/v1')).toBeTruthy();
  });

  it('forwards an old deal link straight to the deal', async () => {
    renderAt('/account/members?vendorId=v1&branchId=b1&dealId=d1');
    expect(await screen.findByText('at /account/members/v1/deals/d1')).toBeTruthy();
  });

  it('forwards an old branch link to the branch', async () => {
    renderAt('/account/members?vendorId=v1&branchId=b1&dealId=');
    expect(await screen.findByText('at /account/members/v1/branches/b1')).toBeTruthy();
  });
});

describe('MemberManagement self service', () => {
  const asMember = (status: string | undefined) =>
    useAuthMock.mockReturnValue({
      token: 't',
      can: (key: string, action: string) => key === 'members' && action === 'custom',
      bootstrap: status ? { member: { id: 'v1', status } } : {},
    });

  it('lets an active member edit their profile', async () => {
    asMember('ACTIVE');
    renderAt('/account/members');
    expect(await screen.findByText('profile-form canEdit=true')).toBeTruthy();
  });

  it('makes the profile read only for an inactive member', async () => {
    asMember('INACTIVE');
    getMyVendorMock.mockResolvedValue({ data: { ...VENDOR, status: 'INACTIVE' } });
    renderAt('/account/members');
    expect(await screen.findByText('profile-form canEdit=false')).toBeTruthy();
  });

  it('keeps editing on when bootstrap has no member record', async () => {
    asMember(undefined);
    renderAt('/account/members');
    await waitFor(() => expect(screen.getByText('profile-form canEdit=true')).toBeTruthy());
  });
});
