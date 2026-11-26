import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VendorManagement } from './vendors';
import { listMembers } from '../../../../api/rbac/members';
import { FILTER_OPTIONS, type VendorTableParams } from './vendor-list';

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
const vendorListProps = vi.fn();
vi.mock('./vendor-list', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./vendor-list')>()),
  VendorList: (props: unknown) => {
    vendorListProps(props);
    return <p>vendor-list</p>;
  },
}));

function Where() {
  const { pathname, search } = useLocation();
  return <p>{`at ${pathname}${search}`}</p>;
}

function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/account/vendors" element={<VendorManagement />} />
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

describe('VendorManagement legacy links', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({ token: 't', can: (key: string, action: string) => key === 'members' && action === 'view' });
  });

  it('sends an old ?vendorId= link to the member page', async () => {
    renderAt('/account/vendors?vendorId=v1');
    expect(await screen.findByText('at /account/vendors/v1')).toBeTruthy();
  });

  it('forwards an old deal link straight to the deal', async () => {
    renderAt('/account/vendors?vendorId=v1&branchId=b1&dealId=d1');
    expect(await screen.findByText('at /account/vendors/v1/deals/d1')).toBeTruthy();
  });

  it('forwards an old branch link to the branch', async () => {
    renderAt('/account/vendors?vendorId=v1&branchId=b1&dealId=');
    expect(await screen.findByText('at /account/vendors/v1/branches/b1')).toBeTruthy();
  });
});

describe('VendorManagement self service', () => {
  const asMember = (status: string | undefined) =>
    useAuthMock.mockReturnValue({
      token: 't',
      can: (key: string, action: string) => key === 'members' && action === 'custom',
      bootstrap: status ? { member: { id: 'v1', status } } : {},
    });

  it('lets an active member edit their profile', async () => {
    asMember('ACTIVE');
    renderAt('/account/vendors');
    expect(await screen.findByText('profile-form canEdit=true')).toBeTruthy();
  });

  it('makes the profile read only for an inactive member', async () => {
    asMember('INACTIVE');
    getMyVendorMock.mockResolvedValue({ data: { ...VENDOR, status: 'INACTIVE' } });
    renderAt('/account/vendors');
    expect(await screen.findByText('profile-form canEdit=false')).toBeTruthy();
  });

  it('keeps editing on when bootstrap has no member record', async () => {
    asMember(undefined);
    renderAt('/account/vendors');
    await waitFor(() => expect(screen.getByText('profile-form canEdit=true')).toBeTruthy());
  });
});

describe('VendorManagement list filter', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({ token: 't', can: (key: string, action: string) => key === 'members' && action === 'view' });
  });

  /** The only list-query keys a filter choice may set. */
  const FILTER_KEYS = ['status', 'documents', 'reviewFlag'] as const;

  /** Picks the filter value in the (mocked) table and returns the filter keys of the next list call. */
  async function queryFor(filter: string) {
    renderAt('/account/vendors');
    await waitFor(() => expect(listMembers).toHaveBeenCalled());
    const { onParamsChange } = vendorListProps.mock.lastCall?.[0] as { onParamsChange: (p: VendorTableParams) => void };
    vi.mocked(listMembers).mockClear();
    act(() => onParamsChange({ page: 1, pageSize: 10, search: '', filter, dir: 'asc' }));
    await waitFor(() => expect(listMembers).toHaveBeenCalled());
    const query = vi.mocked(listMembers).mock.lastCall?.[1] ?? {};
    return Object.fromEntries(FILTER_KEYS.filter((key) => query[key] !== undefined).map((key) => [key, query[key]]));
  }

  it.each([
    ['ACTIVE', { status: 'ACTIVE' }],
    ['INACTIVE', { status: 'INACTIVE' }],
    ['SUSPENDED', { status: 'SUSPENDED' }],
    ['ARCHIVED', { status: 'ARCHIVED' }],
    ['documents', { documents: 'incomplete' }],
    ['review', { reviewFlag: 'true' }],
    ['', {}],
  ])('filter "%s" sends %o', async (filter, expected) => {
    expect(await queryFor(filter)).toEqual(expected);
  });

  it('maps every option in the Filter select to exactly one list filter', async () => {
    for (const option of FILTER_OPTIONS) {
      expect(Object.keys(await queryFor(option.value))).toHaveLength(1);
    }
  });
});
