import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeTagSectionRow } from '../../../../api/rbac/home-tag-sections';
import { HomeTagSectionsStatePage } from './home-tag-sections-state';

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ token: 't', can: () => true }),
  getTokenStore: () => ({
    getToken: () => 't',
    setToken: vi.fn(),
    subscribe: vi.fn().mockReturnValue(vi.fn()),
    refresh: vi.fn().mockResolvedValue(null),
    logout: vi.fn().mockResolvedValue(undefined),
  }),
}));
const snackbarMock = vi.fn();
vi.mock('../../../../snackbar/snackbar', () => ({ showSnackbar: (...args: unknown[]) => snackbarMock(...args) }));

const api = vi.hoisted(() => ({ listSections: vi.fn(), setEnabled: vi.fn() }));
vi.mock('../../../../api/rbac/home-tag-sections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../api/rbac/home-tag-sections')>()),
  listHomeTagSections: api.listSections,
  setHomeTagSectionEnabled: api.setEnabled,
}));

const row = (overrides: Partial<HomeTagSectionRow>): HomeTagSectionRow => ({
  id: null,
  state: 'Delhi',
  tag: 'NEW',
  title: 'New',
  isEnabled: false,
  itemCount: 0,
  eligibleCount: 0,
  minimumRequired: 1,
  status: 'DISABLED',
  updatedAt: null,
  ...overrides,
});

const ROWS: HomeTagSectionRow[] = [
  row({ tag: 'NEW', title: 'New', id: 'sec-new', isEnabled: true, itemCount: 3, eligibleCount: 2, status: 'LIVE' }),
  row({ tag: 'DEAL', title: 'Deal', id: 'sec-deal', isEnabled: true, itemCount: 1, eligibleCount: 0, status: 'DRAFT' }),
  row({ tag: 'HOT_DEAL', title: 'Hot Deal' }),
  row({ tag: 'EXPIRE_SOON', title: 'Expire Soon' }),
];

function CurrentPath() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

function renderPage(path = '/account/masters/home-tag-sections/Delhi') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/account/masters/home-tag-sections/:state"
          element={
            <>
              <HomeTagSectionsStatePage />
              <CurrentPath />
            </>
          }
        />
        <Route
          path="/account/masters/home-tag-sections/:state/:tag"
          element={
            <>
              <HomeTagSectionsStatePage />
              <CurrentPath />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  snackbarMock.mockReset();
  api.listSections.mockResolvedValue({ data: ROWS });
});

describe('Home Tag Sections state page (PLANNING §7.1)', () => {
  it('always shows all 4 tag rows, even ones never configured', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('New')).toBeTruthy());
    expect(screen.getByText('Deal')).toBeTruthy();
    expect(screen.getByText('Hot Deal')).toBeTruthy();
    expect(screen.getByText('Expire Soon')).toBeTruthy();
  });

  it('shows each row\'s status and eligible/total count', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/Live · 2 of 3 deals/)).toBeTruthy());
    expect(screen.getByText(/Draft · 0 of 1 deal visible/)).toBeTruthy();
    expect(screen.getAllByText(/Disabled · 0 of 0 deals visible/)).toHaveLength(2);
  });

  it('enables a never-configured tag with the switch', async () => {
    api.setEnabled.mockResolvedValue({ data: { id: 'sec-hot', state: 'Delhi', tag: 'HOT_DEAL', isEnabled: true, createdAt: '', updatedAt: '' } });
    renderPage();
    await screen.findByText('Hot Deal');
    const switches = document.querySelectorAll('md-switch');
    // Rows render in ADMIN_TAG_ORDER: New, Deal, Hot Deal, Expire soon — index 2 is Hot Deal.
    await act(async () => {
      fireEvent.change(switches[2], { target: { selected: true } } as never);
      switches[2].dispatchEvent(new Event('change'));
    });
    await waitFor(() => expect(api.setEnabled).toHaveBeenCalledWith('t', 'Delhi', 'HOT_DEAL', true));
  });

  it('navigates to a tag\'s builder from "Open builder"', async () => {
    const { getByTestId } = renderPage();
    await screen.findByText('New');
    fireEvent.click(screen.getByText('Open New builder'));
    expect(getByTestId('path').textContent).toBe('/account/masters/home-tag-sections/Delhi/NEW');
  });
});
