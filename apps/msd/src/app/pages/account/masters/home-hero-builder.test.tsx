import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeHeroSlide, StateItem } from '../../../../api/rbac/home-hero';
import { HomeHeroBuilder, moveItem } from './home-hero-builder';

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ token: 't', can: () => true }),
}));
vi.mock('../../../../hooks/use-media-query', () => ({ useMediaQuery: () => true }));
const snackbarMock = vi.fn();
vi.mock('../../../../snackbar/snackbar', () => ({ showSnackbar: (...args: unknown[]) => snackbarMock(...args) }));

const api = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  reorder: vi.fn(),
  status: vi.fn(),
}));
vi.mock('../../../../api/rbac/home-hero', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../api/rbac/home-hero')>()),
  listHomeHeroSlides: api.list,
  createHomeHeroSlide: api.create,
  deleteHomeHeroSlide: api.remove,
  reorderHomeHeroSlides: api.reorder,
  setHomeHeroSlideStatus: api.status,
}));

const PICKED: StateItem = {
  type: 'product',
  id: 'prod-9',
  title: 'Massage Oil',
  memberName: 'Urban Spa',
  branchName: null,
  price: '499.00',
  image: null,
  eligible: true,
};
// The picker has its own tests; here it is one button that picks a fixed product.
vi.mock('./state-item-picker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./state-item-picker')>()),
  StateItemPicker: ({ onPick, excludeIds }: { onPick: (item: StateItem) => void; excludeIds: string[] }) => (
    <button type="button" data-exclude={excludeIds.join(',')} onClick={() => onPick(PICKED)}>
      pick oil
    </button>
  ),
}));

const slide = (id: string, title: string, sortOrder: number, extra: Partial<HomeHeroSlide> = {}): HomeHeroSlide => ({
  id,
  dealId: `deal-${id}`,
  productId: null,
  state: 'Delhi',
  sortOrder,
  isActive: true,
  createdAt: '',
  updatedAt: '',
  itemType: 'deal',
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
    vendor: { id: 'v1', businessName: 'Urban Spa', status: 'ACTIVE' },
    branch: { id: 'b1', name: 'Hazratganj', state: 'Delhi', isActive: true },
  },
  product: null,
  ...extra,
});

const SLIDES = [
  slide('s1', 'Deep Tissue 60', 0),
  slide('s2', 'Hot Stone 90', 1, { itemEligible: false, ineligibleReason: 'Branch paused' }),
];

function renderBuilder(path = '/account/masters/home-hero/Delhi') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/account/masters/home-hero/:state" element={<HomeHeroBuilder />} />
      </Routes>
    </MemoryRouter>,
  );
}

const iconButton = (label: string) => document.querySelector(`md-icon-button[aria-label="${label}"]`) as HTMLElement;

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  snackbarMock.mockReset();
  api.list.mockResolvedValue({ data: SLIDES });
  api.reorder.mockResolvedValue({ data: { reordered: true } });
});

describe('Home hero builder (PLANNING §7, D28)', () => {
  it("loads the state's slides in order and shows draft progress, not an error", async () => {
    renderBuilder();
    expect(await screen.findByText('Deep Tissue 60')).toBeTruthy();
    expect(api.list).toHaveBeenCalledWith('t', { state: 'Delhi', page: 1, pageSize: 100 });
    expect(screen.getByText('Draft · 4 more visible slides to go live')).toBeTruthy();
    expect(screen.getByText('Until then, visitors in Delhi see the Global / Default slider.')).toBeTruthy();
    expect(screen.getByText('Hidden from customers: Branch paused')).toBeTruthy();
    expect(document.querySelector('.error-state')).toBeNull();
  });

  it('builds the Global slider from the global URL', async () => {
    renderBuilder('/account/masters/home-hero/global');
    await waitFor(() => expect(api.list).toHaveBeenCalledWith('t', { state: null, page: 1, pageSize: 100 }));
    expect(screen.getByRole('heading', { level: 1, name: 'Global / Default slider' })).toBeTruthy();
  });

  it('moves a slide down and saves the whole order at once', async () => {
    renderBuilder();
    await screen.findByText('Deep Tissue 60');
    await act(async () => {
      fireEvent.click(iconButton('Move Deep Tissue 60 down'));
    });
    expect(api.reorder).toHaveBeenCalledWith('t', 'Delhi', ['s2', 's1']);
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

  it('adds a picked item at the end and tells the picker which items are in', async () => {
    api.create.mockResolvedValue({ data: slide('s3', 'Massage Oil', 2) });
    renderBuilder();
    await screen.findByText('Deep Tissue 60');
    expect(screen.getByText('pick oil').getAttribute('data-exclude')).toBe('deal-s1,deal-s2');
    await act(async () => {
      fireEvent.click(screen.getByText('pick oil'));
    });
    expect(api.create).toHaveBeenCalledWith('t', { itemType: 'product', itemId: 'prod-9', state: 'Delhi', sortOrder: 2 });
    expect(screen.getByText('Massage Oil')).toBeTruthy();
  });

  it('removes a slide at once and offers Undo', async () => {
    api.remove.mockResolvedValue({ data: null });
    renderBuilder();
    await screen.findByText('Deep Tissue 60');
    await act(async () => {
      fireEvent.click(iconButton('Remove Deep Tissue 60'));
    });
    expect(api.remove).toHaveBeenCalledWith('t', 's1');
    expect(screen.queryByText('Deep Tissue 60')).toBeNull();
    expect(snackbarMock).toHaveBeenCalledWith('Removed Deep Tissue 60.', expect.objectContaining({ actionLabel: 'Undo' }));
  });

  it('teaches the next step when the slider is empty', async () => {
    api.list.mockResolvedValue({ data: [] });
    renderBuilder();
    expect(await screen.findByText(/No slides yet\. Add 5 or more deals and products/)).toBeTruthy();
  });
});

describe('moveItem', () => {
  it('moves one item and keeps the rest in order', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });
});
