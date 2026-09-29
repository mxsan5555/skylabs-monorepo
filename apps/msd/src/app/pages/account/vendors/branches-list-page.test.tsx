import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Branch } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { BranchesListPage } from './branches-list-page';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const listBranchesMock = vi.fn();
const setBranchStatusMock = vi.fn();
vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return {
    ...actual,
    listBranches: (...args: unknown[]) => listBranchesMock(...args),
    setBranchStatus: (...args: unknown[]) => setBranchStatusMock(...args),
  };
});

const BRANCH_A: Branch = {
  id: 'b1',
  vendorId: 'v1',
  name: 'Lower Parel Branch',
  address: null,
  city: 'Mumbai',
  state: 'Maharashtra',
  country: null,
  pincode: null,
  latitude: null,
  longitude: null,
  mapLocationUrl: null,
  phone: null,
  email: null,
  openingHours: null,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  _count: { deals: 3 },
  categoryTypes: [],
};

const BRANCH_B: Branch = { ...BRANCH_A, id: 'b2', name: 'Colaba Branch', city: 'Mumbai', isActive: false, _count: { deals: 0 } };

function attr(el: Element, name: string): string | null {
  const value = (el as unknown as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : el.getAttribute(name);
}

function renderPage(canEdit = true) {
  listBranchesMock.mockResolvedValue({ data: [BRANCH_A, BRANCH_B] });
  return render(
    <MemoryRouter>
      <BranchesListPage token="tok" vendorId="v1" canEdit={canEdit} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BranchesListPage', () => {
  it('loads and shows one card per branch, with its location and deal count', async () => {
    renderPage();
    await waitFor(() => expect(listBranchesMock).toHaveBeenCalledWith('tok', 'v1'));
    // sky-feature-card is a custom element with no shadow-DOM rendering under jsdom (this repo's
    // documented @lit/react gap) — assert on the attributes React sets, not on rendered text/role.
    await waitFor(() => expect(document.querySelectorAll('sky-feature-card')).toHaveLength(2));
    const cards = Array.from(document.querySelectorAll('sky-feature-card'));
    expect(cards.map((c) => [attr(c, 'headline'), attr(c, 'text')])).toEqual([
      ['Lower Parel Branch', 'Maharashtra, Mumbai · Active · 3 deals'],
      ['Colaba Branch', 'Maharashtra, Mumbai · Inactive · No deals yet'],
    ]);
  });

  it('shows a heading with the branch count', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Branches' })).toBeTruthy();
    expect(await screen.findByText('2 branches')).toBeTruthy();
  });

  it('shows "Add branch" only when canEdit is true', async () => {
    renderPage(true);
    expect(await screen.findByText('Add branch')).toBeTruthy();
  });

  it('hides "Add branch" when canEdit is false', async () => {
    renderPage(false);
    await waitFor(() => expect(listBranchesMock).toHaveBeenCalled());
    expect(screen.queryByText('Add branch')).toBeNull();
  });

  it('hides each card\'s Edit/Deactivate actions when canEdit is false', async () => {
    renderPage(false);
    await waitFor(() => expect(document.querySelectorAll('sky-feature-card')).toHaveLength(2));
    expect(document.querySelectorAll('md-outlined-button')).toHaveLength(0);
  });

  it('Edit navigates to that branch\'s edit page', async () => {
    renderPage();
    // sky-feature-card renders headline/text into its shadow DOM (see the top-of-file note) —
    // wait on the attribute, same pattern as vendor-detail-page.test.tsx.
    await waitFor(() => expect(document.querySelector('sky-feature-card[headline="Lower Parel Branch"]')).toBeTruthy());
    const editButtons = document.querySelectorAll('md-outlined-button');
    const edit = Array.from(editButtons).find((b) => b.textContent?.trim() === 'Edit');
    if (!edit) throw new Error('Edit button not found');
    fireEvent.click(edit);
    expect(navigateMock).toHaveBeenCalledWith('/account/vendors/v1/branches/b1');
  });

  it('Deactivate asks for confirmation, then calls setBranchStatus(false) and reloads the list', async () => {
    setBranchStatusMock.mockResolvedValue({ data: { ...BRANCH_A, isActive: false } });
    renderPage();
    await waitFor(() => expect(document.querySelector('sky-feature-card[headline="Lower Parel Branch"]')).toBeTruthy());
    const buttons = document.querySelectorAll('md-outlined-button');
    const deactivate = Array.from(buttons).find((b) => b.textContent?.trim() === 'Deactivate');
    if (!deactivate) throw new Error('Deactivate button not found');
    fireEvent.click(deactivate);
    // useConfirmDialog renders a real <md-dialog> — confirm() only resolves once its Confirm
    // button is actually clicked, so drive that instead of stubbing window.confirm. FilledButton's
    // slotted "Confirm" text is light DOM (unlike sky-feature-card's shadow-DOM headline/text), so
    // screen.getByText reaches it directly — same pattern as customers.test.tsx.
    fireEvent.click(await screen.findByText('Confirm'));
    await waitFor(() => expect(setBranchStatusMock).toHaveBeenCalledWith('tok', 'v1', 'b1', false));
    await waitFor(() => expect(listBranchesMock).toHaveBeenCalledTimes(2));
  });

  it('shows an error when loading branches fails', async () => {
    listBranchesMock.mockRejectedValue(new ApiRequestError('INTERNAL_ERROR', 'Could not load branches.', 500));
    render(
      <MemoryRouter>
        <BranchesListPage token="tok" vendorId="v1" canEdit />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load branches.');
  });

  it('shows an error when setBranchStatus fails after confirming Deactivate', async () => {
    setBranchStatusMock.mockRejectedValue(new ApiRequestError('CONFLICT', 'Could not update this branch.', 409));
    renderPage();
    await waitFor(() => expect(document.querySelector('sky-feature-card[headline="Lower Parel Branch"]')).toBeTruthy());
    const buttons = document.querySelectorAll('md-outlined-button');
    const deactivate = Array.from(buttons).find((b) => b.textContent?.trim() === 'Deactivate');
    if (!deactivate) throw new Error('Deactivate button not found');
    fireEvent.click(deactivate);
    fireEvent.click(await screen.findByText('Confirm'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not update this branch.');
  });

  it('an inactive branch offers Activate instead of Deactivate', async () => {
    renderPage();
    await waitFor(() => expect(document.querySelector('sky-feature-card[headline="Colaba Branch"]')).toBeTruthy());
    const cards = Array.from(document.querySelectorAll('sky-feature-card'));
    const colaba = cards.find((c) => attr(c, 'headline') === 'Colaba Branch');
    const label = colaba?.querySelector('md-outlined-button:last-of-type')?.textContent?.trim();
    expect(label).toBe('Activate');
  });

  it('shows an empty state with no branches yet', async () => {
    listBranchesMock.mockResolvedValue({ data: [] });
    render(
      <MemoryRouter>
        <BranchesListPage token="tok" vendorId="v1" canEdit />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/No branches yet/)).toBeTruthy();
  });
});
