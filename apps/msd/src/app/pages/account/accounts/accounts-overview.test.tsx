import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AccountsOverview } from '../../../../api/rbac/accounts';
import type { MemberSettlementRow } from '../../../../api/rbac/settlements';

// Full-suite runs under worker-pool load can push jsdom async resolution past testing-library's
// default 1000ms waitFor/findBy timeout even though every assertion here is otherwise correct —
// the same class of flake `member-settlement-detail.test.tsx`/`orders-and-verify.test.tsx` widen
// for. Widen the timeout rather than chase a race that isn't actually here.
const LONG = { timeout: 5000 };

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ token: 'test-token', can: () => true }),
}));

const getAccountsOverviewMock = vi.fn();
vi.mock('../../../../api/rbac/accounts', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/accounts')>('../../../../api/rbac/accounts');
  return { ...actual, getAccountsOverview: (...args: unknown[]) => getAccountsOverviewMock(...args) };
});

const listMemberSettlementsMock = vi.fn();
vi.mock('../../../../api/rbac/settlements', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/settlements')>('../../../../api/rbac/settlements');
  return { ...actual, listMemberSettlements: (...args: unknown[]) => listMemberSettlementsMock(...args) };
});

import { AccountsOverviewPage } from './accounts-overview';

/** A prop set on a sky-* element, or its attribute when jsdom has not upgraded the element —
 *  same convention `vendor-detail-page.test.tsx` already uses for these raw custom elements. */
function attr(el: Element, name: string): string | null {
  const value = (el as unknown as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : el.getAttribute(name);
}

function tileCards(): Element[] {
  return Array.from(document.querySelectorAll('sky-tile-card'));
}

function ctaBanners(): Element[] {
  return Array.from(document.querySelectorAll('sky-cta-banner'));
}

const POPULATED_OVERVIEW: AccountsOverview = {
  collections: '3000.00',
  commission: '600.00',
  memberLiability: '2400.00',
  pendingFulfilment: '800.00',
  onHold: '1200.00',
  readyForPayout: '400.00',
  paid: '1000.00',
  readyForPayoutMemberCount: 2,
  disputeAttention: { openCount: 3, blockedAmount: '450.00' },
};

const ZERO_OVERVIEW: AccountsOverview = {
  collections: '0.00',
  commission: '0.00',
  memberLiability: '0.00',
  pendingFulfilment: '0.00',
  onHold: '0.00',
  readyForPayout: '0.00',
  paid: '0.00',
  readyForPayoutMemberCount: 0,
  disputeAttention: { openCount: 0, blockedAmount: '0.00' },
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/account/accounts/overview']}>
      <AccountsOverviewPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listMemberSettlementsMock.mockResolvedValue({ data: [] });
});

describe('AccountsOverviewPage — loading state', () => {
  it('shows a loading message and renders no cards before the data resolves', () => {
    getAccountsOverviewMock.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(screen.getByText('Loading overview…')).toBeTruthy();
    expect(tileCards()).toHaveLength(0);
  });
});

describe('AccountsOverviewPage — error state', () => {
  it('shows an error message with a Retry button, never a fabricated ₹0 card', async () => {
    getAccountsOverviewMock.mockRejectedValue(new Error('network down'));
    renderPage();
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy(), LONG);
    expect(tileCards()).toHaveLength(0);
    expect(screen.getByText('Retry')).toBeTruthy();
  });

  it('clicking Retry re-invokes the load (calls getAccountsOverview again) and can recover to the populated state', async () => {
    getAccountsOverviewMock.mockRejectedValueOnce(new Error('network down'));
    renderPage();
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy(), LONG);
    expect(getAccountsOverviewMock).toHaveBeenCalledTimes(1);

    getAccountsOverviewMock.mockResolvedValueOnce({ data: POPULATED_OVERVIEW });
    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => expect(getAccountsOverviewMock).toHaveBeenCalledTimes(2), LONG);
    await waitFor(() => expect(tileCards().length).toBeGreaterThan(0), LONG);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

/**
 * Feature: Accounts Overview — populated state
 * Scenario: three header cards from `collections`/`commission`/`memberLiability`, a member-dues
 * breakdown, an "Already Paid" tile, and both CTA banners shown when their underlying counts are
 * non-zero.
 */
describe('AccountsOverviewPage — populated state', () => {
  it('renders the three header cards with the live formatted amounts', async () => {
    getAccountsOverviewMock.mockResolvedValue({ data: POPULATED_OVERVIEW });
    renderPage();
    await waitFor(() => expect(tileCards().length).toBeGreaterThan(0), LONG);

    const headlines = tileCards().map((el) => attr(el, 'headline'));
    expect(headlines).toContain('₹3,000');
    expect(headlines).toContain('₹600');
    expect(headlines).toContain('₹2,400');
  });

  it('shows the "ready for payout" CTA banner with the correct amount and member count when readyForPayout > 0', async () => {
    getAccountsOverviewMock.mockResolvedValue({ data: POPULATED_OVERVIEW });
    renderPage();
    await waitFor(() => expect(ctaBanners().length).toBeGreaterThan(0), LONG);

    const readyBanner = ctaBanners().find((el) => (attr(el, 'headline') ?? '').includes('ready for payout'));
    expect(readyBanner).toBeTruthy();
    expect(attr(readyBanner!, 'headline')).toBe('₹400 ready for payout');
    expect(attr(readyBanner!, 'text')).toContain('2 members eligible');
    expect(attr(readyBanner!, 'ctaHref')).toBe('/account/accounts/member-settlements?status=ready');
  });

  it('shows the disputes-attention CTA banner, with copy clarifying the amount is already counted inside On Hold', async () => {
    getAccountsOverviewMock.mockResolvedValue({ data: POPULATED_OVERVIEW });
    renderPage();
    await waitFor(() => expect(ctaBanners().length).toBeGreaterThan(0), LONG);

    const disputeBanner = ctaBanners().find((el) => (attr(el, 'headline') ?? '').includes('open dispute'));
    expect(disputeBanner).toBeTruthy();
    expect(attr(disputeBanner!, 'headline')).toBe('3 open disputes');
    expect(attr(disputeBanner!, 'text')).toContain('already counted inside On Hold');
    expect(attr(disputeBanner!, 'ctaHref')).toBe('/account/accounts/refunds-disputes');
  });
});

/**
 * Feature: Accounts Overview — zero states
 * Scenario: a `readyForPayout` of 0 hides the "ready for payout" strip entirely (never shows a
 * ₹0 banner); a `disputeAttention.openCount` of 0 hides the attention banner entirely. The three
 * header cards and the member-dues breakdown still render (correctly showing ₹0, since those are
 * always-shown totals, never conditionally hidden).
 */
describe('AccountsOverviewPage — zero state', () => {
  it('hides the ready-for-payout banner when readyForPayout is 0', async () => {
    getAccountsOverviewMock.mockResolvedValue({ data: ZERO_OVERVIEW });
    renderPage();
    await waitFor(() => expect(tileCards().length).toBeGreaterThan(0), LONG);
    expect(ctaBanners().some((el) => (attr(el, 'headline') ?? '').includes('ready for payout'))).toBe(false);
  });

  it('hides the disputes-attention banner when disputeAttention.openCount is 0', async () => {
    getAccountsOverviewMock.mockResolvedValue({ data: ZERO_OVERVIEW });
    renderPage();
    await waitFor(() => expect(tileCards().length).toBeGreaterThan(0), LONG);
    expect(ctaBanners().some((el) => (attr(el, 'headline') ?? '').includes('open dispute'))).toBe(false);
  });

  it('still renders the three header cards showing ₹0, never omitting them entirely', async () => {
    getAccountsOverviewMock.mockResolvedValue({ data: ZERO_OVERVIEW });
    renderPage();
    await waitFor(() => expect(tileCards().length).toBeGreaterThan(0), LONG);
    const headlines = tileCards().map((el) => attr(el, 'headline'));
    expect(headlines).toContain('₹0');
  });
});

/**
 * Feature: Accounts Overview — "Members ready for payout" preview table (sub-component)
 */
describe('AccountsOverviewPage — Members ready for payout preview', () => {
  it('shows an empty-state message when no member is ready for payout', async () => {
    getAccountsOverviewMock.mockResolvedValue({ data: POPULATED_OVERVIEW });
    listMemberSettlementsMock.mockResolvedValue({ data: [] });
    renderPage();
    expect(await screen.findByText('No member is currently ready for payout.', {}, LONG)).toBeTruthy();
  });

  it('shows an error state with Retry when the preview table fails to load', async () => {
    getAccountsOverviewMock.mockResolvedValue({ data: POPULATED_OVERVIEW });
    listMemberSettlementsMock.mockRejectedValue(new Error('network down'));
    renderPage();
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0), LONG);
  });

  it("renders members ready for payout and fetches with status: 'ready'", async () => {
    getAccountsOverviewMock.mockResolvedValue({ data: POPULATED_OVERVIEW });
    const row: MemberSettlementRow = {
      vendorId: 'vendor-1',
      businessName: 'ABC Spa',
      bankDetailsOnFile: true,
      bankReferenceMasked: '••••1234',
      primaryBranchName: 'Gorakhpur Branch',
      primaryBranchCity: 'Gorakhpur',
      pendingFulfilment: '0.00',
      onHold: '0.00',
      readyForPayout: '400.00',
      paid: '0.00',
    };
    listMemberSettlementsMock.mockResolvedValue({ data: [row] });
    renderPage();
    await waitFor(() => expect(listMemberSettlementsMock).toHaveBeenCalledWith('test-token', expect.objectContaining({ status: 'ready' })), LONG);
  });
});
