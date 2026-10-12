import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Branch, Category, Vendor } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { BreadcrumbProvider, useBreadcrumbTrail } from '../../../admin/breadcrumb-context';
import { BranchFormPage } from './branch-form-page';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const listBranchesMock = vi.fn();
const createBranchMock = vi.fn();
const updateBranchMock = vi.fn();
const listCategoriesMock = vi.fn();
const getBranchCategoryAccessMock = vi.fn();
const setBranchCategoryAccessMock = vi.fn();
const getVendorMock = vi.fn();

vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return {
    ...actual,
    listBranches: (...args: unknown[]) => listBranchesMock(...args),
    createBranch: (...args: unknown[]) => createBranchMock(...args),
    updateBranch: (...args: unknown[]) => updateBranchMock(...args),
    listCategories: (...args: unknown[]) => listCategoriesMock(...args),
    getBranchCategoryAccess: (...args: unknown[]) => getBranchCategoryAccessMock(...args),
    setBranchCategoryAccess: (...args: unknown[]) => setBranchCategoryAccessMock(...args),
    getVendor: (...args: unknown[]) => getVendorMock(...args),
  };
});

const EXISTING: Branch = {
  id: 'b1',
  vendorId: 'v1',
  name: 'Lower Parel Branch',
  address: '123 Main Road',
  city: 'Mumbai',
  state: 'Maharashtra',
  country: null,
  pincode: '400013',
  latitude: null,
  longitude: null,
  mapLocationUrl: null,
  phone: null,
  email: null,
  openingHours: null,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  _count: { deals: 0 },
  categoryTypes: [],
};

// Distinct ids for the SERVICE and THERAPY fixtures — `listCategories` is called once per type
// and the component merges both results into one `categories` array (`[...svc.data, ...thr.data]`),
// so two fixtures sharing an id (as a single shared `CATEGORY` used for both calls previously did)
// produces a React "duplicate key" warning on every render of the Category Access section.
const SERVICE_CATEGORY: Category = { id: 'c1', name: 'Massage', slug: 'massage', parentId: null, isActive: true, type: 'SERVICE' };
const THERAPY_CATEGORY: Category = { id: 'c2', name: 'Physiotherapy', slug: 'physiotherapy', parentId: null, isActive: true, type: 'THERAPY' };

const VENDOR: Vendor = {
  id: 'v1',
  businessName: 'Vitality Wellness & Beauty',
  slug: 'vitality',
  ownerUserId: 'u1',
  kycStatus: 'VERIFIED',
  kycRejectionReason: null,
  status: 'ACTIVE',
  statusReason: null,
  createdByUserId: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  offersService: true,
  offersProduct: false,
  offersTherapy: false,
  owner: { id: 'u1', name: 'Arjun Malhotra', status: 'active', roles: [] },
};

/** Renders `label` for a crumb with no `to` (the current page) and `label(to)` for a crumb that
 *  links elsewhere — same probe pattern as `vendor-detail-page.test.tsx`. */
function TrailProbe() {
  return (
    <p data-testid="trail">
      {useBreadcrumbTrail()
        .map((c) => (c.to ? `${c.label}(${c.to})` : c.label))
        .join(' > ')}
    </p>
  );
}

function renderAt(url: string, { withTrail = false }: { withTrail?: boolean } = {}) {
  listCategoriesMock.mockImplementation((_token: string | null, opts: { type?: string } = {}) =>
    Promise.resolve({ data: [opts.type === 'THERAPY' ? THERAPY_CATEGORY : SERVICE_CATEGORY] }),
  );
  getBranchCategoryAccessMock.mockResolvedValue({ data: [] });
  listBranchesMock.mockResolvedValue({ data: [EXISTING] });
  getVendorMock.mockResolvedValue({ data: VENDOR });
  const tree = (
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/account/vendors/:vendorId/branches/new" element={<BranchFormPage token="tok" />} />
        <Route path="/account/vendors/:vendorId/branches/:branchId" element={<BranchFormPage token="tok" />} />
      </Routes>
    </MemoryRouter>
  );
  return render(
    withTrail ? (
      <BreadcrumbProvider>
        <TrailProbe />
        {tree}
      </BreadcrumbProvider>
    ) : (
      tree
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// Branch Name is always the first `md-outlined-text-field` (Address/PIN/Map Location follow it)
// and State is always the first `md-outlined-select` (City follows it) — same tag-name + DOM-order
// query convention `vendor-branches.test.tsx` already uses for these fields. A `[label="..."]`
// attribute selector cannot be used here: Material Web's `TextField`/`Select` declare `label`
// (and `value`) as plain, non-reflected Lit properties (see `@material/web/textfield/internal/
// text-field.js`), so React 19's custom-element algorithm always sets them as JS properties, never
// as HTML attributes — true for both the shared-ui React wrappers and raw elements alike.
const branchNameField = () => document.querySelectorAll('md-outlined-text-field')[0] as (HTMLElement & { value?: string }) | undefined;
const stateField = () => document.querySelectorAll('md-outlined-select')[0] as HTMLElement | undefined;

// `md-outlined-select`'s own `value` setter resolves against its slotted `<md-select-option>`
// children via an internal DOM query (`this.menu.items`) that isn't reliably populated
// synchronously under jsdom (no other test in this codebase drives a real `md-outlined-select`
// selection for this reason). Defining `value` as an own property shadows the inherited Lit
// accessor for reads, so the component's `onChange` handler (which reads `e.currentTarget.value`)
// sees the picked value deterministically, without depending on that internal query's timing.
function pickOption(select: HTMLElement, value: string) {
  Object.defineProperty(select, 'value', { configurable: true, writable: true, enumerable: true, value });
  fireEvent.change(select);
}

function findSaveButton() {
  return Array.from(document.querySelectorAll('md-filled-button')).find((b) => b.textContent?.trim() === 'Save');
}

/** Waits for the Save button to exist AND be enabled (not `disabled`) — `disabled` on
 *  `md-filled-button` is a real, reflected Lit attribute (unlike `label`/`value`), so this is a
 *  reliable readiness gate for tests that need to click a Save that starts out disabled while
 *  `categoriesLoading`/`!locationUnlocked`. */
async function getEnabledSaveButton() {
  return waitFor(() => {
    const save = findSaveButton();
    if (!save || save.hasAttribute('disabled')) throw new Error('Save not enabled yet');
    return save;
  });
}

describe('BranchFormPage — Add', () => {
  it('starts with every field but State disabled', async () => {
    renderAt('/account/vendors/v1/branches/new');
    expect(await screen.findByRole('heading', { name: 'Add branch' })).toBeTruthy();
    const name = branchNameField();
    expect(name?.hasAttribute('disabled')).toBe(true);
    const state = stateField();
    expect(state?.hasAttribute('disabled')).toBeFalsy();
  });

  it('enables the rest of Location once a state is picked', async () => {
    renderAt('/account/vendors/v1/branches/new');
    await screen.findByRole('heading', { name: 'Add branch' });
    const state = stateField() as HTMLElement;
    pickOption(state, 'Maharashtra');
    await waitFor(() => {
      const name = branchNameField();
      expect(name?.hasAttribute('disabled')).toBe(false);
    });
  });

  it('creates the branch and redirects to its own edit page', async () => {
    createBranchMock.mockResolvedValue({ data: { ...EXISTING, id: 'new-1' } });
    setBranchCategoryAccessMock.mockResolvedValue({ data: [] });
    renderAt('/account/vendors/v1/branches/new');
    await screen.findByRole('heading', { name: 'Add branch' });
    const state = stateField() as HTMLElement;
    pickOption(state, 'Maharashtra');
    const name = await waitFor(() => {
      const el = branchNameField();
      if (!el || el.hasAttribute('disabled')) throw new Error('not enabled yet');
      return el;
    }) as HTMLElement & { value: string };
    name.value = 'New Branch';
    fireEvent.input(name);
    const save = await getEnabledSaveButton();
    fireEvent.click(save);
    await waitFor(() => expect(createBranchMock).toHaveBeenCalledWith('tok', 'v1', expect.objectContaining({ name: 'New Branch', state: 'Maharashtra' })));
    await waitFor(() => expect(setBranchCategoryAccessMock).toHaveBeenCalledWith('tok', 'v1', 'new-1', { mappings: [] }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/account/vendors/v1/branches/new-1', { replace: true }));
  });

  it('shows a required-name error and never calls createBranch when Branch Name is left empty', async () => {
    renderAt('/account/vendors/v1/branches/new');
    await screen.findByRole('heading', { name: 'Add branch' });
    const state = stateField() as HTMLElement;
    pickOption(state, 'Maharashtra');
    const save = await getEnabledSaveButton();
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByText('Branch name is required.')).toBeTruthy());
    expect(createBranchMock).not.toHaveBeenCalled();
  });

  it('a setBranchCategoryAccess rejection after a successful branch save shows the combined error and does not navigate', async () => {
    createBranchMock.mockResolvedValue({ data: { ...EXISTING, id: 'new-1' } });
    setBranchCategoryAccessMock.mockRejectedValue(new ApiRequestError('VALIDATION_ERROR', 'Category X is invalid', 400));
    renderAt('/account/vendors/v1/branches/new');
    await screen.findByRole('heading', { name: 'Add branch' });
    const state = stateField() as HTMLElement;
    pickOption(state, 'Maharashtra');
    const name = await waitFor(() => {
      const el = branchNameField();
      if (!el || el.hasAttribute('disabled')) throw new Error('not enabled yet');
      return el;
    }) as HTMLElement & { value: string };
    name.value = 'New Branch';
    fireEvent.input(name);
    const save = await getEnabledSaveButton();
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByText('Branch saved, but categories could not be saved: Category X is invalid')).toBeTruthy());
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

describe('BranchFormPage — Edit', () => {
  it('loads the existing branch and shows every field already enabled', async () => {
    renderAt('/account/vendors/v1/branches/b1');
    expect(await screen.findByRole('heading', { name: 'Edit branch' })).toBeTruthy();
    const name = await waitFor(() => {
      const el = branchNameField();
      if (!el || el.hasAttribute('disabled')) throw new Error('not enabled yet');
      return el;
    });
    expect(name?.hasAttribute('disabled')).toBe(false);
    expect(name?.value).toBe('Lower Parel Branch');
  });

  it('saves with updateBranch, not createBranch', async () => {
    updateBranchMock.mockResolvedValue({ data: EXISTING });
    setBranchCategoryAccessMock.mockResolvedValue({ data: [] });
    renderAt('/account/vendors/v1/branches/b1');
    await screen.findByRole('heading', { name: 'Edit branch' });
    const save = await getEnabledSaveButton();
    fireEvent.click(save);
    await waitFor(() => expect(updateBranchMock).toHaveBeenCalledWith('tok', 'v1', 'b1', expect.objectContaining({ name: 'Lower Parel Branch' })));
    await waitFor(() => expect(setBranchCategoryAccessMock).toHaveBeenCalledWith('tok', 'v1', 'b1', { mappings: [] }));
    expect(createBranchMock).not.toHaveBeenCalled();
  });

  it('keeps Save disabled while categoriesLoading is still true, even though the branch itself already loaded', async () => {
    let openGate: () => void = vi.fn();
    const gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    listCategoriesMock.mockImplementation((_token: string | null, opts: { type?: string } = {}) =>
      gate.then(() => ({ data: [opts.type === 'THERAPY' ? THERAPY_CATEGORY : SERVICE_CATEGORY] })),
    );
    getBranchCategoryAccessMock.mockResolvedValue({ data: [] });
    listBranchesMock.mockResolvedValue({ data: [EXISTING] });
    render(
      <MemoryRouter initialEntries={['/account/vendors/v1/branches/b1']}>
        <Routes>
          <Route path="/account/vendors/:vendorId/branches/:branchId" element={<BranchFormPage token="tok" />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'Edit branch' });
    // The branch itself (and its `state`, unlocking Location) has already loaded — only the
    // category-access fetch is still pending — yet Save must stay disabled the whole time.
    const save = await waitFor(() => {
      const el = findSaveButton();
      if (!el) throw new Error('Save button not found');
      return el;
    });
    expect(save.hasAttribute('disabled')).toBe(true);
    openGate();
    await waitFor(() => expect(save.hasAttribute('disabled')).toBe(false));
  });

  it('shows the fetch error instead of "No active..." when the categories fetch fails', async () => {
    listCategoriesMock.mockRejectedValue(new ApiRequestError('SERVER_ERROR', 'Categories service is down', 500));
    getBranchCategoryAccessMock.mockResolvedValue({ data: [] });
    listBranchesMock.mockResolvedValue({ data: [EXISTING] });
    render(
      <MemoryRouter initialEntries={['/account/vendors/v1/branches/b1']}>
        <Routes>
          <Route path="/account/vendors/:vendorId/branches/:branchId" element={<BranchFormPage token="tok" />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'Edit branch' });
    await waitFor(() => expect(screen.getByText('Categories service is down')).toBeTruthy());
    expect(screen.queryByText('No active Service or Therapy categories exist yet.')).toBeNull();
  });

  it('shows the vendor\'s real business name in the breadcrumb, not the literal "Member"', async () => {
    renderAt('/account/vendors/v1/branches/b1', { withTrail: true });
    await screen.findByRole('heading', { name: 'Edit branch' });
    expect(getVendorMock).toHaveBeenCalledWith('tok', 'v1');
    await waitFor(() =>
      expect(screen.getByTestId('trail').textContent).toBe(
        'Members > All Member(/account/vendors) > Vitality Wellness & Beauty(/account/vendors/v1) > Branches(/account/vendors/v1/branches) > Lower Parel Branch',
      ),
    );
  });
});
