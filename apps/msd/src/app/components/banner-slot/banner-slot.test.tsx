import { render, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogBanner } from '../../../api/catalog';

import { BannerSlot, CtaBannerCard } from './banner-slot';

const listBannersMock = vi.fn();
vi.mock('../../../api/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/catalog')>()),
  listCatalogBanners: (...args: unknown[]) => listBannersMock(...args),
}));
const location = vi.hoisted(() => ({ status: 'ready', state: 'Delhi' as string | null }));
vi.mock('../../../location/location-context', () => ({ useVisitorLocation: () => location }));

const BANNER: CatalogBanner = {
  id: 'b1',
  title: 'Monsoon spa week',
  description: '20% off every massage',
  buttonLabel: 'Book now',
  backgroundRole: 'SECONDARY',
  buttonRole: 'TERTIARY',
  href: '/deal/d1',
  image: 'cta-banners/b1/a.jpg',
};

beforeEach(() => {
  location.status = 'ready';
  location.state = 'Delhi';
  listBannersMock.mockReset().mockResolvedValue({ data: [BANNER] });
});

describe('CtaBannerCard', () => {
  it('maps the banner to sky-cta-banner with its colour roles, copy, link and image', () => {
    const { container } = render(<CtaBannerCard banner={BANNER} />);
    const el = container.querySelector('sky-cta-banner') as HTMLElement;
    expect(el.getAttribute('color')).toBe('secondary');
    expect(el.getAttribute('cta-color')).toBe('tertiary');
    expect(el.getAttribute('headline')).toBe('Monsoon spa week');
    expect(el.getAttribute('text')).toBe('20% off every massage');
    expect(el.getAttribute('cta-label')).toBe('Book now');
    expect(el.getAttribute('cta-href')).toBe('/deal/d1');
    expect(el.getAttribute('image')).toContain('cta-banners/b1/a.jpg');
  });
});

describe('BannerSlot (PLANNING §6)', () => {
  it("asks for the slot's banners for the visitor's state", async () => {
    const { container } = render(<BannerSlot slot="DEAL_BOTTOM" />);
    await waitFor(() => expect(container.querySelector('sky-cta-banner')).not.toBeNull());
    expect(listBannersMock).toHaveBeenCalledWith('DEAL_BOTTOM', 'Delhi');
  });

  it('waits while the location is still resolving', () => {
    location.status = 'locating';
    render(<BannerSlot slot="HOME_AFTER_DEALS" />);
    expect(listBannersMock).not.toHaveBeenCalled();
  });

  it('renders nothing when the slot has no banner', async () => {
    listBannersMock.mockResolvedValue({ data: [] });
    const { container } = render(<BannerSlot slot="CATEGORY_TOP" />);
    await waitFor(() => expect(listBannersMock).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing on the server, so prerendered pages hydrate cleanly', () => {
    expect(renderToString(<BannerSlot slot="HOME_AFTER_DEALS" />)).toBe('');
  });
});
