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

/** md-* elements have no ARIA role in jsdom; find them the way the shadow DOM labels them. */
function chip(label: string) {
  return Array.from(document.querySelectorAll('md-filter-chip')).find(
    (c) => (c as HTMLElement & { label?: string }).label === label || c.getAttribute('label') === label,
  ) as HTMLElement;
}
const pickButton = (label: string) => document.querySelector(`md-outlined-button[aria-label="${label}"]`) as HTMLElement | null;

function typeSearch(value: string) {
  const field = document.querySelector('md-outlined-text-field') as HTMLElement & { value: string };
  field.value = value;
  fireEvent.input(field);
}

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  searchMock.mockResolvedValue({ data: [DEAL, PRODUCT] });
});
afterEach(() => {
  vi.useRealTimers();
  searchMock.mockReset();
});

describe('StateItemPicker (PLANNING §7)', () => {
  it("lists the state's visible deals and products at once, without typing", async () => {
    render(<StateItemPicker token="t" base="/home-hero" state="Uttar Pradesh" onPick={vi.fn()} />);
    await settle();
    expect(searchMock).toHaveBeenCalledWith('t', '/home-hero', {
      state: 'Uttar Pradesh',
      q: '',
      type: 'all',
      pageSize: 12,
      eligibleOnly: true,
    });
    expect(screen.getByText('Deep Tissue 60')).toBeTruthy();
    expect(screen.getByText('Massage Oil')).toBeTruthy();
  });

  it('narrows the list as you type, and searches every state for Global', async () => {
    render(<StateItemPicker token="t" base="/promotions" state={null} onPick={vi.fn()} />);
    await settle();
    typeSearch('oil');
    await settle();
    expect(searchMock).toHaveBeenLastCalledWith('t', '/promotions', expect.objectContaining({ state: null, q: 'oil' }));
  });

  it('narrows to products when the Products filter is chosen', async () => {
    render(<StateItemPicker token="t" base="/home-hero" state="Delhi" onPick={vi.fn()} />);
    await settle();
    fireEvent.click(chip('Products'));
    await settle();
    expect(searchMock).toHaveBeenLastCalledWith('t', '/home-hero', expect.objectContaining({ type: 'product' }));
  });

  it('hands the chosen item back and marks items customers cannot see', async () => {
    const onPick = vi.fn();
    render(<StateItemPicker token="t" base="/home-hero" state="Delhi" onPick={onPick} />);
    await settle();
    expect(screen.getByText('Hidden from customers')).toBeTruthy();
    await act(async () => {
      fireEvent.click(pickButton('Add Deep Tissue 60') as HTMLElement);
    });
    expect(onPick).toHaveBeenCalledWith(DEAL);
  });

  it('shows items already in the slider as Added, with no button', async () => {
    render(<StateItemPicker token="t" base="/home-hero" state="Delhi" onPick={vi.fn()} excludeIds={['deal-1']} />);
    await settle();
    expect(pickButton('Add Deep Tissue 60')).toBeNull();
    expect(screen.getByText('Added')).toBeTruthy();
  });

  it('says so when nothing matches', async () => {
    searchMock.mockResolvedValue({ data: [] });
    render(<StateItemPicker token="t" base="/home-hero" state="Delhi" onPick={vi.fn()} />);
    await settle();
    typeSearch('zzz');
    await settle();
    expect(screen.getByText('Nothing in Delhi matches “zzz”.')).toBeTruthy();
  });
});
