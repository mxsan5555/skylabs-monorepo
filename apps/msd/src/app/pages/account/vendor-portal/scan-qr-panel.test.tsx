import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScanQrPanel } from './scan-qr-panel';
import { ApiRequestError } from '../../../../api/rbac/client';

/**
 * Feature: vendor "Scan QR" page — camera-only, scan-only (no manual code entry anywhere)
 * Scenario: a decode runs the real server-side check (`verifyVoucher`) before navigating
 * anywhere; only `VALID` navigates, everything else (including a 404 for a code that isn't a
 * voucher at all) shows its plain-language message inline and keeps scanning; a camera that's
 * unavailable or denied shows "Allow camera access…" with a working "Try again"; the
 * `MediaStream` is stopped on unmount.
 */

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => ({ token: 'tok' }) }));

const jsQRMock = vi.fn();
vi.mock('jsqr', () => ({ default: (...args: unknown[]) => jsQRMock(...args) }));

const verifyVoucherMock = vi.fn();
vi.mock('../../../../api/rbac/vouchers', () => ({ verifyVoucher: (...args: unknown[]) => verifyVoucherMock(...args) }));

function renderPanel() {
  return render(
    <MemoryRouter>
      <ScanQrPanel />
    </MemoryRouter>,
  );
}

const stopMock = vi.fn();
function fakeStream() {
  return { getTracks: () => [{ stop: stopMock }] } as unknown as MediaStream;
}

function armDecodableCamera(decodedData: string | null) {
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const getUserMedia = vi.fn().mockResolvedValue(fakeStream());
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })),
  } as unknown as CanvasRenderingContext2D);
  jsQRMock.mockReturnValue(decodedData ? { data: decodedData } : null);
}

// `md-outlined-button` is a raw custom element — jsdom/testing-library's role mapping can't see
// through its shadow DOM, so `getByRole('button', ...)` never finds it (same gap this codebase's
// other `md-*`-driving tests already document); query/drive it directly instead.
function tryAgainButton(): HTMLElement {
  return Array.from(document.querySelectorAll('md-outlined-button')).find((el) => el.textContent?.includes('Try again')) as HTMLElement;
}

function primeVideoReady() {
  const video = document.querySelector('video') as HTMLVideoElement;
  Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
  Object.defineProperty(video, 'videoWidth', { value: 1, configurable: true });
  Object.defineProperty(video, 'videoHeight', { value: 1, configurable: true });
  return video;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // @ts-expect-error -- test-only cleanup of a property defined per-test
  delete (navigator as unknown as Record<string, unknown>).mediaDevices;
});

describe('ScanQrPanel — camera unavailable/denied', () => {
  it('shows "Allow camera access to scan QR codes" + a Try again button when getUserMedia does not exist', async () => {
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent('Allow camera access to scan QR codes');
    expect(tryAgainButton()).toBeTruthy();
  });

  it('shows the same message when getUserMedia rejects (permission denied)', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockRejectedValue(new Error('denied')) } });
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent('Allow camera access to scan QR codes');
  });

  it('"Try again" re-attempts the camera', async () => {
    const getUserMedia = vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce(fakeStream());
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    renderPanel();
    await screen.findByRole('alert');

    fireEvent.click(tryAgainButton());

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
  });
});

describe('ScanQrPanel — camera lifecycle', () => {
  it('stops every MediaStream track on unmount', async () => {
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream());
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    const { unmount } = renderPanel();

    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    unmount();
    expect(stopMock).toHaveBeenCalled();
  });
});

describe('ScanQrPanel — scan then check', () => {
  it('a VALID check navigates to the verify page for the decoded voucher code', async () => {
    armDecodableCamera('MSD-DL-SCAN123');
    verifyVoucherMock.mockResolvedValue({ data: { result: 'VALID', entitlement: { voucherCode: 'MSD-DL-SCAN123' } } });

    renderPanel();
    primeVideoReady();

    await waitFor(() => expect(verifyVoucherMock).toHaveBeenCalledWith('tok', 'MSD-DL-SCAN123'));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/account/vendor-orders/verify/MSD-DL-SCAN123'));
  });

  it('shows "Checking…" while the verify call is in flight', async () => {
    armDecodableCamera('MSD-DL-SCAN123');
    let resolve!: (v: unknown) => void;
    verifyVoucherMock.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    renderPanel();
    primeVideoReady();

    expect(await screen.findByText('Checking…')).toBeTruthy();
    resolve({ data: { result: 'VALID', entitlement: { voucherCode: 'MSD-DL-SCAN123' } } });
    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
  });

  it('a non-VALID result shows its plain-language message and never navigates', async () => {
    armDecodableCamera('MSD-DL-USED');
    verifyVoucherMock.mockResolvedValue({
      data: { result: 'ALREADY_USED', entitlement: { completedAt: '2026-11-10T12:00:00.000Z', qrExpiresAt: null } },
    });

    renderPanel();
    primeVideoReady();

    expect(await screen.findByRole('alert')).toHaveTextContent('Already used on 10 November 2026');
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("a 404 (not a voucher at all) shows \"This QR isn't a My Spa Deal voucher\"", async () => {
    armDecodableCamera('not-a-voucher');
    verifyVoucherMock.mockRejectedValue(new ApiRequestError('NOT_FOUND', 'Voucher not found', 404));

    renderPanel();
    primeVideoReady();

    expect(await screen.findByRole('alert')).toHaveTextContent("This QR isn't a My Spa Deal voucher");
  });

  it('checks exactly once per decode — a repeated decode while a check is in flight is ignored', async () => {
    armDecodableCamera('MSD-DL-SCAN123');
    let resolve!: (v: unknown) => void;
    verifyVoucherMock.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    renderPanel();
    primeVideoReady();

    await screen.findByText('Checking…');
    resolve({ data: { result: 'VALID', entitlement: { voucherCode: 'MSD-DL-SCAN123' } } });
    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
    expect(verifyVoucherMock).toHaveBeenCalledTimes(1);
  });
});
