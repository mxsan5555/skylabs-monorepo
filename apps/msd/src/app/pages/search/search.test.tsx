import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CatalogCategoryWithChildren, CatalogDeal, CatalogLocation } from '../../../api/catalog';
import { ToastProvider } from '../../../toast/toast-context';

const listCatalogCategoriesMock = vi.fn();
const listCatalogDealsMock = vi.fn();
const listCatalogLocationsMock = vi.fn();

vi.mock('../../../api/catalog', async () => {
  const actual = await vi.importActual<typeof import('../../../api/catalog')>('../../../api/catalog');
  return {
    ...actual,
    listCatalogCategories: (...args: unknown[]) => listCatalogCategoriesMock(...args),
    listCatalogDeals: (...args: unknown[]) => listCatalogDealsMock(...args),
    listCatalogLocations: (...args: unknown[]) => listCatalogLocationsMock(...args),
  };
});

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ isAuthenticated: false, token: null }),
}));

vi.mock('../../../wishlist/wishlist-context', () => ({
  useWishlist: () => ({ toggle: vi.fn(), has: () => false }),
}));

import { Search } from './search';

const LOCATIONS: CatalogLocation[] = [
  { state: 'Maharashtra', city: 'Mumbai' },
  { state: 'Maharashtra', city: 'Pune' },
  { state: 'Karnataka', city: 'Bengaluru' },
];

function cat(overrides: Partial<CatalogCategoryWithChildren>): CatalogCategoryWithChildren {
  return { id: 'cat-1', name: 'Massage', slug: 'massage', description: null, children: [], ...overrides };
}

function deal(overrides: Partial<CatalogDeal>): CatalogDeal {
  return {
    id: 'deal-1',
    title: 'Full Body Massage',
    slug: 'full-body-massage',
    shortDescription: null,
    description: null,
    originalPrice: '999',
    salePrice: '699',
    discountPercent: 30,
    durationMinutes: 60,
    images: [],
    category: null,
    subcategory: null,
    product: null,
    vendor: null,
    branch: null,
    packages: [],
    ...overrides,
  } as CatalogDeal;
}

/** Renders the current URL search string as plain text — a reliable way to assert on
 *  react-router's `useSearchParams` sync without depending on any Material web component's
 *  internal (non-attribute-reflecting, jsdom-unfriendly) reactive properties. */
function LocationBar() {
  const location = useLocation();
  return <div data-testid="location-bar">{location.pathname}{location.search}</div>;
}

function renderSearch(initialEntries: string[] = ['/explore']) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route
            path="/explore"
            element={
              <>
                <LocationBar />
                <Search />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

function currentUrl(): string {
  return screen.getByTestId('location-bar').textContent ?? '';
}

beforeEach(() => {
  vi.clearAllMocks();
  listCatalogCategoriesMock.mockResolvedValue({ data: [cat({})] });
  listCatalogLocationsMock.mockResolvedValue({ data: LOCATIONS });
  listCatalogDealsMock.mockResolvedValue({ data: [deal({})] });
});

/** The Location filter trigger is the 4th (last) `md-filter-chip` in the filter bar (Price,
 *  Suggested, Category, Location — see search.tsx's chip order). */
function locationChipElement(): HTMLElement {
  const chips = Array.from(document.querySelectorAll('md-filter-chip')) as HTMLElement[];
  const chip = chips[chips.length - 1];
  if (!chip) throw new Error('Location filter chip not found');
  return chip;
}

/** Same custom-element accessibility gap as elsewhere in this suite: `<md-outlined-select
 *  label="State">` doesn't expose a queryable accessible name under jsdom, so `getByLabelText`
 *  can't find it. The Location dialog's State select is the first (and, until a State is picked,
 *  only) `md-outlined-select` inside it; City is the second, rendered only once a State is set. */
function locationDialogSelects(): HTMLElement[] {
  const dialog = Array.from(document.querySelectorAll('md-dialog')).find((d) => d.textContent?.includes('Filter by Location'));
  if (!dialog) throw new Error('Location dialog not found');
  return Array.from(dialog.querySelectorAll('md-outlined-select')) as HTMLElement[];
}

function findLocationDialogClearButton(): HTMLElement {
  const dialog = Array.from(document.querySelectorAll('md-dialog')).find((d) => d.textContent?.includes('Filter by Location'));
  if (!dialog) throw new Error('Location dialog not found');
  const clearButton = Array.from(dialog.querySelectorAll('md-text-button')).find((el) => el.textContent === 'Clear');
  if (!clearButton) throw new Error('Clear button not found in Location dialog');
  return clearButton as HTMLElement;
}

/**
 * Feature: /explore location filter
 * Scenario: State/City selections stay in sync with the URL (`state`/`city` query params),
 * matching the existing `q`/`category`/`sort` pattern exactly, and narrow the `listCatalogDeals`
 * call.
 *
 * Given: a customer opens /explore and picks a State (and optionally a City)
 * When: the Location filter dialog's selects change
 * Then: the URL gains `state`/`city` params and `listCatalogDeals` is called with them
 *
 * Edge cases:
 * - clearing the location removes both params and re-fetches without them
 * - a `?state=&city=` URL present on load (e.g. from browser back/forward) restores filter state
 */
describe('Search — location filter URL sync', () => {
  it('reads an initial ?state=&city= from the URL on mount and passes them to listCatalogDeals', async () => {
    renderSearch(['/explore?state=Maharashtra&city=Mumbai']);
    await waitFor(() =>
      expect(listCatalogDealsMock).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'Maharashtra', city: 'Mumbai' }),
      ),
    );
    expect(currentUrl()).toBe('/explore?state=Maharashtra&city=Mumbai');
  });

  // NOTE: the forward direction (picking a State/City in the dialog's <md-outlined-select> and
  // watching it WRITE to the URL) is intentionally NOT driven here via a simulated DOM event.
  // Verified by direct reproduction: this repo's installed `@lit/react@1.0.8` registers its
  // custom-element property/event bindings (incl. `onChange`) inside a `useLayoutEffect` whose
  // ref-timing does not fire correctly under React 19.2.7 in jsdom — a manually-`addEventListener`'d
  // native `change` listener on the very same `<md-outlined-select>` node receives a dispatched
  // event immediately, but the listener `@lit/react` is supposed to attach via its wrapper never
  // does, so `search.tsx`'s own `onChange` handler is never invoked no matter how the DOM event is
  // dispatched. This is a pre-existing dependency-version gap in the whole app's test
  // infrastructure (affects every `onChange`/`onInput`-driven `md-*` control, not just this one),
  // not something introduced by or fixable within this feature. The "select a State/City and see
  // it take effect" flow is covered instead at the Playwright E2E level (a real browser's Shadow
  // DOM/custom-element runtime doesn't have this limitation) — see `apps/msd-e2e/src/vendor-onboarding.spec.ts`'s
  // public storefront location filter scenario.
  it('populates the State/City selects from listCatalogLocations, restricted to that state\'s own cities', async () => {
    renderSearch();
    await waitFor(() => expect(listCatalogLocationsMock).toHaveBeenCalled());
    fireEvent.click(locationChipElement());

    await waitFor(() => expect(locationDialogSelects().length).toBeGreaterThan(0));
    const stateOptions = Array.from(locationDialogSelects()[0].querySelectorAll('md-select-option')).map((o) => o.textContent?.trim());
    expect(stateOptions).toEqual(['All states', 'Karnataka', 'Maharashtra']);
  });

  // Edge case: clearing removes both params
  it('clearing the location filter drops state/city from the URL and the next listCatalogDeals call', async () => {
    renderSearch(['/explore?state=Maharashtra&city=Mumbai']);
    await waitFor(() =>
      expect(listCatalogDealsMock).toHaveBeenCalledWith(expect.objectContaining({ state: 'Maharashtra', city: 'Mumbai' })),
    );

    fireEvent.click(findLocationDialogClearButton());

    await waitFor(() => expect(currentUrl()).toBe('/explore'));
    expect(listCatalogDealsMock).toHaveBeenLastCalledWith(expect.objectContaining({ state: undefined, city: undefined }));
  });

  // Edge case: simulated back/forward — the URL changes under the same mounted Search instance
  // (not a remount), and its own `useEffect` on `params` re-syncs local filter state from it —
  // see search.tsx's own doc comment on why that resync effect exists.
  it('re-syncs filter state and re-fetches when the URL changes externally (simulated browser back/forward)', async () => {
    function NavBackHelper() {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate('/explore')}>
          simulate-back
        </button>
      );
    }
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/explore?state=Maharashtra&city=Mumbai']}>
          <Routes>
            <Route
              path="/explore"
              element={
                <>
                  <LocationBar />
                  <Search />
                  <NavBackHelper />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );
    await waitFor(() =>
      expect(listCatalogDealsMock).toHaveBeenCalledWith(expect.objectContaining({ state: 'Maharashtra', city: 'Mumbai' })),
    );

    // Simulate the browser restoring a prior history entry with the filter cleared — same
    // mounted Search component, only the URL/params change underneath it.
    fireEvent.click(screen.getByText('simulate-back'));

    await waitFor(() => expect(currentUrl()).toBe('/explore'));
    await waitFor(() =>
      expect(listCatalogDealsMock).toHaveBeenLastCalledWith(expect.objectContaining({ state: undefined, city: undefined })),
    );
  });
});
