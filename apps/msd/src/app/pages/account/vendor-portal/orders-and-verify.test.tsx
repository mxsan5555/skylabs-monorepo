import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SnackbarHost } from '../../../../snackbar/snackbar';
import { OrdersAndVerify } from './orders-and-verify';

const useAuthMock = vi.fn();
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => useAuthMock() }));

// The order list is its own already-tested component — this page only adds the Verify panel.
vi.mock('../orders/orders', () => ({ OrderManagement: () => <p>order-list</p> }));

const verifyVoucherMock = vi.fn();
const startServiceMock = vi.fn();
const requestCompletionOtpMock = vi.fn();
const completeVoucherMock = vi.fn();
const shipVoucherMock = vi.fn();
vi.mock('../../../../api/rbac/vouchers', () => ({
  verifyVoucher: (...args: unknown[]) => verifyVoucherMock(...args),
  startService: (...args: unknown[]) => startServiceMock(...args),
  requestCompletionOtp: (...args: unknown[]) => requestCompletionOtpMock(...args),
  completeVoucher: (...args: unknown[]) => completeVoucherMock(...args),
  shipVoucher: (...args: unknown[]) => shipVoucherMock(...args),
  recordDeliveryEvidence: vi.fn(),
}));

// Full-suite runs under worker-pool load can push jsdom async resolution past testing-library's
// default 1000ms waitFor/findBy timeout even though every assertion here is otherwise correct
// (verified: every test in this file passes reliably in isolation) — the same class of flake the
// pre-existing `deals-list-page.test.tsx`/`products-list-page.test.tsx` toggle-status tests show
// under full-suite load. Widen the timeout rather than chase a race that isn't actually here.
const LONG = { timeout: 5000 };

function renderPage() {
  return render(
    <>
      <OrdersAndVerify />
      <SnackbarHost />
    </>,
  );
}

// `label`/`disabled` aren't reliably reflected as real DOM attributes for `@lit/react`-wrapped
// Material text fields/buttons under jsdom (same documented gap as settings.test.tsx) — fields
// are driven by render position, and "disabled" is verified behaviorally (clicking it must not
// call the mock) rather than via a DOM attribute assertion.
function textFields(): HTMLElement[] {
  return Array.from(document.querySelectorAll('md-outlined-text-field'));
}

function clickButton(label: string) {
  const btn = Array.from(document.querySelectorAll('md-filled-button, md-text-button')).find((el) => el.textContent?.includes(label));
  if (!btn) throw new Error(`button "${label}" not found`);
  fireEvent.click(btn);
}

function hasButton(label: string): boolean {
  return Array.from(document.querySelectorAll('md-filled-button, md-text-button')).some((el) => el.textContent?.includes(label));
}

// `fireEvent.input(el, { target: { value } })` uses testing-library's `setNativeValue`, which
// requires a real `value` property descriptor on the element's prototype — these custom
// elements have none in jsdom (unupgraded), so it throws "does not have a value setter".
// Assign the property directly, then dispatch a bare native `input` event instead.
function setFieldValue(el: HTMLElement, value: string) {
  (el as unknown as { value: string }).value = value;
  fireEvent.input(el);
}

function enterVoucherCode(code: string) {
  setFieldValue(textFields()[0], code);
}

async function findResultTitle(text: string) {
  return screen.findByText(text, {}, LONG);
}

function serviceEntitlement(status: string) {
  return {
    result: 'VALID',
    entitlement: {
      voucherCode: 'MSD-DL-ABC123',
      itemName: 'Deep Tissue Massage',
      fulfilmentKind: 'SERVICE_SESSION',
      entitlementStatus: status,
      customerName: 'Jane Doe',
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  useAuthMock.mockReturnValue({ token: 'tok' });
});

describe('OrdersAndVerify — Verify Purchase panel state transitions', () => {
  it('Verify does nothing with an empty code — never calls the service', () => {
    renderPage();
    clickButton('Verify');
    expect(verifyVoucherMock).not.toHaveBeenCalled();
  });

  it('entering a code and clicking Verify calls verifyVoucher with it', async () => {
    verifyVoucherMock.mockResolvedValue({ data: serviceEntitlement('ACTIVE') });
    renderPage();
    enterVoucherCode('MSD-DL-ABC123');
    clickButton('Verify');
    await waitFor(() => expect(verifyVoucherMock).toHaveBeenCalledWith('tok', 'MSD-DL-ABC123'), LONG);
  });

  it('a fresh ACTIVE service voucher shows only Start Service', async () => {
    verifyVoucherMock.mockResolvedValue({ data: serviceEntitlement('ACTIVE') });
    renderPage();
    enterVoucherCode('MSD-DL-ABC123');
    clickButton('Verify');

    expect(await findResultTitle('Valid — ready to fulfil')).toBeTruthy();
    expect(hasButton('Start Service')).toBe(true);
    expect(hasButton('Request Completion OTP')).toBe(false);
  });

  it('Start Service flips to STARTED and reveals Request Completion OTP', async () => {
    verifyVoucherMock.mockResolvedValue({ data: serviceEntitlement('ACTIVE') });
    startServiceMock.mockResolvedValue({ data: { entitlementStatus: 'STARTED', fulfilmentKind: 'SERVICE_SESSION' } });
    renderPage();
    enterVoucherCode('MSD-DL-ABC123');
    clickButton('Verify');
    await findResultTitle('Valid — ready to fulfil');
    clickButton('Start Service');

    await waitFor(() => expect(hasButton('Request Completion OTP')).toBe(true), LONG);
    expect(hasButton('Start Service')).toBe(false);
  });

  it('Request Completion OTP moves to the Enter OTP panel with its own text field', async () => {
    verifyVoucherMock.mockResolvedValue({ data: serviceEntitlement('STARTED') });
    requestCompletionOtpMock.mockResolvedValue({ data: { requested: true } });
    renderPage();
    enterVoucherCode('MSD-DL-ABC123');
    clickButton('Verify');
    await findResultTitle('Valid — ready to fulfil');
    clickButton('Request Completion OTP');

    await waitFor(() => expect(textFields().length).toBe(2), LONG); // voucher code + OTP field
    expect(screen.getByText('Enter the OTP the customer shares with you')).toBeTruthy();
  });

  it('Complete does nothing until a 6-digit OTP is entered, then submits it', async () => {
    verifyVoucherMock.mockResolvedValue({ data: serviceEntitlement('OTP_REQUESTED') });
    completeVoucherMock.mockResolvedValue({ data: { entitlementStatus: 'COMPLETED', fulfilmentKind: 'SERVICE_SESSION' } });
    renderPage();
    enterVoucherCode('MSD-DL-ABC123');
    clickButton('Verify');
    await waitFor(() => expect(textFields().length).toBe(2), LONG);

    clickButton('Complete');
    expect(completeVoucherMock).not.toHaveBeenCalled();

    setFieldValue(textFields()[1], '123'); // too short
    clickButton('Complete');
    expect(completeVoucherMock).not.toHaveBeenCalled();

    setFieldValue(textFields()[1], '123456');
    clickButton('Complete');
    await waitFor(() => expect(completeVoucherMock).toHaveBeenCalledWith('tok', 'MSD-DL-ABC123', '123456'), LONG);
  });

  it('after Complete resolves COMPLETED, no action buttons remain — a terminal state', async () => {
    verifyVoucherMock.mockResolvedValue({ data: serviceEntitlement('OTP_REQUESTED') });
    completeVoucherMock.mockResolvedValue({ data: { entitlementStatus: 'COMPLETED', fulfilmentKind: 'SERVICE_SESSION' } });
    renderPage();
    enterVoucherCode('MSD-DL-ABC123');
    clickButton('Verify');
    await waitFor(() => expect(textFields().length).toBe(2), LONG);
    setFieldValue(textFields()[1], '123456');
    clickButton('Complete');

    await waitFor(() => expect(completeVoucherMock).toHaveBeenCalled(), LONG);
    await waitFor(() => {
      expect(hasButton('Complete')).toBe(false);
      expect(hasButton('Start Service')).toBe(false);
      expect(hasButton('Request Completion OTP')).toBe(false);
    }, LONG);
  });

  it('shows an error state and never calls the mutating action when verify fails', async () => {
    verifyVoucherMock.mockRejectedValue(new Error('network down'));
    renderPage();
    enterVoucherCode('MSD-DL-BAD');
    clickButton('Verify');

    expect(await screen.findByRole('alert', {}, LONG)).toBeTruthy();
    expect(startServiceMock).not.toHaveBeenCalled();
  });

  it('a non-VALID result (e.g. WRONG_MEMBER_BRANCH) shows the result card with no action buttons', async () => {
    verifyVoucherMock.mockResolvedValue({
      data: {
        result: 'WRONG_MEMBER_BRANCH',
        entitlement: {
          voucherCode: 'MSD-DL-ABC123',
          itemName: 'Deep Tissue Massage',
          fulfilmentKind: 'SERVICE_SESSION',
          entitlementStatus: 'ACTIVE',
          customerName: 'Jane Doe',
        },
      },
    });
    renderPage();
    enterVoucherCode('MSD-DL-ABC123');
    clickButton('Verify');

    expect(await findResultTitle('Not for this business')).toBeTruthy();
    expect(hasButton('Start Service')).toBe(false);
  });
});

describe('OrdersAndVerify — empty states', () => {
  it('shows empty-state copy for redemption history with nothing verified yet', () => {
    renderPage();
    expect(screen.getByText('Nothing verified yet on this device.')).toBeTruthy();
  });

  it('still renders the existing order list below the panel', () => {
    renderPage();
    expect(screen.getByText('order-list')).toBeTruthy();
  });
});
