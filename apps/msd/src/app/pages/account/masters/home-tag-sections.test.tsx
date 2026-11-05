import { fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeTagSectionOverviewRow } from '../../../../api/rbac/home-tag-sections';
import { HomeTagSectionsManagement, toOverviewRow } from './home-tag-sections';

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ token: 't', can: () => true }),
  // `api/rbac/home-tag-sections` drags in `api/rbac/client.ts`, which calls this at module scope
  // to build its 401-retry token store — stubbed minimally so that import doesn't throw; nothing
  // in this file exercises token refresh/logout.
  getTokenStore: () => ({
    getToken: () => 't',
    setToken: vi.fn(),
    subscribe: vi.fn().mockReturnValue(vi.fn()),
    refresh: vi.fn().mockResolvedValue(null),
    logout: vi.fn().mockResolvedValue(undefined),
  }),
}));

const overviewMock = vi.fn();
vi.mock('../../../../api/rbac/home-tag-sections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../api/rbac/home-tag-sections')>()),
  listHomeTagSectionOverview: (...args: unknown[]) => overviewMock(...args),
}));
vi.mock('./state-picker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./state-picker')>()),
  useBranchStates: () => ['Delhi', 'Uttar Pradesh'],
}));

const ROWS: HomeTagSectionOverviewRow[] = [
  { state: null, sectionsEnabled: 3, liveSections: 2, updatedAt: '2026-10-28T00:00:00Z' },
  { state: 'Delhi', sectionsEnabled: 1, liveSections: 0, updatedAt: '2026-10-20T00:00:00Z' },
];

function CurrentPath() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/account/masters/home-tag-sections']}>
      <Routes>
        <Route path="*" element={<><HomeTagSectionsManagement /><CurrentPath /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

const table = () => document.querySelector('sky-data-table') as HTMLElement & { rows?: string };
const tableRows = () => JSON.parse(String(table().rows ?? table().getAttribute('rows') ?? '[]'));

beforeEach(() => {
  overviewMock.mockReset().mockResolvedValue({ data: ROWS });
});

describe('Home Tag Sections overview (PLANNING §7.1)', () => {
  it('lists every state with how many of its 4 tags are enabled and live, Global first', async () => {
    renderPage();
    await waitFor(() => expect(tableRows()).toHaveLength(2));
    expect(tableRows()[0]).toMatchObject({ State: 'Global / Default', 'Sections enabled': '3 of 4', Live: 2 });
    expect(tableRows()[1]).toMatchObject({ State: 'Delhi', 'Sections enabled': '1 of 4', Live: 0 });
  });

  it('opens the state page of the row chosen', async () => {
    const { getByTestId } = renderPage();
    await waitFor(() => expect(tableRows()).toHaveLength(2));
    fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action: 'open', rowIndex: 1 } }));
    expect(getByTestId('path').textContent).toBe('/account/masters/home-tag-sections/Delhi');
    fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action: 'open', rowIndex: 0 } }));
    expect(getByTestId('path').textContent).toBe('/account/masters/home-tag-sections/global');
  });

  it('offers "New state" only for states with no configured sections yet', async () => {
    renderPage();
    await waitFor(() => expect(tableRows()).toHaveLength(2));
    const items = Array.from(document.querySelectorAll('md-menu-item')).map((el) => el.textContent?.trim());
    expect(items).toEqual(['Uttar Pradesh']);
  });

  it('shows a dash for the date when a state has never changed', () => {
    expect(toOverviewRow({ state: 'Goa', sectionsEnabled: 0, liveSections: 0, updatedAt: null })).toMatchObject({
      'Last change': '—',
    });
  });
});
