import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CatalogShellProvider,
  categoryHref,
  cityHref,
  citySlug,
  useCatalogShell,
  useCategoryLinks,
} from './catalog-shell';

const { listCatalogCategoriesMock, listCatalogLocationsMock, listCatalogSocialLinksMock } = vi.hoisted(() => ({
  listCatalogCategoriesMock: vi.fn(),
  listCatalogLocationsMock: vi.fn(),
  listCatalogSocialLinksMock: vi.fn(),
}));

vi.mock('../api/catalog', async () => {
  const actual = await vi.importActual<typeof import('../api/catalog')>('../api/catalog');
  return {
    ...actual,
    listCatalogCategories: (...a: unknown[]) => listCatalogCategoriesMock(...a),
    listCatalogLocations: (...a: unknown[]) => listCatalogLocationsMock(...a),
    listCatalogSocialLinks: (...a: unknown[]) => listCatalogSocialLinksMock(...a),
  };
});

function Probe() {
  const { status, locations } = useCatalogShell();
  const links = useCategoryLinks();
  return (
    <p>
      {status}|{links.map((l) => `${l.label}>${l.to}`).join(',')}|{locations.map((l) => l.city).join(',')}
    </p>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listCatalogSocialLinksMock.mockResolvedValue({ data: [] });
});

describe('CatalogShellProvider', () => {
  it('fetches categories and locations once and exposes category links', async () => {
    listCatalogCategoriesMock.mockResolvedValue({ data: [{ id: 'c1', name: 'Massage', slug: 'massage', description: null, children: [] }] });
    listCatalogLocationsMock.mockResolvedValue({ data: [{ state: 'Maharashtra', city: 'Pune' }] });
    render(<CatalogShellProvider><Probe /></CatalogShellProvider>);
    await waitFor(() => expect(screen.getByText('ready|Massage>/category/massage|Pune')).toBeTruthy());
    expect(listCatalogCategoriesMock).toHaveBeenCalledTimes(1);
    expect(listCatalogLocationsMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to content.json category links when categories fail', async () => {
    listCatalogCategoriesMock.mockRejectedValue(new Error('down'));
    listCatalogLocationsMock.mockResolvedValue({ data: [] });
    render(<CatalogShellProvider><Probe /></CatalogShellProvider>);
    await waitFor(() => expect(screen.getByText(/^error\|Massage>\/category\/massage,/)).toBeTruthy());
  });

  it('still loads locations when only categories fail', async () => {
    listCatalogCategoriesMock.mockRejectedValue(new Error('down'));
    listCatalogLocationsMock.mockResolvedValue({ data: [{ state: 'Maharashtra', city: 'Pune' }] });
    render(<CatalogShellProvider><Probe /></CatalogShellProvider>);
    await waitFor(() => expect(screen.getByText(/^error\|.*\|Pune$/)).toBeTruthy());
  });
});

describe('locationsStatus', () => {
  function LocationsProbe() {
    const { status, locationsStatus } = useCatalogShell();
    return <p>{`${status}/${locationsStatus}`}</p>;
  }

  it('starts loading and becomes ready when locations load', async () => {
    listCatalogCategoriesMock.mockResolvedValue({ data: [] });
    listCatalogLocationsMock.mockResolvedValue({ data: [{ state: 'Maharashtra', city: 'Pune' }] });
    render(<CatalogShellProvider><LocationsProbe /></CatalogShellProvider>);
    expect(screen.getByText('loading/loading')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('ready/ready')).toBeTruthy());
  });

  it('reports a locations failure separately from categories', async () => {
    listCatalogCategoriesMock.mockResolvedValue({ data: [] });
    listCatalogLocationsMock.mockRejectedValue(new Error('down'));
    render(<CatalogShellProvider><LocationsProbe /></CatalogShellProvider>);
    await waitFor(() => expect(screen.getByText('ready/error')).toBeTruthy());
  });
});

describe('categoryHref', () => {
  it('builds a category URL, with an optional encoded ?sub=', () => {
    expect(categoryHref('massage')).toBe('/category/massage');
    expect(categoryHref('massage', 'deep-tissue')).toBe('/category/massage?sub=deep-tissue');
    expect(categoryHref('spa & more', 'a/b')).toBe('/category/spa%20%26%20more?sub=a%2Fb');
  });
});

describe('social links', () => {
  it('exposes social links and tolerates their failure', async () => {
    listCatalogCategoriesMock.mockResolvedValue({ data: [] });
    listCatalogLocationsMock.mockResolvedValue({ data: [] });
    listCatalogSocialLinksMock.mockResolvedValue({
      data: [{ id: 's1', platform: 'instagram', displayName: 'Instagram', url: 'https://instagram.com/x' }],
    });
    function SocialProbe() {
      const { socialLinks } = useCatalogShell();
      return <p>{socialLinks.map((s) => s.displayName).join(',') || '-'}</p>;
    }
    render(<CatalogShellProvider><SocialProbe /></CatalogShellProvider>);
    await waitFor(() => expect(screen.getByText('Instagram')).toBeTruthy());
    expect(listCatalogSocialLinksMock).toHaveBeenCalledTimes(1);
  });
});

describe('citySlug / cityHref', () => {
  it('slugifies city names', () => {
    expect(citySlug('Navi Mumbai')).toBe('navi-mumbai');
    expect(citySlug('  Pune ')).toBe('pune');
    expect(citySlug('Thiruvananthapuram (Trivandrum)')).toBe('thiruvananthapuram-trivandrum');
  });
  it('builds /category/<slug>/<city-slug>', () => {
    expect(cityHref('massage', 'Navi Mumbai')).toBe('/category/massage/navi-mumbai');
  });
  it('falls back to the category page when the city slugifies to empty', () => {
    expect(citySlug('!!!')).toBe('');
    expect(cityHref('massage', '!!!')).toBe('/category/massage');
    expect(cityHref('massage', '')).toBe('/category/massage');
  });
});
