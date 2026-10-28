import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdminTherapist, Branch, Category, Deal, Vendor } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { DealFormPage } from './deal-form-page';

/**
 * Feature: one deal form for staff and members (docs/msd/PLANNING.md §2.7, TESTING.md §4.2 Deals)
 * Branch first, all SERVICE categories (D10), package cards (local before the first save, one call
 * each after), inline therapists on the deal's branch, no prices or status in the body, a
 * go-live checklist.
 */

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const canMock = vi.fn(() => true);
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => ({ can: canMock }) }));

// Media is covered by media-uploader.test.tsx; here it only must receive the deal's ids.
const mediaUploaderProps = vi.fn();
vi.mock('../../../components/media-uploader', () => ({
  MediaUploader: (props: Record<string, unknown>) => {
    mediaUploaderProps(props);
    return <div data-testid="media-uploader" />;
  },
}));

const api = {
  listAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  setStatus: vi.fn(),
  copy: vi.fn(),
  remove: vi.fn(),
  addPackage: vi.fn(),
  updatePackage: vi.fn(),
  deletePackage: vi.fn(),
  reorderPackages: vi.fn(),
  setImageAlt: vi.fn(),
};
const dealApiMock = vi.fn((..._args: unknown[]) => api);
const listBranchesMock = vi.fn();
const listMyBranchesMock = vi.fn();
const listCategoriesMock = vi.fn();
const listVendorTherapistsForAdminMock = vi.fn();
const listMyTherapistsMock = vi.fn();
const createVendorTherapistMock = vi.fn();
const createTherapistMock = vi.fn();
const getVendorMock = vi.fn();

vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return {
    ...actual,
    dealApi: (...args: unknown[]) => dealApiMock(...args),
    listBranches: (...args: unknown[]) => listBranchesMock(...args),
    listMyBranches: (...args: unknown[]) => listMyBranchesMock(...args),
    listCategories: (...args: unknown[]) => listCategoriesMock(...args),
    listVendorTherapistsForAdmin: (...args: unknown[]) => listVendorTherapistsForAdminMock(...args),
    listMyTherapists: (...args: unknown[]) => listMyTherapistsMock(...args),
    createVendorTherapist: (...args: unknown[]) => createVendorTherapistMock(...args),
    createTherapist: (...args: unknown[]) => createTherapistMock(...args),
    getVendor: (...args: unknown[]) => getVendorMock(...args),
  };
});

const BRANCH_A = { id: 'b1', vendorId: 'v1', name: 'Lower Parel', city: 'Mumbai', state: 'Maharashtra', isActive: true } as Branch;
const BRANCH_B = { id: 'b2', vendorId: 'v1', name: 'Kothrud', city: 'Pune', state: 'Maharashtra', isActive: true } as Branch;
const CATEGORIES: Category[] = [
  { id: 'c1', name: 'Massage', slug: 'massage', parentId: null, isActive: true, type: 'SERVICE' },
  { id: 'c1-sub', name: 'Swedish', slug: 'swedish', parentId: 'c1', isActive: true },
];
const THERAPIST = { id: 't1', vendorId: 'v1', branchId: 'b1', therapistType: 'Massage Therapist', personName: 'Ramesh Kumar', isActive: true } as AdminTherapist;

const EXISTING: Deal = {
  id: 'd1',
  vendorId: 'v1',
  branchId: 'b1',
  categoryId: 'c1',
  subcategoryId: null,
  title: 'Deep tissue massage',
  slug: 'deep-tissue-massage-zen-spa-mumbai',
  tagline: 'Unwind in 60 minutes',
  highlights: ['Steam included'],
  originalPrice: '1499.00',
  salePrice: '1299.00',
  status: 'DRAFT',
  publishedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  category: { id: 'c1', name: 'Massage' },
  branch: { id: 'b1', name: 'Lower Parel', city: 'Mumbai' },
  packages: [
    {
      id: 'p1',
      dealId: 'd1',
      name: null,
      durationMinutes: 60,
      persons: 1,
      sellingPrice: '1299.00',
      originalPrice: '1499.00',
      inclusions: [],
      isActive: true,
      sortOrder: 0,
    },
  ],
  faqs: [],
  mediaImages: [],
  mediaVideo: null,
  therapists: [{ id: 't1', personName: 'Ramesh Kumar', therapistType: 'Massage Therapist', isActive: true }],
};

const VENDOR = { id: 'v1', businessName: 'Zen Spa', owner: null } as unknown as Vendor;

type Labelled = HTMLElement & { label?: string; value?: string };
const fieldByLabel = (label: string) =>
  Array.from(document.querySelectorAll<Labelled>('md-outlined-text-field')).find((el) => el.label === label);
const selectByLabel = (label: string) =>
  Array.from(document.querySelectorAll<Labelled>('md-outlined-select')).find((el) => el.label === label);
const button = (text: string, tag = 'md-outlined-button, md-filled-button, md-text-button') =>
  Array.from(document.querySelectorAll<HTMLElement>(tag)).find((b) => b.textContent?.trim().includes(text));

function pickOption(select: HTMLElement, value: string) {
  Object.defineProperty(select, 'value', { configurable: true, writable: true, enumerable: true, value });
  fireEvent.change(select);
}
function setText(field: Labelled | undefined, value: string) {
  if (!field) throw new Error('field not found');
  field.value = value;
  fireEvent.input(field);
}

function renderStaff(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/account/members/:vendorId/deals/new" element={<DealFormPage token="tok" />} />
        <Route path="/account/members/:vendorId/deals/:dealId" element={<DealFormPage token="tok" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  canMock.mockReturnValue(true);
  listBranchesMock.mockResolvedValue({ data: [BRANCH_A, BRANCH_B] });
  listMyBranchesMock.mockResolvedValue({ data: [BRANCH_A] });
  listCategoriesMock.mockResolvedValue({ data: CATEGORIES });
  listVendorTherapistsForAdminMock.mockResolvedValue({ data: [THERAPIST] });
  listMyTherapistsMock.mockResolvedValue({ data: [THERAPIST] });
  getVendorMock.mockResolvedValue({ data: VENDOR });
  api.listAll.mockResolvedValue({ data: [EXISTING] });
});

describe('DealFormPage — branch first', () => {
  it('a member with no branch is asked to add one and sees no form', async () => {
    listBranchesMock.mockResolvedValue({ data: [] });
    renderStaff('/account/members/v1/deals/new');
    expect(await screen.findByText(/Add a branch first/)).toBeTruthy();
    expect(selectByLabel('Branch')).toBeUndefined();
    fireEvent.click(button('Add a branch') as HTMLElement);
    expect(navigateMock).toHaveBeenCalledWith('/account/members/v1/branches/new');
  });

  it('lists every active SERVICE category (D10), not branch grants, and the subcategories of the picked one', async () => {
    renderStaff('/account/members/v1/deals/new');
    await waitFor(() => expect(selectByLabel('Category')).toBeTruthy());
    expect(listCategoriesMock).toHaveBeenCalledWith('tok', { type: 'SERVICE' });
    expect(selectByLabel('Subcategory (optional)')).toBeUndefined();
    pickOption(selectByLabel('Category') as HTMLElement, 'c1');
    await waitFor(() => expect(selectByLabel('Subcategory (optional)')).toBeTruthy());
  });

  it('?branchId= preselects the branch and shows its therapists', async () => {
    renderStaff('/account/members/v1/deals/new?branchId=b1');
    expect(await screen.findByRole('checkbox', { name: /Ramesh Kumar/ })).toBeTruthy();
  });
});

describe('DealFormPage — create', () => {
  it('validates branch, category, title (5+) and packages, and never calls create', async () => {
    renderStaff('/account/members/v1/deals/new');
    await waitFor(() => expect(button('Save as draft')).toBeTruthy());
    fireEvent.click(button('Save as draft') as HTMLElement);
    expect(await screen.findByText('Select a branch.')).toBeTruthy();
    expect(screen.getByText('Select a category.')).toBeTruthy();
    expect(screen.getByText('Add at least one package.')).toBeTruthy();
    expect(api.create).not.toHaveBeenCalled();
  });

  it('creates a draft with package cards, therapists and no price, status or slug fields, then opens its edit page', async () => {
    api.create.mockResolvedValue({ data: { ...EXISTING, id: 'new-1' } });
    renderStaff('/account/members/v1/deals/new?branchId=b1');
    await waitFor(() => expect(selectByLabel('Category')).toBeTruthy());
    pickOption(selectByLabel('Category') as HTMLElement, 'c1');
    setText(fieldByLabel('Title'), 'Swedish full body massage');
    setText(fieldByLabel('Tagline'), 'Unwind in 60 minutes');

    // The first package card opens on its own when there is none yet.
    setText(fieldByLabel('Duration (minutes)'), '60');
    setText(fieldByLabel('People'), '2');
    setText(fieldByLabel('Price'), '2499');
    fireEvent.click(button('Save package') as HTMLElement);
    expect(await screen.findByText('60 min · 2 people')).toBeTruthy();

    fireEvent.click(await screen.findByRole('checkbox', { name: /Ramesh Kumar/ }));
    fireEvent.click(button('Save as draft') as HTMLElement);

    await waitFor(() => expect(api.create).toHaveBeenCalled());
    const [branchId, body] = api.create.mock.calls[0] as [string, Record<string, unknown>];
    expect(branchId).toBe('b1');
    expect(body).toMatchObject({
      categoryId: 'c1',
      title: 'Swedish full body massage',
      tagline: 'Unwind in 60 minutes',
      therapistIds: ['t1'],
      packages: [{ durationMinutes: 60, persons: 2, sellingPrice: 2499, inclusions: [], isActive: true }],
    });
    for (const key of ['salePrice', 'originalPrice', 'discountPercent', 'durationMinutes', 'status', 'slug', 'notes', 'policy']) {
      expect(body).not.toHaveProperty(key);
    }
    expect(dealApiMock).toHaveBeenCalledWith('tok', { kind: 'staff', vendorId: 'v1' });
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/account/members/v1/deals/new-1', { replace: true }));
  });

  it('a package card refuses a duplicate duration + people', async () => {
    renderStaff('/account/members/v1/deals/new?branchId=b1');
    await waitFor(() => expect(fieldByLabel('Duration (minutes)')).toBeTruthy());
    setText(fieldByLabel('Price'), '999');
    fireEvent.click(button('Save package') as HTMLElement);
    await screen.findByText('60 min');
    fireEvent.click(button('Add package') as HTMLElement);
    setText(fieldByLabel('Price'), '1299');
    fireEvent.click(button('Save package') as HTMLElement);
    expect(await screen.findByText('Another package has the same duration and people.')).toBeTruthy();
  });

  it('adds a therapist inline on the picked branch and ticks it', async () => {
    createVendorTherapistMock.mockResolvedValue({ data: { id: 't2' } });
    renderStaff('/account/members/v1/deals/new?branchId=b1');
    await screen.findByRole('checkbox', { name: /Ramesh Kumar/ });
    setText(fieldByLabel('Type (for example Massage therapist)'), 'Physio');
    setText(fieldByLabel('Name'), 'Asha Rao');
    fireEvent.click(button('Add therapist') as HTMLElement);
    await waitFor(() => expect(createVendorTherapistMock).toHaveBeenCalledWith('tok', 'v1', 'b1', { therapistType: 'Physio', personName: 'Asha Rao' }));
    const added = await screen.findByRole('checkbox', { name: /Asha Rao/ });
    expect((added as HTMLInputElement).checked).toBe(true);
  });
});

describe('DealFormPage — edit', () => {
  it('loads the deal with the branch fixed and the media uploader on the deal', async () => {
    renderStaff('/account/members/v1/deals/d1');
    expect(await screen.findByRole('heading', { name: 'Edit deal' })).toBeTruthy();
    await waitFor(() => expect(fieldByLabel('Title')?.value).toBe('Deep tissue massage'));
    expect(selectByLabel('Branch')).toBeUndefined();
    expect(screen.getByText(/Branch: Lower Parel/)).toBeTruthy();
    expect(mediaUploaderProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ entityType: 'deal', entityId: 'd1', branchId: 'b1', selfService: false, vendorId: 'v1' }),
    );
  });

  it('saves fields with update; packages are not sent (they save per card)', async () => {
    api.update.mockResolvedValue({ data: EXISTING });
    renderStaff('/account/members/v1/deals/d1');
    await waitFor(() => expect(fieldByLabel('Title')?.value).toBe('Deep tissue massage'));
    fireEvent.click(button('Save', 'md-filled-button') as HTMLElement);
    await waitFor(() => expect(api.update).toHaveBeenCalled());
    const [branchId, dealId, body] = api.update.mock.calls[0] as [string, string, Record<string, unknown>];
    expect([branchId, dealId]).toEqual(['b1', 'd1']);
    expect(body).toMatchObject({ title: 'Deep tissue massage', tagline: 'Unwind in 60 minutes', highlights: ['Steam included'], therapistIds: ['t1'] });
    expect(body).not.toHaveProperty('packages');
    expect(api.create).not.toHaveBeenCalled();
  });

  it('a package edit on a saved deal calls the package route at once', async () => {
    api.updatePackage.mockResolvedValue({ data: EXISTING });
    renderStaff('/account/members/v1/deals/d1');
    await screen.findByText('60 min');
    fireEvent.click(button('Edit', 'md-outlined-button') as HTMLElement);
    setText(fieldByLabel('Package name (optional)'), 'Long session');
    fireEvent.click(button('Save package') as HTMLElement);
    await waitFor(() =>
      expect(api.updatePackage).toHaveBeenCalledWith('b1', 'd1', 'p1', expect.objectContaining({ name: 'Long session', durationMinutes: 60 })),
    );
  });

  it('a package delete on a saved deal shows the API refusal (409 LAST_PACKAGE)', async () => {
    api.deletePackage.mockRejectedValue(new ApiRequestError('LAST_PACKAGE', 'A deal needs at least one active package', 409));
    renderStaff('/account/members/v1/deals/d1');
    await screen.findByText('60 min');
    fireEvent.click(button('Delete', 'md-outlined-button') as HTMLElement);
    expect(await screen.findByText('A deal needs at least one active package')).toBeTruthy();
  });

  it('lists what stops it going live (no image yet)', async () => {
    renderStaff('/account/members/v1/deals/d1');
    expect(await screen.findByText('Add at least one image')).toBeTruthy();
    expect(screen.queryByText('Add an active package')).toBeNull();
    expect(button('Go live')).toBeTruthy();
  });

  it('Go live on a ready deal calls the status route', async () => {
    api.listAll.mockResolvedValue({ data: [{ ...EXISTING, mediaImages: [{ id: 'i1', storageKey: 'k', isPrimary: true, sortOrder: 0 }] }] });
    api.setStatus.mockResolvedValue({ data: { ...EXISTING, status: 'ACTIVE' } });
    renderStaff('/account/members/v1/deals/d1');
    expect(await screen.findByText('Ready to go live.')).toBeTruthy();
    fireEvent.click(button('Go live') as HTMLElement);
    await waitFor(() => expect(api.setStatus).toHaveBeenCalledWith('b1', 'd1', 'ACTIVE'));
  });

  it('copies to another branch as a draft and opens the copy', async () => {
    api.copy.mockResolvedValue({ data: { ...EXISTING, id: 'copy-1', branchId: 'b2' } });
    renderStaff('/account/members/v1/deals/d1');
    await waitFor(() => expect(selectByLabel('Target branch')).toBeTruthy());
    pickOption(selectByLabel('Target branch') as HTMLElement, 'b2');
    fireEvent.click(button('Copy') as HTMLElement);
    await waitFor(() => expect(api.copy).toHaveBeenCalledWith('b1', 'd1', 'b2'));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/account/members/v1/deals/copy-1'));
  });

  it('Delete shows only with vendors.deals:delete', async () => {
    canMock.mockReturnValue(false);
    renderStaff('/account/members/v1/deals/d1');
    await screen.findByRole('heading', { name: 'Edit deal' });
    expect(button('Delete deal')).toBeUndefined();
  });

  it('a deal id that is not the member\'s shows an error', async () => {
    api.listAll.mockResolvedValue({ data: [] });
    renderStaff('/account/members/v1/deals/missing');
    expect(await screen.findByText('Deal not found.')).toBeTruthy();
  });

  it('shows the save error when update rejects', async () => {
    api.update.mockRejectedValue(new ApiRequestError('VALIDATION_ERROR', 'Could not save this deal.', 422));
    renderStaff('/account/members/v1/deals/d1');
    await waitFor(() => expect(fieldByLabel('Title')?.value).toBe('Deep tissue massage'));
    fireEvent.click(button('Save', 'md-filled-button') as HTMLElement);
    expect(await screen.findByText('Could not save this deal.')).toBeTruthy();
  });
});

describe('DealFormPage — member surface', () => {
  it('uses the member routes, own branches and own therapists', async () => {
    createTherapistMock.mockResolvedValue({ data: { id: 't3' } });
    render(
      <MemoryRouter initialEntries={['/account/vendor-deals/new?branchId=b1']}>
        <Routes>
          <Route path="/account/vendor-deals/new" element={<DealFormPage token="tok" surface="member" />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole('checkbox', { name: /Ramesh Kumar/ });
    expect(dealApiMock).toHaveBeenCalledWith('tok', { kind: 'member' });
    expect(listMyBranchesMock).toHaveBeenCalledWith('tok');
    expect(listMyTherapistsMock).toHaveBeenCalledWith('tok', 'b1');
    expect(getVendorMock).not.toHaveBeenCalled();
    setText(fieldByLabel('Type (for example Massage therapist)'), 'Physio');
    setText(fieldByLabel('Name'), 'Asha Rao');
    fireEvent.click(button('Add therapist') as HTMLElement);
    await waitFor(() => expect(createTherapistMock).toHaveBeenCalledWith('tok', 'b1', { therapistType: 'Physio', personName: 'Asha Rao' }));
  });
});
