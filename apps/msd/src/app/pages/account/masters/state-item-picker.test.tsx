import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateItem } from '../../../../api/rbac/home-hero';

import { StateItemPicker } from './state-item-picker';

const searchMock = vi.fn();
vi.mock('../../../../api/rbac/home-hero', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../api/rbac/home-hero')>()),
  searchStateItems: (...args: unknown[]) => searchMock(...args),
}));

const DEAL: StateItem = {
  type: 'deal',
  id: 'deal-1',
  title: 'Deep Tissue 60',
  memberName: 'Urban Spa',
  branchName: 'Hazratganj',
  price: '1299.00',
  image: null,
  eligible: true,
};
const PRODUCT: StateItem = { ...DEAL, type: 'product', id: 'prod-1', title: 'Massage Oil', branchName: null, eligible: false };

function typeSearch(value: string) {
  const field = document.querySelector('md-outlined-text-field') as HTMLElement & { value: string };
  field.value = value;
  fireEvent.input(field);
}

beforeEach(() => {
  vi.useFakeTimers();
  searchMock.mockResolvedValue({ data: [DEAL, PRODUCT] });
});
afterEach(() => {
  vi.useRealTimers();
  searchMock.mockReset();
});

/** md-* elements have no ARIA role in jsdom; find them the way the shadow DOM labels them. */
function chip(label: string) {
  return Array.from(document.querySelectorAll('md-filter-chip')).find(
    (c) => (c as HTMLElement & { label?: string }).label === label || c.getAttribute('label') === label,
  ) as HTMLElement;
}
const addButton = (title: string) => document.querySelector('md-outlined-button[aria-label="Add ' + title + '"]');

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
}

describe('StateItemPicker (PLANNING §7)', () => {
  it("searches the chosen state's deals and products", async () => {
    render(<StateItemPicker token="t" base="/home-hero" state="Uttar Pradesh" onPick={vi.fn()} />);
    typeSearch('deep');
    await settle();
    expect(searchMock).toHaveBeenCalledWith('t', '/home-hero', { state: 'Uttar Pradesh', q: 'deep', type: 'all', pageSize: 8 });
    expect(screen.getByText('Deep Tissue 60')).toBeTruthy();
    expect(screen.getByText('Massage Oil')).toBeTruthy();
  });

  it('searches every state for the Global slider', async () => {
    render(<StateItemPicker token="t" base="/promotions" state={null} onPick={vi.fn()} />);
    typeSearch('oil');
    await settle();
    expect(searchMock).toHaveBeenCalledWith('t', '/promotions', expect.objectContaining({ state: null, q: 'oil' }));
  });

  it('narrows to products when the Products filter is chosen', async () => {
    render(<StateItemPicker token="t" base="/home-hero" state="Delhi" onPick={vi.fn()} />);
    fireEvent.click(chip('Products'));
    typeSearch('oil');
    await settle();
    expect(searchMock).toHaveBeenLastCalledWith('t', '/home-hero', expect.objectContaining({ type: 'product' }));
  });

  it('hands the chosen item back and marks items customers cannot see yet', async () => {
    const onPick = vi.fn();
    render(<StateItemPicker token="t" base="/home-hero" state="Delhi" onPick={onPick} />);
    typeSearch('a');
    await settle();
    expect(screen.getByText(/not visible to customers yet/i)).toBeTruthy();
    fireEvent.click(addButton('Deep Tissue 60') as HTMLElement);
    expect(onPick).toHaveBeenCalledWith(DEAL);
  });

  it('marks items already added and does not offer them again', async () => {
    render(<StateItemPicker token="t" base="/home-hero" state="Delhi" onPick={vi.fn()} excludeIds={['deal-1']} />);
    typeSearch('a');
    await settle();
    expect(addButton('Deep Tissue 60')).toBeNull();
    expect(screen.getByText('Already added')).toBeTruthy();
  });
});
