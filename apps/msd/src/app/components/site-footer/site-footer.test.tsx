import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { SiteFooter } from './site-footer';

const { wide, setThemePreferenceMock } = vi.hoisted(() => ({
  wide: { value: true },
  setThemePreferenceMock: vi.fn(),
}));

vi.mock('../../../hooks/use-media-query', () => ({ useMediaQuery: () => wide.value }));
vi.mock('../../../theme/theme-preference', () => ({
  readThemePreference: () => 'light',
  setThemePreference: (...a: unknown[]) => setThemePreferenceMock(...a),
}));
vi.mock('../../../location/location-context', () => ({
  useVisitorLocation: () => ({ city: 'Pune' }),
}));
vi.mock('../../../catalog/catalog-shell', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../catalog/catalog-shell')>()),
  useCatalogShell: () => ({
    status: 'ready',
    categories: [{ id: 'c1', name: 'Massage', slug: 'massage', description: null, children: [] }],
    locations: [
      { state: 'Delhi', city: 'Delhi' },
      { state: 'Maharashtra', city: 'Pune' },
    ],
    socialLinks: [
      { id: 's1', platform: 'instagram', displayName: 'Instagram', url: 'https://instagram.com/x' },
      { id: 's2', platform: 'tiktok', displayName: 'TikTok', url: 'https://tiktok.com/@x' },
    ],
  }),
  useCategoryLinks: () => [{ id: 'c1', label: 'Massage', to: '/category/massage' }],
}));

const renderFooter = () => render(<MemoryRouter><SiteFooter /></MemoryRouter>);

beforeEach(() => {
  wide.value = true;
  setThemePreferenceMock.mockClear();
});

describe('SiteFooter', () => {
  it('is the contentinfo landmark with labelled link columns', () => {
    renderFooter();
    expect(screen.getByRole('contentinfo')).toBeTruthy();
    for (const name of ['Discover', 'Company', 'Help & Info', 'Partners', 'Popular searches', 'Legal']) {
      expect(screen.getByRole('navigation', { name })).toBeTruthy();
    }
    const discover = screen.getByRole('navigation', { name: 'Discover' });
    expect(within(discover).getByRole('link', { name: 'Massage' }).getAttribute('href')).toBe('/category/massage');
    expect(within(discover).getByRole('link', { name: 'Therapists' })).toBeTruthy();
  });

  it('lists popular searches with the visitor city first', () => {
    renderFooter();
    const links = within(screen.getByRole('navigation', { name: 'Popular searches' })).getAllByRole('link');
    expect(links[0].textContent).toBe('Massage in Pune');
    expect(links[0].getAttribute('href')).toBe('/category/massage/pune');
  });

  it('shows the three trust claims', () => {
    renderFooter();
    const trust = screen.getByRole('list', { name: 'Why book with MySpaDeal' });
    expect(within(trust).getAllByRole('listitem')).toHaveLength(3);
  });

  it('announces newsletter success in a live region', () => {
    renderFooter();
    const field = document.querySelector('sky-action-field') as HTMLElement;
    expect(field.getAttribute('type')).toBe('email');
    fireEvent(field, new CustomEvent('sky-submit', { detail: { value: 'a@b.in' } }));
    expect(screen.getByRole('status').textContent).toBe("You're subscribed! Check your inbox.");
  });

  it('names social links with a new-tab hint', () => {
    renderFooter();
    const link = screen.getByRole('link', { name: 'Instagram (opens in a new tab)' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('falls back to a generic icon for an unknown social platform', () => {
    renderFooter();
    const link = screen.getByRole('link', { name: 'TikTok (opens in a new tab)' });
    expect(link.querySelector('svg')).toBeTruthy();
  });

  it('switches theme through radio buttons', () => {
    renderFooter();
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(setThemePreferenceMock).toHaveBeenCalledWith('dark');
  });

  it('collapses columns into disclosures on narrow screens', () => {
    wide.value = false;
    renderFooter();
    const toggle = screen.getByRole('button', { name: 'Company' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    const list = document.getElementById(toggle.getAttribute('aria-controls') ?? '') as HTMLElement;
    expect(list.getAttribute('data-collapsed')).toBe('true');
    expect(within(list).getByRole('link', { name: 'About Us', hidden: true })).toBeTruthy();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(list.hasAttribute('data-collapsed')).toBe(false);
  });
});
