import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SnackbarHost } from '../../../../snackbar/snackbar';

import { VoucherVerificationPage } from './voucher-verification-page';

/**
 * Feature: resumable, step-based voucher verification page
 * Scenario: the page renders purely from `verifyVoucher`'s response — fetched on mount and
 * re-fetched on every mutating action and "Refresh Status" click — never from any local
 * "what step am I on" state. Covers every `entitlementStatus` the backend can return, the
 * present-but-expired OTP challenge edge case, and the "never a plaintext OTP anywhere" rule.
 *
 * Given: a mocked `verifyVoucher` response for a given entitlementStatus/result
 * When: the page mounts (or "Refresh Status" is clicked, simulating a browser refresh)
 * Then: exactly the one correct next action renders, derived purely from server state
 *
 * Edge cases:
 * - a present-but-expired `otpChallenge.expiresAt` still renders the OTP step (never silently
 *   hidden or auto-advanced)
 * - "Resend" keys off the server's own `resendAvailableAt`, never a client-side timer
 * - no plaintext OTP ever appears in the rendered DOM or in any mutating API call's arguments
 */

const LONG = { timeout: 5000 };

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => ({ token: 'tok' }) }));

const verifyVoucherMock = vi.fn();
const startServiceMock = vi.fn();
const requestCompletionOtpMock = vi.fn();
const completeVoucherMock = vi.fn();
const shipVoucherMock = vi.fn();
const recordDeliveryEvidenceMock = vi.fn();
vi.mock('../../../../api/rbac/vouchers', () => ({
  verifyVoucher: (...args: unknown[]) => verifyVoucherMock(...args),
  startService: (...args: unknown[]) => startServiceMock(...args),
  requestCompletionOtp: (...args: unknown[]) => requestCompletionOtpMock(...args),
  completeVoucher: (...args: unknown[]) => completeVoucherMock(...args),
  shipVoucher: (...args: unknown[]) => shipVoucherMock(...args),
  recordDeliveryEvidence: (...args: unknown[]) => recordDeliveryEvidenceMock(...args),
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const CODE = 'MSD-DL-ABC123';

interface EntitlementOverrides {
  fulfilmentKind?: 'SERVICE_SESSION' | 'PRODUCT_PICKUP' | 'PRODUCT_SHIPPED';
  customerPhoneMasked?: string | null;
  customerEmailMasked?: string | null;
  otpChallenge?: {
    requestedAt: string;
    expiresAt: string;
    attempts: number;
    maxAttempts: number;
    resendAvailableAt: string;
  };
}

function verifyResponse(
  result: 'VALID' | 'ALREADY_USED' | 'EXPIRED' | 'CANCELLED_REFUNDED' | 'WRONG_MEMBER_BRANCH' | 'ADMIN_REVIEW_REQUIRED',
  entitlementStatus: 'ACTIVE' | 'STARTED' | 'OTP_REQUESTED' | 'COMPLETED' | 'CANCELLED' | 'REFUNDED',
  overrides: EntitlementOverrides = {},
) {
  return {
    data: {
      result,
      entitlement: {
        voucherCode: CODE,
        itemName: 'Deep Tissue Massage',
        fulfilmentKind: overrides.fulfilmentKind ?? 'SERVICE_SESSION',
        entitlementStatus,
        customerName: 'Jane Doe',
        // `??` would wrongly fall through on an explicit `null` override (e.g. "phone
        // unavailable, fall back to email") — only default when the key is absent entirely.
        customerPhoneMasked: 'customerPhoneMasked' in overrides ? overrides.customerPhoneMasked : '••••3210',
        customerEmailMasked: 'customerEmailMasked' in overrides ? overrides.customerEmailMasked : null,
        ...(overrides.otpChallenge ? { otpChallenge: overrides.otpChallenge } : {}),
      },
    },
  };
}

function renderAt(code = CODE) {
  return render(
    <MemoryRouter initialEntries={[`/account/vendor-orders/verify/${code}`]}>
      <Routes>
        <Route path="/account/vendor-orders/verify/:code" element={<VoucherVerificationPage />} />
      </Routes>
      <SnackbarHost />
    </MemoryRouter>,
  );
}

// Same "query by rendered text, drive the raw element" convention as `orders-and-verify.test.tsx`.
function hasButton(label: string): boolean {
  return Array.from(document.querySelectorAll('md-filled-button, md-text-button, md-outlined-button')).some((el) =>
    el.textContent?.includes(label),
  );
}
function clickButton(label: string) {
  const btn = Array.from(document.querySelectorAll('md-filled-button, md-text-button, md-outlined-button')).find((el) =>
    el.textContent?.includes(label),
  );
  if (!btn) throw new Error(`button "${label}" not found`);
  fireEvent.click(btn);
}
function textFields(): HTMLElement[] {
  return Array.from(document.querySelectorAll('md-outlined-text-field'));
}

async function waitForSummaryTitle() {
  await screen.findByText('Customer & Service', {}, LONG);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('VoucherVerificationPage — one correct action per entitlementStatus (SERVICE_SESSION)', () => {
  it('ACTIVE shows only "Start Service"', async () => {
    verifyVoucherMock.mockResolvedValue(verifyResponse('VALID', 'ACTIVE'));
    renderAt();
    await waitForSummaryTitle();

    expect(hasButton('Start Service')).toBe(true);
    expect(hasButton('Send Completion OTP')).toBe(false);
    expect(hasButton('Confirm & Complete')).toBe(false);
  });

  it('STARTED shows only "Send Completion OTP" (plus its own explanatory hint)', async () => {
    verifyVoucherMock.mockResolvedValue(verifyResponse('VALID', 'STARTED'));
    renderAt();
    await waitForSummaryTitle();

    expect(hasButton('Send Completion OTP')).toBe(true);
    expect(hasButton('Start Service')).toBe(false);
    expect(screen.getByText(/Request this after you.*provided the service/)).toBeTruthy();
  });

  it('OTP_REQUESTED shows the OTP entry step with "Confirm & Complete" and "Resend OTP"', async () => {
    verifyVoucherMock.mockResolvedValue(
      verifyResponse('VALID', 'OTP_REQUESTED', {
        otpChallenge: {
          requestedAt: '2026-10-10T10:00:00.000Z',
          expiresAt: '2099-01-01T00:00:00.000Z',
          attempts: 1,
          maxAttempts: 5,
          resendAvailableAt: '2026-10-10T10:01:00.000Z', // in the past relative to "now" in tests
        },
      }),
    );
    renderAt();
    await waitForSummaryTitle();

    expect(hasButton('Confirm & Complete')).toBe(true);
    expect(hasButton('Resend OTP')).toBe(true);
    expect(hasButton('Start Service')).toBe(false);
    expect(hasButton('Send Completion OTP')).toBe(false);
  });

  it('COMPLETED shows the final read-only summary — no form, no action buttons', async () => {
    verifyVoucherMock.mockResolvedValue(verifyResponse('ALREADY_USED', 'COMPLETED'));
    renderAt();
    await waitForSummaryTitle();

    // `sky-info-card`'s `heading`/`subheading` render inside its own internal template, not as
    // plain light-DOM text under jsdom — same attribute-selector convention
    // `order-detail-page.test.tsx`'s `needsReviewCard()` uses.
    expect(document.querySelector('sky-info-card[heading="Completed"]')).toBeTruthy();
    expect(hasButton('Start Service')).toBe(false);
    expect(hasButton('Send Completion OTP')).toBe(false);
    expect(hasButton('Confirm & Complete')).toBe(false);
    expect(textFields().length).toBe(0);
  });

  it('CANCELLED (result CANCELLED_REFUNDED) shows the generic result card, no wizard steps, no actions', async () => {
    verifyVoucherMock.mockResolvedValue(verifyResponse('CANCELLED_REFUNDED', 'CANCELLED'));
    renderAt();
    await screen.findByRole('heading', { level: 1 }, LONG);
    // `sky-feature-card`'s `headline` is likewise a non-text-content attribute.
    await waitFor(() => expect(document.querySelector('sky-feature-card[headline="Cancelled or refunded"]')).toBeTruthy(), LONG);

    expect(document.querySelector('.wizard-steps')).toBeNull();
    expect(hasButton('Start Service')).toBe(false);
    expect(screen.queryByText('Customer & Service')).toBeNull();
  });

  it('REFUNDED (result CANCELLED_REFUNDED) shows the same generic result card as CANCELLED', async () => {
    verifyVoucherMock.mockResolvedValue(verifyResponse('CANCELLED_REFUNDED', 'REFUNDED'));
    renderAt();
    await screen.findByRole('heading', { level: 1 }, LONG);
    await waitFor(() => expect(document.querySelector('sky-feature-card[headline="Cancelled or refunded"]')).toBeTruthy(), LONG);
    expect(document.querySelector('.wizard-steps')).toBeNull();
  });
});

describe('VoucherVerificationPage — PRODUCT fulfilment paths', () => {
  it('ACTIVE + PRODUCT_PICKUP shows "Send Completion OTP" AND the "Ship this item instead" panel', async () => {
    verifyVoucherMock.mockResolvedValue(verifyResponse('VALID', 'ACTIVE', { fulfilmentKind: 'PRODUCT_PICKUP' }));
    renderAt();
    await waitForSummaryTitle();

    expect(hasButton('Send Completion OTP')).toBe(true);
    expect(screen.getByText('Ship this item instead')).toBeTruthy();
    expect(hasButton('Ship')).toBe(true);
  });

  it('STARTED + PRODUCT_SHIPPED shows the delivery-evidence panel, never the OTP stepper', async () => {
    verifyVoucherMock.mockResolvedValue(verifyResponse('VALID', 'STARTED', { fulfilmentKind: 'PRODUCT_SHIPPED' }));
    renderAt();
    await waitForSummaryTitle();

    expect(screen.getByText('Record Pickup/Delivery Evidence')).toBeTruthy();
    expect(hasButton('Send Completion OTP')).toBe(false);
    expect(hasButton('Confirm & Complete')).toBe(false);
  });

  it('submitting delivery evidence calls recordDeliveryEvidence with the chosen file', async () => {
    verifyVoucherMock.mockResolvedValue(verifyResponse('VALID', 'STARTED', { fulfilmentKind: 'PRODUCT_SHIPPED' }));
    recordDeliveryEvidenceMock.mockResolvedValue({ data: { entitlementStatus: 'COMPLETED' } });
    renderAt();
    await waitForSummaryTitle();

    const fileInput = document.getElementById('evidence-file') as HTMLInputElement;
    const file = new File(['abc'], 'proof.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fireEvent.change(fileInput);

    clickButton('Record Evidence');
    await waitFor(() => expect(recordDeliveryEvidenceMock).toHaveBeenCalledWith('tok', CODE, file, 'proof.jpg', undefined), LONG);
  });
});

/**
 * Feature: resumable detail page — the expired-but-present OTP challenge edge case
 * Scenario: `expiresAt` in the past must NOT hide the OTP step or silently advance past it — the
 * member still needs to act (request a fresh OTP via Resend). "Resend" availability keys off the
 * server's own `resendAvailableAt`, never a client-side timer derived from `expiresAt`.
 */
describe('VoucherVerificationPage — expired OTP challenge still renders the OTP step', () => {
  it('a present-but-expired otpChallenge.expiresAt still shows the OTP step (never hidden/auto-advanced)', async () => {
    verifyVoucherMock.mockResolvedValue(
      verifyResponse('VALID', 'OTP_REQUESTED', {
        otpChallenge: {
          requestedAt: '2020-01-01T00:00:00.000Z',
          expiresAt: '2020-01-01T00:10:00.000Z', // long expired
          attempts: 3,
          maxAttempts: 5,
          resendAvailableAt: '2020-01-01T00:01:00.000Z', // also long past -> resend enabled
        },
      }),
    );
    renderAt();
    await waitForSummaryTitle();

    expect(screen.getByText('Enter the OTP the customer shares with you')).toBeTruthy();
    expect(hasButton('Confirm & Complete')).toBe(true);
    // Resend is enabled because resendAvailableAt has passed — a SERVER-computed fact, not a
    // client-side "is expiresAt in the past" shortcut. `disabled` isn't reliably readable as a
    // JS property on a `@lit/react`-wrapped element under jsdom (see `orders-and-
    // verify.test.tsx`'s own doc comment) — verify behaviourally instead: clicking actually
    // calls the mock.
    requestCompletionOtpMock.mockResolvedValue({ data: { requested: true } });
    clickButton('Resend OTP');
    await waitFor(() => expect(requestCompletionOtpMock).toHaveBeenCalledWith('tok', CODE), LONG);
  });

  // NOTE for whoever revisits this: `disabled` on a `@lit/react`-wrapped `md-text-button` is
  // provably a no-op in this jsdom harness — confirmed by inspecting the rendered `outerHTML`
  // directly (no `disabled` attribute/property appears regardless of the prop passed), AND by
  // reproducing the SAME gap in the pre-existing, already-known-flaky
  // `orders-and-verify.test.tsx` ("Complete does nothing until a 6-digit OTP is entered" times
  // out even in isolation — not just under full-suite load as that file's own comment claims).
  // There is no DOM-observable way to assert the "Resend is blocked while on cooldown" half of
  // this behaviour from outside in this harness; the production logic itself
  // (`resendAvailable = otpChallenge ? Date.now() >= resendAvailableAt : true`) was verified by
  // reading `voucher-verification-page.tsx` directly. This test instead locks down the half that
  // IS observable: the rendered attempts/expiry hint reflects the server's own challenge data
  // (not a hardcoded/client-derived value), for a challenge whose `resendAvailableAt` is still in
  // the future.
  it('renders the server-provided attempts/expiry hint even while resendAvailableAt is still in the future (no client-side override)', async () => {
    const expiresAt = '2026-12-31T23:59:00.000Z';
    const future = new Date(Date.now() + 60_000).toISOString();
    verifyVoucherMock.mockResolvedValue(
      verifyResponse('VALID', 'OTP_REQUESTED', {
        otpChallenge: { requestedAt: new Date().toISOString(), expiresAt, attempts: 2, maxAttempts: 5, resendAvailableAt: future },
      }),
    );
    renderAt();
    await waitForSummaryTitle();

    expect(screen.getByText(`Expires at ${new Date(expiresAt).toLocaleString()} · 2/5 attempts used`)).toBeTruthy();
  });
});

/**
 * Feature: "resume after refresh" — re-fetching with the SAME server response renders the SAME
 * step, never a different one derived from leftover component state.
 */
describe('VoucherVerificationPage — resumable: refresh re-fetches and lands on the same step', () => {
  it('clicking "Refresh Status" re-calls verifyVoucher and the same step/content persists', async () => {
    verifyVoucherMock.mockResolvedValue(verifyResponse('VALID', 'STARTED'));
    renderAt();
    await waitForSummaryTitle();
    expect(hasButton('Send Completion OTP')).toBe(true);

    clickButton('Refresh Status');

    await waitFor(() => expect(verifyVoucherMock).toHaveBeenCalledTimes(2), LONG);
    expect(verifyVoucherMock).toHaveBeenNthCalledWith(2, 'tok', CODE);
    // Still the exact same step — nothing drifted from a stale local step.
    expect(hasButton('Send Completion OTP')).toBe(true);
    expect(hasButton('Start Service')).toBe(false);
  });
});

/**
 * Feature: no plaintext OTP ever appears — the DOM never shows it, and the only OTP value sent
 * in any mutating API call is exactly what the member typed themselves.
 */
describe('VoucherVerificationPage — never exposes a plaintext OTP', () => {
  // NOTE: the "submits exactly the value the member typed" half of this feature is NOT asserted
  // here. While writing this file, `setFieldValue` (set the DOM property, then
  // `fireEvent.input`) on a `@lit/react`-wrapped `md-outlined-text-field` was found to NOT
  // reliably propagate to the component's React state in this test environment — confirmed
  // independently of this page by reproducing the exact same failure, in isolation (not just
  // under full-suite load), on the pre-existing `orders-and-verify.test.tsx`'s own
  // "entering a code and clicking Verify calls verifyVoucher with it" test, which this repo's
  // own comments currently attribute to "jsdom full-suite-load timeout flakiness." That
  // existing characterization appears incomplete — worth a follow-up look at the
  // `@lit/react`/React 19 event-binding path under Vitest. Reported in the final QA report
  // rather than worked around with a non-deterministic retry loop.
  it('the OTP input starts empty (never pre-filled from the server response)', async () => {
    verifyVoucherMock.mockResolvedValue(
      verifyResponse('VALID', 'OTP_REQUESTED', {
        otpChallenge: {
          requestedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
          attempts: 0,
          maxAttempts: 5,
          resendAvailableAt: new Date(Date.now() - 1000).toISOString(),
        },
      }),
    );
    renderAt();
    await waitForSummaryTitle();

    // Only one text field on this step — the OTP field — and it starts blank.
    const otpField = textFields()[0] as unknown as { value?: string };
    expect(otpField.value ?? '').toBe('');
    // Nothing resembling a server-issued secret ever appeared in the rendered page.
    expect(document.body.textContent).not.toMatch(/hashedOtp|hashed-otp/i);
  });

  it('requestCompletionOtp (Resend) is called with no OTP value at all — the server mints/sends it, never the client', async () => {
    verifyVoucherMock.mockResolvedValue(
      verifyResponse('VALID', 'OTP_REQUESTED', {
        otpChallenge: {
          requestedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
          attempts: 0,
          maxAttempts: 5,
          resendAvailableAt: new Date(Date.now() - 1000).toISOString(),
        },
      }),
    );
    requestCompletionOtpMock.mockResolvedValue({ data: { requested: true } });
    renderAt();
    await waitForSummaryTitle();

    clickButton('Resend OTP');

    await waitFor(() => expect(requestCompletionOtpMock).toHaveBeenCalledWith('tok', CODE), LONG);
    expect(requestCompletionOtpMock).not.toHaveBeenCalledWith('tok', CODE, expect.anything());
  });
});

/**
 * Feature: masked destination display
 * Scenario: the OTP step shows the masked phone/email the OTP was sent to — never a plaintext
 * phone/email, falling back to email when phone is unavailable.
 */
describe('VoucherVerificationPage — masked destination display', () => {
  it('shows the masked phone when present', async () => {
    verifyVoucherMock.mockResolvedValue(
      verifyResponse('VALID', 'OTP_REQUESTED', {
        customerPhoneMasked: '••••3210',
        customerEmailMasked: null,
        otpChallenge: { requestedAt: new Date().toISOString(), expiresAt: new Date().toISOString(), attempts: 0, maxAttempts: 5, resendAvailableAt: new Date().toISOString() },
      }),
    );
    renderAt();
    await waitForSummaryTitle();
    expect(screen.getByText(/Sent to ••••3210/)).toBeTruthy();
  });

  it('falls back to the masked email when phone is unavailable', async () => {
    verifyVoucherMock.mockResolvedValue(
      verifyResponse('VALID', 'OTP_REQUESTED', {
        customerPhoneMasked: null,
        customerEmailMasked: '••••.com',
        otpChallenge: { requestedAt: new Date().toISOString(), expiresAt: new Date().toISOString(), attempts: 0, maxAttempts: 5, resendAvailableAt: new Date().toISOString() },
      }),
    );
    renderAt();
    await waitForSummaryTitle();
    expect(screen.getByText(/Sent to ••••\.com/)).toBeTruthy();
  });
});

describe('VoucherVerificationPage — load/error states', () => {
  it('shows an error state (never a crash) when verifyVoucher fails', async () => {
    verifyVoucherMock.mockRejectedValue(new Error('network down'));
    renderAt();
    expect(await screen.findByRole('alert', {}, LONG)).toBeTruthy();
  });

  it('"Back to Verification" navigates to the Verify & Complete tab', async () => {
    verifyVoucherMock.mockResolvedValue(verifyResponse('VALID', 'ACTIVE'));
    renderAt();
    await waitForSummaryTitle();
    clickButton('Back to Verification');
    expect(navigateMock).toHaveBeenCalledWith('/account/vendor-orders?tab=verify');
  });
});
