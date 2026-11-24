import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SnackbarHost } from '../../../../snackbar/snackbar';
import { VoucherFulfilmentPage } from './voucher-fulfilment-page';

/**
 * Feature: Voucher Fulfilment page (screens 3/4/5 of the scan flow)
 * Scenario: the page always re-runs the full server-side check (`verifyVoucher`) on mount — never
 * trusting how it was reached — and branches purely on `{result, entitlement}`: VALID+ACTIVE is
 * "Valid voucher" (Start service), VALID+STARTED/OTP_REQUESTED is "Service in progress" (Service
 * done), ALREADY_USED is the completed/payout-eligible screen, and every other result is a
 * read-only error card with "Back to orders" only.
 */

const LONG = { timeout: 5000 };

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => ({ token: 'tok' }) }));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const verifyVoucherMock = vi.fn();
const startServiceMock = vi.fn();
const finishServiceMock = vi.fn();
vi.mock('../../../../api/rbac/vouchers', () => ({
  verifyVoucher: (...args: unknown[]) => verifyVoucherMock(...args),
  startService: (...args: unknown[]) => startServiceMock(...args),
  finishService: (...args: unknown[]) => finishServiceMock(...args),
}));

const CODE = 'MSD-DL-ABC123';

// `sky-feature-card`'s `headline`/`text` are set as element ATTRIBUTES, not light-DOM text
// content, under this test harness (jsdom can't see through its shadow DOM) — same gap
// `order-detail-page.test.tsx`'s own `needsReviewCard()` documents. Query/assert on the attribute
// directly rather than `screen.findByText`.
function featureCard(headlineSubstring: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll('sky-feature-card')).find((el) => el.getAttribute('headline')?.includes(headlineSubstring)) as HTMLElement | undefined;
}
async function waitForFeatureCard(headlineSubstring: string) {
  await waitFor(() => expect(featureCard(headlineSubstring)).toBeTruthy(), LONG);
  return featureCard(headlineSubstring) as HTMLElement;
}
function hasButton(tag: 'md-filled-button' | 'md-outlined-button', label: string): boolean {
  return Array.from(document.querySelectorAll(tag)).some((el) => el.textContent?.includes(label));
}
function clickButton(tag: 'md-filled-button' | 'md-outlined-button', label: string) {
  const btn = Array.from(document.querySelectorAll(tag)).find((el) => el.textContent?.includes(label));
  if (!btn) throw new Error(`${tag} "${label}" not found`);
  fireEvent.click(btn);
}

function entitlementFixture(overrides: Record<string, unknown> = {}) {
  return {
    voucherCode: CODE,
    itemName: 'Deep Tissue Massage',
    fulfilmentKind: 'SERVICE_SESSION',
    entitlementStatus: 'ACTIVE',
    customerName: 'Jane Doe',
    customerPhone: '+919876543210',
    orderId: 'order-1',
    orderNumber: 'ORD-AB123456',
    branchName: 'MG Road',
    grossAmount: '1000.00',
    memberShareAmount: '800.00',
    settlementStatus: 'PENDING_FULFILMENT',
    purchasedAt: '2026-10-29T10:00:00.000Z',
    qrExpiresAt: '2099-01-01T00:00:00.000Z',
    completedAt: null,
    serviceStartedAt: null,
    ...overrides,
  };
}

function renderAt(code = CODE) {
  return render(
    <MemoryRouter initialEntries={[`/account/vendor-orders/verify/${code}`]}>
      <Routes>
        <Route path="/account/vendor-orders/verify/:code" element={<VoucherFulfilmentPage />} />
      </Routes>
      <SnackbarHost />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('VoucherFulfilmentPage — Valid voucher (screen 3)', () => {
  it('shows the customer/order facts and a Start service button for an ACTIVE voucher', async () => {
    verifyVoucherMock.mockResolvedValue({ data: { result: 'VALID', entitlement: entitlementFixture() } });
    renderAt();

    await waitForFeatureCard('Valid voucher');
    expect(screen.getByText('+919876543210')).toBeTruthy();
    expect(screen.getByText('MG Road')).toBeTruthy();
    expect(screen.getByText('₹1,000')).toBeTruthy();
    expect(screen.getByText('₹800')).toBeTruthy();
    expect(hasButton('md-filled-button', 'Start service')).toBe(true);
  });

  it('tapping Start service calls startService then re-verifies', async () => {
    verifyVoucherMock.mockResolvedValue({ data: { result: 'VALID', entitlement: entitlementFixture() } });
    startServiceMock.mockResolvedValue({ data: {} });
    renderAt();
    await waitForFeatureCard('Valid voucher');

    clickButton('md-filled-button', 'Start service');

    await waitFor(() => expect(startServiceMock).toHaveBeenCalledWith('tok', CODE), LONG);
    await waitFor(() => expect(verifyVoucherMock).toHaveBeenCalledTimes(2), LONG);
  });
});

describe('VoucherFulfilmentPage — Service in progress (screen 4)', () => {
  it('shows a Service done button for a STARTED voucher', async () => {
    verifyVoucherMock.mockResolvedValue({
      data: { result: 'VALID', entitlement: entitlementFixture({ entitlementStatus: 'STARTED', serviceStartedAt: '2026-11-20T09:00:00.000Z' }) },
    });
    renderAt();

    await waitForFeatureCard('Service in progress');
    expect(hasButton('md-filled-button', 'Service done')).toBe(true);
    expect(hasButton('md-filled-button', 'Start service')).toBe(false);
  });

  it('treats a legacy OTP_REQUESTED voucher identically to STARTED — not orphaned by the retired OTP system', async () => {
    verifyVoucherMock.mockResolvedValue({ data: { result: 'VALID', entitlement: entitlementFixture({ entitlementStatus: 'OTP_REQUESTED' }) } });
    renderAt();

    await waitForFeatureCard('Service in progress');
    expect(hasButton('md-filled-button', 'Service done')).toBe(true);
  });

  it('tapping Service done calls finishService then re-verifies', async () => {
    verifyVoucherMock.mockResolvedValue({ data: { result: 'VALID', entitlement: entitlementFixture({ entitlementStatus: 'STARTED' }) } });
    finishServiceMock.mockResolvedValue({ data: {} });
    renderAt();
    await waitForFeatureCard('Service in progress');

    clickButton('md-filled-button', 'Service done');

    await waitFor(() => expect(finishServiceMock).toHaveBeenCalledWith('tok', CODE), LONG);
    await waitFor(() => expect(verifyVoucherMock).toHaveBeenCalledTimes(2), LONG);
  });
});

describe('VoucherFulfilmentPage — Done (screen 5)', () => {
  it('shows the payout-eligible copy, Scan next customer and Back to orders', async () => {
    verifyVoucherMock.mockResolvedValue({
      data: { result: 'ALREADY_USED', entitlement: entitlementFixture({ entitlementStatus: 'COMPLETED', completedAt: '2026-11-20T10:30:00.000Z' }) },
    });
    renderAt();

    const card = await waitForFeatureCard('Service completed');
    expect(card.getAttribute('text')).toContain('is now eligible');
    expect(hasButton('md-filled-button', 'Scan next customer')).toBe(true);
    expect(hasButton('md-outlined-button', 'Back to orders')).toBe(true);
  });

  it('"Scan next customer" navigates to the scanner', async () => {
    verifyVoucherMock.mockResolvedValue({
      data: { result: 'ALREADY_USED', entitlement: entitlementFixture({ entitlementStatus: 'COMPLETED', completedAt: '2026-11-20T10:30:00.000Z' }) },
    });
    renderAt();
    await waitForFeatureCard('Service completed');

    clickButton('md-filled-button', 'Scan next customer');

    expect(navigateMock).toHaveBeenCalledWith('/account/vendor-orders/scan');
  });
});

describe('VoucherFulfilmentPage — every other result is a read-only error card', () => {
  it.each([
    ['EXPIRED', 'Expired on'],
    ['CANCELLED_REFUNDED', 'cancelled or refunded'],
    ['WRONG_MEMBER_BRANCH', 'another spa'],
    ['PAYMENT_NOT_COMPLETE', 'Payment not completed'],
    ['NEEDS_REVIEW', 'admin review'],
    ['NOT_QR_ELIGIBLE', "don't need a QR"],
  ])('result %s shows its mapped message with only a Back to orders action', async (result, expectedText) => {
    verifyVoucherMock.mockResolvedValue({
      data: { result, entitlement: entitlementFixture({ qrExpiresAt: '2020-01-01T00:00:00.000Z' }) },
    });
    renderAt();

    const card = await waitForFeatureCard(expectedText.split(' ')[0]!);
    expect(card.getAttribute('headline')?.toLowerCase()).toContain(expectedText.toLowerCase());
    expect(hasButton('md-filled-button', 'Start service')).toBe(false);
    expect(hasButton('md-outlined-button', 'Back to orders')).toBe(true);
  });
});

describe('VoucherFulfilmentPage — always re-verifies regardless of how the page was reached', () => {
  it('a direct mount with a stale/invalid code still re-runs the full check and shows the correct screen', async () => {
    verifyVoucherMock.mockResolvedValue({
      data: { result: 'ALREADY_USED', entitlement: entitlementFixture({ entitlementStatus: 'COMPLETED', completedAt: '2026-11-01T00:00:00.000Z' }) },
    });
    renderAt();

    await waitFor(() => expect(verifyVoucherMock).toHaveBeenCalledWith('tok', CODE), LONG);
    await waitForFeatureCard('Service completed');
  });

  it('shows an error state (never a crash) when verifyVoucher itself fails', async () => {
    verifyVoucherMock.mockRejectedValue(new Error('network down'));
    renderAt();
    expect(await screen.findByRole('alert', {}, LONG)).toBeTruthy();
    expect(hasButton('md-outlined-button', 'Back to orders')).toBe(true);
  });
});
