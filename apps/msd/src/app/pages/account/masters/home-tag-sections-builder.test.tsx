import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeTagSectionItem, HomeTagSectionRow, StateItem } from '../../../../api/rbac/home-tag-sections';
import { HomeTagSectionsBuilder } from './home-tag-sections-builder';

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ token: 't', can: () => true }),
  getTokenStore: () => ({
    getToken: () => 't',
    setToken: vi.fn(),
    subscribe: vi.fn().mockReturnValue(vi.fn()),
    refresh: vi.fn().mockResolvedValue(null),
    logout: vi.fn().mockResolvedValue(undefined),
  }),
}));
const snackbarMock = vi.fn();
vi.mock('../../../../snackbar/snackbar', () => ({ showSnackbar: (...args: unknown[]) => snackbarMock(...args) }));

const api = vi.hoisted(() => ({
  listSections: vi.fn(),
  setEnabled: vi.fn(),
  listItems: vi.fn(),
  addItem: vi.fn(),
  removeItem: vi.fn(),
  reorder: vi.fn(),
}));
vi.mock('../../../../api/rbac/home-tag-sections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../api/rbac/home-tag-sections')>()),
  listHomeTagSections: api.listSections,
  setHomeTagSectionEnabled: api.setEnabled,
  listHomeTagSectionItems: api.listItems,
  addHomeTagSectionItem: api.addItem,
  removeHomeTagSectionItem: api.removeItem,
  reorderHomeTagSectionItems: api.reorder,
}));

const PICKED: StateItem = {
  type: 'deal',
  id: 'deal-9',
  title: 'Massage Oil Combo',
  memberName: 'Urban Spa',
  branchName: 'Hazratganj',
  price: '999.00',
  image: null,
  eligible: true,
};
// The picker has its own tests; here it is one button that picks a fixed deal.
vi.mock('./state-item-picker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./state-item-picker')>()),
  StateItemPicker: ({ onPick, excludeIds }: { onPick: (item: StateItem) => void; excludeIds: string[] }) => (
    <button type="button" data-exclude={excludeIds.join(',')} onClick={() => onPick(PICKED)}>
      pick deal
    </button>
  ),
}));

const section = (overrides: Partial<HomeTagSectionRow> = {}): HomeTagSectionRow => ({
  id: 'sec-new',
  state: 'Delhi',
  tag: 'NEW',
  title: 'New',
  isEnabled: true,
  itemCount: 0,
  eligibleCount: 0,
  minimumRequired: 1,
  status: 'DISABLED',
  updatedAt: null,
  ...overrides,
});

const item = (id: string, title: string, sortOrder: number, extra: Partial<HomeTagSectionItem> = {}): HomeTagSectionItem => ({
  id,
  homeTagSectionId: 'sec-new',
  dealId: `deal-${id}`,
  sortOrder,
  createdAt: '',
  itemEligible: true,
  ineligibleReason: null,
  image: null,
  price: '1299.00',
  deal: {
    id: `deal-${id}`,
    title,
    slug: id,
    status: 'ACTIVE',
    approvalStatus: 'APPROVED',
    salePrice: '1299.00',
    discountPercent: null,
    endDate: null,
    vendor: { id: 'v1', businessName: 'Urban Spa', status: 'ACTIVE' },
    branch: { id: 'b1', name: 'Hazratganj', state: 'Delhi', isActive: true },
  },
  ...extra,
});

const ITEMS = [
  item('i1', 'Deep Tissue 60', 0),
  item('i2', 'Hot Stone 90', 1, { itemEligible: false, ineligibleReason: 'Branch paused' }),
];

function renderBuilder(path = '/account/masters/home-tag-sections/Delhi/NEW') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/account/masters/home-tag-sections/:state/:tag" element={<HomeTagSectionsBuilder />} />
      </Routes>
    </MemoryRouter>,
  );
}

const iconButton = (label: string) => document.querySelector(`md-icon-button[aria-label="${label}"]`) as HTMLElement;

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  snackbarMock.mockReset();
  api.listSections.mockResolvedValue({ data: [section()] });
  api.listItems.mockResolvedValue({ data: ITEMS });
  api.reorder.mockResolvedValue({ data: { reordered: true } });
});

describe('Home Tag Sections builder (PLANNING §7.1)', () => {
  it("loads the section's deals in order and shows live progress once one is visible, not an error", async () => {
    renderBuilder();
    expect(await screen.findByText('Deep Tissue 60')).toBeTruthy();
    expect(api.listItems).toHaveBeenCalledWith('t', 'sec-new');
    expect(screen.getByText('Live · 1 visible deal')).toBeTruthy();
    expect(screen.getByText('Hidden from customers: Branch paused')).toBeTruthy();
    expect(document.querySelector('.error-state')).toBeNull();
  });

  it('shows "not live yet" when no deal is currently visible to customers', async () => {
    api.listItems.mockResolvedValue({ data: [item('i2', 'Hot Stone 90', 0, { itemEligible: false, ineligibleReason: 'Branch paused' })] });
    renderBuilder();
    expect(await screen.findByText('Not live yet · needs at least 1 visible deal')).toBeTruthy();
  });

  it('creates the (disabled) section on first visit when the tag was never configured before', async () => {
    api.listSections.mockResolvedValue({ data: [] });
    api.setEnabled.mockResolvedValue({ data: { id: 'sec-brand-new', state: 'Delhi', tag: 'NEW', isEnabled: false, createdAt: '', updatedAt: '' } });
    api.listItems.mockResolvedValue({ data: [] });
    renderBuilder();
    await waitFor(() => expect(api.setEnabled).toHaveBeenCalledWith('t', 'Delhi', 'NEW', false));
    await waitFor(() => expect(api.listItems).toHaveBeenCalledWith('t', 'sec-brand-new'));
  });

  it('moves a deal down and saves the whole order at once', async () => {
    renderBuilder();
    await screen.findByText('Deep Tissue 60');
    await act(async () => {
      fireEvent.click(iconButton('Move Deep Tissue 60 down'));
    });
    expect(api.reorder).toHaveBeenCalledWith('t', 'sec-new', ['i2', 'i1']);
    expect(screen.getByText('Moved Deep Tissue 60 to position 2 of 2.')).toBeTruthy();
  });

  it('puts the old order back when saving fails', async () => {
    api.reorder.mockRejectedValue(new Error('down'));
    renderBuilder();
    await screen.findByText('Deep Tissue 60');
    await act(async () => {
      fireEvent.click(iconButton('Move Hot Stone 90 up'));
    });
    const titles = Array.from(document.querySelectorAll('.slide-card__title')).map((el) => el.textContent);
    expect(titles).toEqual(['Deep Tissue 60', 'Hot Stone 90']);
    expect(snackbarMock).toHaveBeenCalledWith('Could not save the new order.', { variant: 'error' });
  });

  it('adds a picked deal at the end and tells the picker which deals are already in', async () => {
    api.addItem.mockResolvedValue({ data: item('i3', 'Massage Oil Combo', 2) });
    renderBuilder();
    await screen.findByText('Deep Tissue 60');
    expect(screen.getByText('pick deal').getAttribute('data-exclude')).toBe('deal-i1,deal-i2');
    await act(async () => {
      fireEvent.click(screen.getByText('pick deal'));
    });
    expect(api.addItem).toHaveBeenCalledWith('t', 'sec-new', 'deal-9');
    expect(screen.getByText('Massage Oil Combo')).toBeTruthy();
  });

  it('removes a deal at once and offers Undo', async () => {
    api.removeItem.mockResolvedValue({ data: null });
    renderBuilder();
    await screen.findByText('Deep Tissue 60');
    await act(async () => {
      fireEvent.click(iconButton('Remove Deep Tissue 60'));
    });
    expect(api.removeItem).toHaveBeenCalledWith('t', 'i1');
    expect(screen.queryByText('Deep Tissue 60')).toBeNull();
    expect(snackbarMock).toHaveBeenCalledWith('Removed Deep Tissue 60.', expect.objectContaining({ actionLabel: 'Undo' }));
  });

  it('teaches the next step when the section is empty', async () => {
    api.listItems.mockResolvedValue({ data: [] });
    renderBuilder();
    expect(await screen.findByText(/No deals yet\. Add one or more deals/)).toBeTruthy();
  });
});
