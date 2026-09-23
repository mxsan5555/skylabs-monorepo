import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CatalogShellProvider, useCatalogShell, useCategoryLinks } from './catalog-shell';

const { listCatalogCategoriesMock, listCatalogLocationsMock } = vi.hoisted(() => ({
  listCatalogCategoriesMock: vi.fn(),
  listCatalogLocationsMock: vi.fn(),
}));

vi.mock('../api/catalog', async () => {
  const actual = await vi.importActual<typeof import('../api/catalog')>('../api/catalog');
  return {
    ...actual,
    listCatalogCategories: (...a: unknown[]) => listCatalogCategoriesMock(...a),
    listCatalogLocations: (...a: unknown[]) => listCatalogLocationsMock(...a),
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

beforeEach(() => vi.clearAllMocks());

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
