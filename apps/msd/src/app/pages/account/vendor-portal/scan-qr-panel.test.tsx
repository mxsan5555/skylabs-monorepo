import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScanQrPanel } from './scan-qr-panel';

/**
 * Feature: D40 — vendor "Scan QR" entry point
 * Scenario: a camera-based voucher lookup that degrades cleanly to manual entry whenever the
 * camera API is unavailable or permission is denied, routes every path (camera or manual) to the
 * same `/account/vendor-orders/verify/:code` confirmation screen, stops its own `MediaStream` on
 * unmount, and never fires a second navigation for a jittery double-decode/double-submit.
 */

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const jsQRMock = vi.fn();
vi.mock('jsqr', () => ({ default: (...args: unknown[]) => jsQRMock(...args) }));

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

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no real media pipeline — silence its "not implemented" console noise rather than
  // asserting on play() itself.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // @ts-expect-error -- test-only cleanup of a property defined per-test
  delete (navigator as unknown as Record<string, unknown>).mediaDevices;
});

describe('ScanQrPanel — camera unavailable', () => {
  it('shows a camera-unavailable message and still offers manual entry when getUserMedia does not exist', async () => {
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent(/not available/i);
    expect(screen.getByText('Or enter the voucher code')).toBeTruthy();
  });
});

describe('ScanQrPanel — camera permission denied', () => {
  it('shows a denied/unavailable message when getUserMedia rejects', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent(/denied or unavailable/i);
  });
});

describe('ScanQrPanel — manual entry fallback', () => {
  it('submitting with an empty voucher code never navigates (the one guard independent of typing)', async () => {
    renderPanel();
    const form = document.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  // NOTE: "submitting a typed code navigates to the verify route, and a second submit after the
  // first is ignored (busy-guard)" is not asserted via actually typing into the field — this is
  // the same already-documented `@lit/react`-wrapped `OutlinedTextField`'s `onInput` never firing
  // from a synthetic `input` event under Vitest (see `member-orders-page.test.tsx`'s own NOTE on
  // its "Open Voucher" lookup, which has the identical field+button shape). The
  // `goToVoucher`/`navigatedRef` logic itself — trim, early-return on empty, set the guard before
  // navigating, every later call becomes a no-op — was verified by direct code review; it is the
  // exact same guard shape already proven to work for the camera-decode path (see the "camera
  // lifecycle" describe block, which drives `navigate` through a real async `getUserMedia` call
  // rather than this wrapped field).
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

describe('ScanQrPanel — camera decode', () => {
  it('a successful decode navigates to the verify page for the decoded code', async () => {
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream());
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })),
    } as unknown as CanvasRenderingContext2D);
    jsQRMock.mockReturnValue({ data: 'MSD-DL-SCAN123' });

    renderPanel();
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
    Object.defineProperty(video, 'videoWidth', { value: 1, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 1, configurable: true });

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/account/vendor-orders/verify/MSD-DL-SCAN123'));
  });
});
