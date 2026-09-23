import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { SiteFooter } from './site-footer';

const { wide, savedTheme, setThemePreferenceMock, social } = vi.hoisted(() => ({
  wide: { value: true },
  social: { links: [] as { id: string; platform: string; displayName: string; url: string }[] },
  savedTheme: { value: 'light' },
  setThemePreferenceMock: vi.fn(),
}));

vi.mock('../../../hooks/use-media-query', () => ({ useMediaQuery: () => wide.value }));
vi.mock('../../../theme/theme-preference', () => ({
  readThemePreference: () => savedTheme.value,
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
    socialLinks: social.links,
  }),
  useCategoryLinks: () => [{ id: 'c1', label: 'Massage', to: '/category/massage' }],
}));

const renderFooter = () => render(<MemoryRouter><SiteFooter /></MemoryRouter>);

beforeEach(() => {
  wide.value = true;
  social.links = [
    { id: 's1', platform: 'instagram', displayName: 'Instagram', url: 'https://instagram.com/x' },
    { id: 's2', platform: 'tiktok', displayName: 'TikTok', url: 'https://tiktok.com/@x' },
  ];
  savedTheme.value = 'light';
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

  it('announces newsletter success in a live region and moves focus to it', () => {
    renderFooter();
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('');
    const field = document.querySelector('sky-action-field') as HTMLElement;
    expect(field.getAttribute('type')).toBe('email');
    fireEvent(field, new CustomEvent('sky-submit', { detail: { value: 'a@b.in' } }));
    expect(status.textContent).toBe('Thanks for your interest! Newsletter sign-up is launching soon.');
    expect(document.activeElement).toBe(status);
    expect(document.querySelector('sky-action-field')).toBe(field);
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

  it('hydrates with the server theme, then shows the saved one', async () => {
    savedTheme.value = 'dark';
    const tree = <MemoryRouter><SiteFooter /></MemoryRouter>;
    const container = document.createElement('div');
    document.body.appendChild(container);
    // Server snapshot: no localStorage, so the switch renders the default.
    savedTheme.value = 'light';
    container.innerHTML = renderToString(tree);
    savedTheme.value = 'dark';
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, tree);
    });
    const dark = within(container).getByRole('radio', { name: 'Dark' }) as HTMLInputElement;
    expect(dark.checked).toBe(true);
    expect(errors.mock.calls.some((c) => String(c[0]).includes('hydrat'))).toBe(false);
    errors.mockRestore();
    act(() => root?.unmount());
    container.remove();
  });

  it('renders one anchor per social link, with a platform icon distinct from the fallback', () => {
    renderFooter();
    const list = screen.getByRole('list', { name: 'MySpaDeal on social media' });
    const anchors = within(list).getAllByRole('link');
    expect(anchors.map((a) => a.getAttribute('href'))).toEqual(['https://instagram.com/x', 'https://tiktok.com/@x']);
    expect(anchors[0].innerHTML).not.toBe(anchors[1].innerHTML);
  });

  it('omits the social list when there are no links', () => {
    social.links = [];
    renderFooter();
    expect(screen.queryByRole('list', { name: 'MySpaDeal on social media' })).toBeNull();
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
