import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PromotionManagement, buildBannerInput, formFromPromotion, type BannerForm } from './promotions';

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ token: 't', can: () => true }),
}));

const listPromotionsMock = vi.fn();
vi.mock('../../../../api/rbac/promotions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../api/rbac/promotions')>()),
  listPromotions: (...args: unknown[]) => listPromotionsMock(...args),
}));
vi.mock('../../../../api/rbac/categories', () => ({ listCategories: () => Promise.resolve({ data: [] }) }));
// md-outlined-select cannot be driven in jsdom (see home-hero.test.tsx).
vi.mock('./state-picker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./state-picker')>();
  return {
    ...actual,
    useBranchStates: () => ['Delhi'],
    StatePicker: ({ onChange }: { onChange: (state: string | null | undefined) => void }) => (
      <button type="button" onClick={() => onChange('Delhi')}>pick Delhi</button>
    ),
  };
});

const form = (overrides: Partial<BannerForm> = {}): BannerForm => ({
  ...formFromPromotion(),
  title: ' Monsoon spa week ',
  buttonLabel: 'Book now',
  backgroundRole: 'SECONDARY',
  buttonRole: 'TERTIARY',
  placements: ['HOME_AFTER_PRODUCTS', 'DEAL_BOTTOM'],
  ...overrides,
});

beforeEach(() => {
  listPromotionsMock.mockReset().mockResolvedValue({ data: [], meta: { total: 0 } });
});

describe('CTA banner console (PLANNING §6)', () => {
  it('asks for a state first and loads only that state’s banners', async () => {
    render(<PromotionManagement />);
    expect(screen.queryByText('Add banner')).toBeNull();
    expect(listPromotionsMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('pick Delhi'));
    await waitFor(() => expect(listPromotionsMock).toHaveBeenCalledWith('t', expect.objectContaining({ state: 'Delhi' })));
    expect(screen.getByText('Add banner')).toBeTruthy();
  });
});

describe('buildBannerInput', () => {
  it('sends state, colour roles, slots and trimmed copy', () => {
    const input = buildBannerInput(form(), 'Delhi');
    expect(input).toMatchObject({
      title: 'Monsoon spa week',
      buttonLabel: 'Book now',
      state: 'Delhi',
      backgroundRole: 'SECONDARY',
      buttonRole: 'TERTIARY',
      placements: ['HOME_AFTER_PRODUCTS', 'DEAL_BOTTOM'],
      destinationType: 'ROUTE',
      destinationRoute: '/',
      dealId: null,
      productId: null,
    });
  });

  it('sends a product destination with only productId', () => {
    const input = buildBannerInput(form({ destinationKind: 'ITEM', item: { type: 'product', id: 'p1', title: 'Oil' } }), null);
    expect(input).toMatchObject({ destinationType: 'PRODUCT', productId: 'p1', dealId: null, destinationRoute: null, state: null });
  });

  it('sends a deal destination with only dealId', () => {
    const input = buildBannerInput(form({ destinationKind: 'ITEM', item: { type: 'deal', id: 'd1', title: 'Deep Tissue' } }), 'Delhi');
    expect(input).toMatchObject({ destinationType: 'DEAL', dealId: 'd1', productId: null });
  });
});
