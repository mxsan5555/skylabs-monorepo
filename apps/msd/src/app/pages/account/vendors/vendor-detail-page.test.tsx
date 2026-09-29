import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Vendor } from '../../../../api/rbac/vendors';
import { BreadcrumbProvider, useBreadcrumbTrail } from '../../../admin/breadcrumb-context';
import { VendorDetailPage } from './vendor-detail-page';

const getVendorMock = vi.fn();

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ token: 'tok', can: () => true, loginAsUser: vi.fn() }),
}));

vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return {
    ...actual,
    getVendor: (...args: unknown[]) => getVendorMock(...args),
    listCategories: vi.fn().mockResolvedValue({ data: [] }),
    listVendorTherapistsForAdmin: vi.fn().mockResolvedValue({ data: [] }),
  };
});

// The tab bodies are tested on their own; here they only mark which tab is showing.
vi.mock('./vendor-pipeline', () => ({ VendorPipeline: () => <p>pipeline-tab</p> }));
vi.mock('./vendor-branches', () => ({ VendorBranches: () => <p>branches-tab</p> }));
vi.mock('./vendor-detail-customers', () => ({ VendorDetailCustomers: () => <p>customers-tab</p> }));
vi.mock('./vendor-detail-orders', () => ({ VendorDetailOrders: () => <p>orders-tab</p> }));

const COMPLETE: Vendor = {
  id: 'v1',
  businessName: 'Vitality Wellness & Beauty',
  slug: 'vitality',
  businessEmail: 'a@b.co',
  businessPhone: '9876501105',
  ownerFirstName: 'Arjun',
  ownerLastName: 'Malhotra',
  ownerMobile: '9876501105',
  ownerEmail: 'arjun@b.co',
  address: '1 Main Road',
  city: 'Delhi',
  state: 'Delhi',
  pincode: '110024',
  latitude: 28.5,
  longitude: 77.2,
  documents: [{ id: 'd1' }] as unknown as Vendor['documents'],
  ownerUserId: 'u1',
  kycStatus: 'VERIFIED',
  kycRejectionReason: null,
  status: 'ACTIVE',
  statusReason: null,
  createdByUserId: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  offersService: true,
  offersProduct: true,
  offersTherapy: true,
  owner: { id: 'u1', name: 'Arjun Malhotra', status: 'active', roles: [] },
  _count: { branches: 9, deals: 18, products: 18, therapists: 12 },
  liveCounts: { branches: 9, deals: 5, products: 18, therapists: 12 },
};

/** A prop set on a sky-* element, or its attribute when jsdom has not upgraded the element. */
function attr(el: Element, name: string): string | null {
  const value = (el as unknown as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : el.getAttribute(name);
}

/** The left column's four setup-step tiles (Profile is folded into the right-hand summary card,
 *  so it is not one of these). */
function stepCards(): Element[] {
  return Array.from(document.querySelectorAll('section[aria-labelledby="setup-progress-title"] sky-tile-card'));
}

/** The right-hand `sky-card`'s three `md-list-item` rows for a given `md-list` (identified by
 *  its position: 0 = identity, 1 = what's missing). */
function summaryListItems(index: number): Element[] {
  const card = document.querySelector('sky-card[aria-label="Member profile"]');
  const list = card?.querySelectorAll('md-list')[index];
  return Array.from(list?.querySelectorAll('md-list-item') ?? []);
}

function listItemText(item: Element): { headline: string | null; supporting: string | null } {
  return {
    headline: item.querySelector('[slot="headline"]')?.textContent ?? null,
    supporting: item.querySelector('[slot="supporting-text"]')?.textContent ?? null,
  };
}

/** Renders `label` for a crumb with no `to` (the current page) and `label(to)` for a crumb that
 *  links elsewhere — the real link is only rendered by AdminLayout, not part of this test tree. */
function TrailProbe() {
  return (
    <p data-testid="trail">
      {useBreadcrumbTrail()
        .map((c) => (c.to ? `${c.label}(${c.to})` : c.label))
        .join(' > ')}
    </p>
  );
}

/** The Records section's browse-only tiles (Customers, Orders). */
function recordCards(): Element[] {
  return Array.from(document.querySelectorAll('section[aria-labelledby="records-title"] sky-tile-card'));
}

function renderPage(vendor: Vendor, url = '/account/vendors/v1') {
  getVendorMock.mockResolvedValue({ data: vendor });
  return render(
    <BreadcrumbProvider>
      <TrailProbe />
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/account/vendors/:vendorId" element={<VendorDetailPage />} />
          <Route path="/account/vendors/:vendorId/:section" element={<VendorDetailPage />} />
        </Routes>
      </MemoryRouter>
    </BreadcrumbProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Feature: Member page (`/account/vendors/:vendorId` = Overview, `/account/vendors/:vendorId/:section`
 * for each other section)
 * Scenario: an admin opens one member and sees a card-driven Overview — no tab strip — with a
 * setup checklist of real counts, a Records row, the actions that fit the member's status, and
 * every card navigating to its own URL with a matching breadcrumb; a locked or unknown section in
 * the URL falls back to Overview.
 */
describe('VendorDetailPage', () => {
  it('loads the member by the id in the URL and shows the name, status and breadcrumb trail', async () => {
    renderPage(COMPLETE);
    expect(await screen.findByRole('heading', { level: 1, name: 'Vitality Wellness & Beauty' })).toBeTruthy();
    expect(getVendorMock).toHaveBeenCalledWith('tok', 'v1');
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByTestId('trail').textContent).toBe('Members > All Member(/account/vendors) > Vitality Wellness & Beauty'));
  });

  it('has no tab strip — md-tabs is not rendered', async () => {
    renderPage(COMPLETE);
    await screen.findByRole('heading', { level: 1 });
    expect(document.querySelector('md-tabs')).toBeNull();
  });

  it('shows the four content steps as small linked tiles, each naming its own action', async () => {
    renderPage(COMPLETE);
    await screen.findByRole('heading', { level: 1 });
    expect(stepCards().map((c) => [attr(c, 'headline'), attr(c, 'text'), attr(c, 'icon'), attr(c, 'href')])).toEqual([
      ['Branches', '9 added · Edit', 'check_circle', '/account/vendors/v1/branches'],
      ['Deals', '5 of 18 live · Edit', 'check_circle', '/account/vendors/v1/branches'],
      ['Therapists', '12 added · Edit', 'check_circle', '/account/vendors/v1/therapists'],
      ['Products', '18 added · Edit', 'check_circle', '/account/vendors/v1/profile'],
    ]);
  });

  it('a not-done or locked step uses the tertiary (warning) colour, not a plain grey', async () => {
    renderPage({ ...COMPLETE, _count: { branches: 0, deals: 0, products: 0, therapists: 0 }, liveCounts: undefined });
    await screen.findByRole('heading', { level: 1 });
    // Branches is unlocked and empty (tertiary/warning + a link); the rest are locked (tertiary, no link).
    expect(stepCards().map((c) => [attr(c, 'color'), attr(c, 'href') != null])).toEqual([
      ['tertiary', true],
      ['tertiary', false],
      ['tertiary', false],
      ['tertiary', false],
    ]);
  });

  it('locks every content step, says why, and gives it no link (nothing to click) while the profile is incomplete', async () => {
    renderPage({ ...COMPLETE, ownerMobile: '', _count: { branches: 0, deals: 0, products: 0, therapists: 0 }, liveCounts: undefined, status: 'PROFILE_INCOMPLETE' });
    await screen.findByRole('heading', { level: 1 });
    expect(stepCards().map((c) => [attr(c, 'headline'), attr(c, 'text'), attr(c, 'icon'), attr(c, 'href')])).toEqual([
      ['Branches', 'Finish the profile first', 'lock', null],
      ['Deals', 'Add a branch first', 'lock', null],
      ['Therapists', 'Add a branch first', 'lock', null],
      ['Products', 'Add a branch first', 'lock', null],
    ]);
  });

  it('a done step is coloured secondary — visibly different from a step that still needs attention', async () => {
    renderPage(COMPLETE);
    await screen.findByRole('heading', { level: 1 });
    expect(stepCards().every((c) => attr(c, 'color') === 'secondary')).toBe(true);
  });

  it('the hint above the setup cards names the profile card as the way to unlock everything', async () => {
    renderPage({ ...COMPLETE, ownerMobile: '', _count: { branches: 0, deals: 0, products: 0, therapists: 0 }, liveCounts: undefined });
    expect(await screen.findByText('Complete the profile on the right to unlock branches, deals, therapists and products.')).toBeTruthy();
  });

  it('shows a Customers and an Orders browse tile in a Records section, linked to their own URLs', async () => {
    renderPage(COMPLETE);
    await screen.findByRole('heading', { level: 1 });
    expect(recordCards().map((c) => [attr(c, 'headline'), attr(c, 'text'), attr(c, 'href')])).toEqual([
      ['Customers', "This member's customers · View", '/account/vendors/v1/customers'],
      ['Orders', "This member's orders · View", '/account/vendors/v1/orders'],
    ]);
  });

  it('a Records tile stays linked even when the setup steps are locked — Customers/Orders are always reachable', async () => {
    renderPage({ ...COMPLETE, ownerMobile: '', _count: { branches: 0, deals: 0, products: 0, therapists: 0 }, liveCounts: undefined });
    await screen.findByRole('heading', { level: 1 });
    expect(recordCards().every((c) => attr(c, 'href') != null)).toBe(true);
  });

  it('puts the owner, contact and KYC status on the right-hand profile card as a list', async () => {
    renderPage(COMPLETE);
    await screen.findByRole('heading', { level: 1 });
    expect(summaryListItems(0).map(listItemText)).toEqual([
      { headline: 'Arjun Malhotra', supporting: 'Owner' },
      { headline: '9876501105', supporting: 'Contact' },
      { headline: 'Verified', supporting: 'Identity check (KYC)' },
    ]);
  });

  it('lists what is missing on the profile card, and offers Edit once it is complete', async () => {
    renderPage(COMPLETE);
    await screen.findByRole('heading', { level: 1 });
    expect(summaryListItems(1).map(listItemText)).toEqual([{ headline: 'Nothing missing', supporting: null }]);
    const button = document.querySelector('sky-card[aria-label="Member profile"] md-filled-button');
    expect(button?.textContent?.trim()).toBe('Edit profile');
  });

  it('names each missing point with its step, and offers Add while the profile is incomplete', async () => {
    renderPage({ ...COMPLETE, ownerMobile: '', _count: { branches: 0, deals: 0, products: 0, therapists: 0 }, liveCounts: undefined });
    await screen.findByRole('heading', { level: 1 });
    expect(summaryListItems(1).map(listItemText)).toEqual([{ headline: 'Owner name, phone and email', supporting: 'Profile' }]);
    const button = document.querySelector('sky-card[aria-label="Member profile"] md-filled-button');
    expect(button?.textContent?.trim()).toBe('Add profile');
  });

  it('the profile card\'s action opens the profile section', async () => {
    renderPage(COMPLETE);
    await screen.findByRole('heading', { level: 1 });
    const button = document.querySelector('sky-card[aria-label="Member profile"] md-filled-button');
    if (!button) throw new Error('Edit profile button not found');
    fireEvent.click(button);
    expect(await screen.findByText('pipeline-tab')).toBeTruthy();
  });

  it('shows the status with a sky-badge', async () => {
    renderPage({ ...COMPLETE, status: 'PENDING_VERIFICATION' });
    await screen.findByRole('heading', { level: 1 });
    const badge = document.querySelector('sky-badge');
    expect(badge?.textContent).toBe('Waiting for approval');
    expect(attr(badge as Element, 'variant')).toBe('tertiary');
  });

  it('a bookmarked URL for a section that is still locked falls back to Overview with a reason', async () => {
    renderPage(
      { ...COMPLETE, ownerMobile: '', _count: { branches: 0, deals: 0, products: 0, therapists: 0 }, liveCounts: undefined },
      '/account/vendors/v1/branches',
    );
    // The redirect happens in an effect after the vendor loads, one render after the heading.
    expect(await screen.findByText('Branches & Deals is locked. Finish the profile first.')).toBeTruthy();
    expect(screen.getByText('Setup progress')).toBeTruthy();
    expect(screen.queryByText('branches-tab')).toBeNull();
  });

  it('a bookmarked URL for an unknown section falls back to Overview', async () => {
    renderPage(COMPLETE, '/account/vendors/v1/not-a-real-section');
    expect(await screen.findByText('Setup progress')).toBeTruthy();
  });

  it('opens an unlocked section straight from the URL, with the matching breadcrumb', async () => {
    renderPage(COMPLETE, '/account/vendors/v1/branches');
    expect(await screen.findByText('branches-tab')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId('trail').textContent).toBe(
        'Members > All Member(/account/vendors) > Vitality Wellness & Beauty(/account/vendors/v1) > Branches & Deals',
      ),
    );
  });

  it('offers Approve and Reject, not Deactivate, for a member waiting for approval', async () => {
    renderPage({ ...COMPLETE, status: 'PENDING_VERIFICATION' });
    await screen.findByRole('heading', { level: 1 });
    const labels = Array.from(document.querySelectorAll('md-menu-item [slot="headline"]')).map((el) => el.textContent);
    expect(labels).toEqual(["Open member's dashboard", 'Approve', 'Reject', 'Suspend', 'Delete']);
  });

  it('offers Deactivate, not Approve, for an active member', async () => {
    renderPage(COMPLETE);
    await screen.findByRole('heading', { level: 1 });
    const labels = Array.from(document.querySelectorAll('md-menu-item [slot="headline"]')).map((el) => el.textContent);
    expect(labels).toEqual(["Open member's dashboard", 'Reject', 'Deactivate', 'Suspend', 'Delete']);
  });

  it('asks for a reason in an inline panel, not a browser prompt', async () => {
    const promptSpy = vi.spyOn(window, 'prompt');
    renderPage(COMPLETE);
    await screen.findByRole('heading', { level: 1 });
    const reject = Array.from(document.querySelectorAll('md-menu-item')).find((el) => el.textContent?.includes('Reject'));
    if (!reject) throw new Error('Reject menu item not found');
    fireEvent.click(reject);
    await waitFor(() => expect(document.querySelector('sky-feature-card[headline="Reject this member"]')).toBeTruthy());
    expect(promptSpy).not.toHaveBeenCalled();
    promptSpy.mockRestore();
  });

  it('shows a way back when the member cannot be loaded', async () => {
    getVendorMock.mockRejectedValue(new Error('boom'));
    render(
      <MemoryRouter initialEntries={['/account/vendors/missing']}>
        <Routes>
          <Route path="/account/vendors/:vendorId" element={<VendorDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Back to all members')).toBeTruthy();
  });
});
