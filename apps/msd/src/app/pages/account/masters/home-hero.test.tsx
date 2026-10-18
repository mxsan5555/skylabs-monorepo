import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HomeHeroManagement } from './home-hero';

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ token: 't', can: () => true }),
}));

const listSlidesMock = vi.fn();
const eligibleMock = vi.fn();
vi.mock('../../../../api/rbac/home-hero', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../api/rbac/home-hero')>()),
  listHomeHeroSlides: (...args: unknown[]) => listSlidesMock(...args),
  getHomeHeroEligibleCount: (...args: unknown[]) => eligibleMock(...args),
}));
// md-outlined-select cannot be driven in jsdom; the picker's own mapping is unit-tested in
// state-picker.test.ts, so pages get a stub with one button per choice.
vi.mock('./state-picker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./state-picker')>();
  return {
    ...actual,
    useBranchStates: () => ['Delhi', 'Uttar Pradesh'],
    StatePicker: ({ onChange }: { onChange: (state: string | null | undefined) => void }) => (
      <div>
        <button type="button" onClick={() => onChange('Delhi')}>pick Delhi</button>
        <button type="button" onClick={() => onChange(null)}>pick Global</button>
      </div>
    ),
  };
});

beforeEach(() => {
  listSlidesMock.mockReset().mockResolvedValue({ data: [], meta: { total: 0 } });
  eligibleMock.mockReset().mockResolvedValue({ data: { state: null, eligibleCount: 0, minimumRequired: 5 } });
});

describe('Home hero console (PLANNING §7)', () => {
  it('asks for a state first and offers no way to add items before that', () => {
    render(<HomeHeroManagement />);
    expect(screen.getByText(/Choose a state \(or Global \/ Default\)/)).toBeTruthy();
    expect(screen.queryByText('Add items')).toBeNull();
    expect(listSlidesMock).not.toHaveBeenCalled();
  });

  it("loads the chosen state's slider and then offers Add items", async () => {
    render(<HomeHeroManagement />);
    fireEvent.click(screen.getByText('pick Delhi'));
    await waitFor(() => expect(listSlidesMock).toHaveBeenCalledWith('t', expect.objectContaining({ state: 'Delhi' })));
    expect(eligibleMock).toHaveBeenCalledWith('t', 'Delhi');
    expect(screen.getByText('Add items')).toBeTruthy();
    expect(screen.getByText(/0\/5 eligible items for Delhi/)).toBeTruthy();
  });

  it('treats Global / Default as a chosen state', async () => {
    render(<HomeHeroManagement />);
    fireEvent.click(screen.getByText('pick Global'));
    await waitFor(() => expect(listSlidesMock).toHaveBeenCalledWith('t', expect.objectContaining({ state: null })));
  });
});
