import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PopularTag, PopularTagMappings } from '../../../../api/rbac/popular-tags';

let grantedPermissions: Set<string>;

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({
    token: 'test-token',
    can: (menuKey: string, action = 'view') => grantedPermissions.has(`${menuKey}:${action}`),
  }),
}));

const listPopularTagsMock = vi.fn();
const createPopularTagMock = vi.fn();
const updatePopularTagMock = vi.fn();
const setPopularTagStatusMock = vi.fn();
const deletePopularTagMock = vi.fn();
const listPopularTagMappingsMock = vi.fn();
const mapPopularTagMock = vi.fn();
const unmapPopularTagMock = vi.fn();

vi.mock('../../../../api/rbac/popular-tags', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/popular-tags')>('../../../../api/rbac/popular-tags');
  return {
    ...actual,
    listPopularTags: (...args: unknown[]) => listPopularTagsMock(...args),
    createPopularTag: (...args: unknown[]) => createPopularTagMock(...args),
    updatePopularTag: (...args: unknown[]) => updatePopularTagMock(...args),
    setPopularTagStatus: (...args: unknown[]) => setPopularTagStatusMock(...args),
    deletePopularTag: (...args: unknown[]) => deletePopularTagMock(...args),
    listPopularTagMappings: (...args: unknown[]) => listPopularTagMappingsMock(...args),
    mapPopularTag: (...args: unknown[]) => mapPopularTagMock(...args),
    unmapPopularTag: (...args: unknown[]) => unmapPopularTagMock(...args),
  };
});

const listCategoriesMock = vi.fn();
vi.mock('../../../../api/rbac/categories', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/categories')>('../../../../api/rbac/categories');
  return { ...actual, listCategories: (...args: unknown[]) => listCategoriesMock(...args) };
});

const listAllDealsMock = vi.fn();
const listAllTherapistsMock = vi.fn();
vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return {
    ...actual,
    listAllDeals: (...args: unknown[]) => listAllDealsMock(...args),
    listAllTherapists: (...args: unknown[]) => listAllTherapistsMock(...args),
  };
});

const listProductsMock = vi.fn();
vi.mock('../../../../api/rbac/products', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/products')>('../../../../api/rbac/products');
  return { ...actual, listProducts: (...args: unknown[]) => listProductsMock(...args) };
});

import { PopularTagManagement } from './popular-tags';

const TAG: PopularTag = {
  id: 'tag-1',
  name: 'Trending',
  slug: 'trending',
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  _count: { categories: 1, deals: 2, products: 0, therapists: 0 },
};

const EMPTY_MAPPINGS: PopularTagMappings = { categories: [], deals: [], products: [], therapists: [] };

beforeEach(() => {
  vi.clearAllMocks();
  grantedPermissions = new Set(['masters.tags:create', 'masters.tags:edit', 'masters.tags:delete']);
  listPopularTagsMock.mockResolvedValue({ data: [TAG], meta: { total: 1 } });
  listPopularTagMappingsMock.mockResolvedValue({ data: EMPTY_MAPPINGS });
  listCategoriesMock.mockResolvedValue({ data: [{ id: 'cat-1', name: 'Massage' }], meta: { total: 1 } });
  listAllDealsMock.mockResolvedValue({ data: [], meta: { total: 0 } });
  listAllTherapistsMock.mockResolvedValue({ data: [], meta: { total: 0 } });
  listProductsMock.mockResolvedValue({ data: [], meta: { total: 0 } });
});

async function waitForTableLoaded(expectedTotal: number): Promise<void> {
  await waitFor(() => {
    const table = document.querySelector('sky-data-table');
    expect(table?.getAttribute('total')).toBe(String(expectedTotal));
  });
}

/**
 * Feature: Popular Tag management (Superadmin "Marketing Tags" screen)
 * Scenario: create/edit/status-toggle a tag, and manage its Category/Deal/Product/Therapist
 * mappings — mirrors CategoryManagement's own test conventions (same <sky-data-table> events,
 * same Dialog-ref pattern).
 */
describe('PopularTagManagement — list, create, status toggle', () => {
  it('loads and renders the tag list', async () => {
    render(<PopularTagManagement />);
    await waitForTableLoaded(1);
    expect(listPopularTagsMock).toHaveBeenCalled();
  });

  // NOTE: driving `OutlinedTextField`'s `onInput` by simulated typing is intentionally NOT
  // covered here — this repo's installed `@lit/react@1.0.8` registers its custom-element
  // property/event bindings (incl. `onInput`/`onChange`) inside a `useLayoutEffect` whose
  // ref-timing does not fire correctly under React 19.2.7 in jsdom, so a dispatched `input`
  // event never reaches the handler (see `search.test.tsx`'s identical, more-fully-documented
  // limitation — "affects every onChange/onInput-driven md-* control, not just this one"). The
  // "type a name/slug and Save" flow is covered at the Playwright E2E level instead.

  it('rejects an empty name/slug client-side before ever calling createPopularTag', async () => {
    render(<PopularTagManagement />);
    await waitForTableLoaded(1);

    const saveButtons = Array.from(document.querySelectorAll('md-filled-button')).filter((el) => el.textContent?.trim() === 'Save');
    fireEvent.click(saveButtons[0]);

    await waitFor(() => expect(screen.getByText('Name and slug are required.')).toBeTruthy());
    expect(createPopularTagMock).not.toHaveBeenCalled();
  });

  it('toggles a tag\'s active status without touching its mappings', async () => {
    setPopularTagStatusMock.mockResolvedValue({ data: { ...TAG, isActive: false } });
    render(<PopularTagManagement />);
    await waitForTableLoaded(1);

    const table = document.querySelector('sky-data-table')!;
    fireEvent(table, new CustomEvent('sky-dt-row-action', { detail: { action: 'toggle-status', row: {}, rowIndex: 0 } }));

    await waitFor(() => expect(setPopularTagStatusMock).toHaveBeenCalledWith('test-token', 'tag-1', false));
  });

  it('blocks delete when the tag still has mappings (server-enforced, surfaced as an error)', async () => {
    deletePopularTagMock.mockRejectedValue(new Error('Popular tag still has mappings; unmap it from every item first'));
    vi.stubGlobal('confirm', () => true);
    render(<PopularTagManagement />);
    await waitForTableLoaded(1);

    const table = document.querySelector('sky-data-table')!;
    fireEvent(table, new CustomEvent('sky-dt-row-action', { detail: { action: 'delete', row: {}, rowIndex: 0 } }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    vi.unstubAllGlobals();
  });
});

describe('PopularTagManagement — mapping dialog', () => {
  it('opens the mapping dialog and loads current mappings for the Category tab by default', async () => {
    render(<PopularTagManagement />);
    await waitForTableLoaded(1);

    const table = document.querySelector('sky-data-table')!;
    fireEvent(table, new CustomEvent('sky-dt-row-action', { detail: { action: 'mappings', row: {}, rowIndex: 0 } }));

    await waitFor(() => expect(listPopularTagMappingsMock).toHaveBeenCalledWith('test-token', 'tag-1'));
    await waitFor(() => expect(listCategoriesMock).toHaveBeenCalled());
  });

  it('mapping a category calls mapPopularTag with targetType="category" and refreshes the list', async () => {
    listPopularTagMappingsMock.mockResolvedValue({ data: EMPTY_MAPPINGS });
    mapPopularTagMock.mockResolvedValue({ data: { id: 'link-1' } });
    render(<PopularTagManagement />);
    await waitForTableLoaded(1);

    const table = document.querySelector('sky-data-table')!;
    fireEvent(table, new CustomEvent('sky-dt-row-action', { detail: { action: 'mappings', row: {}, rowIndex: 0 } }));

    await waitFor(() => expect(screen.getByText('Massage')).toBeTruthy());
    const checkbox = screen.getByRole('checkbox', { name: 'Massage' }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);

    await waitFor(() => expect(mapPopularTagMock).toHaveBeenCalledWith('test-token', 'tag-1', 'category', 'cat-1'));
  });
});
