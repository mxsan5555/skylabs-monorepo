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
import { PrerenderDataProvider } from '../prerender-data/prerender-data';

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

describe('CatalogShellProvider with prerendered data', () => {
  const shell = {
    categories: [{ id: 'c1', name: 'Massage', slug: 'massage', description: null, children: [] }],
    locations: [{ state: 'Maharashtra', city: 'Pune' }],
    socialLinks: [],
  };
  const PAYLOAD_TEXT = 'ready|Massage>/category/massage|Pune';
  const renders: string[] = [];
  function RecordingProbe() {
    const { status, locations, categories } = useCatalogShell();
    renders.push(`${listCatalogCategoriesMock.mock.calls.length}:${status}:${categories.map((c) => c.name).join(',')}:${locations.map((l) => l.city).join(',')}`);
    return <Probe />;
  }
  const renderShell = () =>
    render(
      <PrerenderDataProvider payload={{ shell }}>
        <CatalogShellProvider><RecordingProbe /></CatalogShellProvider>
      </PrerenderDataProvider>,
    );

  beforeEach(() => {
    renders.length = 0;
  });

  it('renders the payload first, then refreshes once in the background and shows the fresh data', async () => {
    listCatalogCategoriesMock.mockResolvedValue({ data: [{ id: 'c2', name: 'Spa', slug: 'spa', description: null, children: [] }] });
    listCatalogLocationsMock.mockResolvedValue({ data: [{ state: 'UP', city: 'Gorakhpur' }] });
    renderShell();
    expect(renders[0]).toBe('0:ready:Massage:Pune');
    await waitFor(() => expect(screen.getByText('ready|Spa>/category/spa|Gorakhpur')).toBeTruthy());
    expect(listCatalogCategoriesMock).toHaveBeenCalledTimes(1);
    expect(listCatalogLocationsMock).toHaveBeenCalledTimes(1);
    expect(listCatalogSocialLinksMock).toHaveBeenCalledTimes(1);
    expect(renders.some((r) => r.includes(':loading:'))).toBe(false);
  });

  it('keeps the payload data when the refresh fails', async () => {
    listCatalogCategoriesMock.mockRejectedValue(new Error('down'));
    listCatalogLocationsMock.mockRejectedValue(new Error('down'));
    listCatalogSocialLinksMock.mockRejectedValue(new Error('down'));
    renderShell();
    await waitFor(() => expect(listCatalogSocialLinksMock).toHaveBeenCalled());
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.getByText(PAYLOAD_TEXT)).toBeTruthy();
  });
});
