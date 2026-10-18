import { fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SliderOverviewRow } from '../../../../api/rbac/home-hero';
import { HomeHeroManagement, toOverviewRow } from './home-hero';

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ token: 't', can: () => true }),
}));

const overviewMock = vi.fn();
vi.mock('../../../../api/rbac/home-hero', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../api/rbac/home-hero')>()),
  listHomeHeroOverview: (...args: unknown[]) => overviewMock(...args),
}));
vi.mock('./state-picker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./state-picker')>()),
  useBranchStates: () => ['Delhi', 'Uttar Pradesh'],
}));

const ROWS: SliderOverviewRow[] = [
  { state: null, status: 'LIVE', eligibleCount: 6, minimumRequired: 5, deals: 4, products: 2, updatedAt: '2026-10-02T00:00:00Z' },
  { state: 'Delhi', status: 'DRAFT', eligibleCount: 3, minimumRequired: 5, deals: 2, products: 1, updatedAt: '2026-10-18T00:00:00Z' },
];

function CurrentPath() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/account/masters/home-hero']}>
      <Routes>
        <Route path="*" element={<><HomeHeroManagement /><CurrentPath /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

const table = () => document.querySelector('sky-data-table') as HTMLElement & { rows?: string };
const tableRows = () => JSON.parse(String(table().rows ?? table().getAttribute('rows') ?? '[]'));

beforeEach(() => {
  overviewMock.mockReset().mockResolvedValue({ data: ROWS });
});

describe('Home hero overview (PLANNING §7, D28)', () => {
  it('lists every slider with its status and progress, Global first', async () => {
    renderPage();
    await waitFor(() => expect(tableRows()).toHaveLength(2));
    expect(tableRows()[0]).toMatchObject({ Slider: 'Global / Default', Status: 'Live', 'Visible slides': '6 of 5' });
    expect(tableRows()[1]).toMatchObject({ Slider: 'Delhi', Status: 'Draft', 'Visible slides': '3 of 5', Deals: 2, Products: 1 });
  });

  it('opens the builder of the row chosen', async () => {
    const { getByTestId } = renderPage();
    await waitFor(() => expect(tableRows()).toHaveLength(2));
    fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action: 'open', rowIndex: 1 } }));
    expect(getByTestId('path').textContent).toBe('/account/masters/home-hero/Delhi');
    fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action: 'open', rowIndex: 0 } }));
    expect(getByTestId('path').textContent).toBe('/account/masters/home-hero/global');
  });

  it('offers a new slider only for states that have none', async () => {
    renderPage();
    await waitFor(() => expect(tableRows()).toHaveLength(2));
    const items = Array.from(document.querySelectorAll('md-menu-item')).map((el) => el.textContent?.trim());
    expect(items).toEqual(['Uttar Pradesh']);
  });

  it('shows an empty slider as Empty with a dash for the date', () => {
    expect(
      toOverviewRow({ state: 'Goa', status: 'EMPTY', eligibleCount: 0, minimumRequired: 5, deals: 0, products: 0, updatedAt: null }),
    ).toMatchObject({ Status: 'Empty', 'Last change': '—' });
  });
});
