import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { SCROLL_HYSTERESIS_PX, useHideOnScroll } from './use-hide-on-scroll';

function scrollTo(y: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: y });
  act(() => {
    window.dispatchEvent(new Event('scroll'));
  });
}

beforeEach(() => {
  Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 0 });
  // Run frames synchronously; returning 0 marks "no frame pending" once the callback is done.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => vi.unstubAllGlobals());

describe('useHideOnScroll', () => {
  it('uses an 8px hysteresis by default', () => expect(SCROLL_HYSTERESIS_PX).toBe(8));

  it('hides after scrolling down past the threshold', () => {
    const { result } = renderHook(() => useHideOnScroll(64));
    scrollTo(40);
    expect(result.current).toBe(false);
    scrollTo(200);
    expect(result.current).toBe(true);
  });

  it('ignores small jitter in either direction', () => {
    const { result } = renderHook(() => useHideOnScroll(64));
    scrollTo(200);
    expect(result.current).toBe(true);
    scrollTo(195);
    scrollTo(199);
    scrollTo(193);
    expect(result.current).toBe(true);
  });

  it('shows again after scrolling up by at least the hysteresis', () => {
    const { result } = renderHook(() => useHideOnScroll(64));
    scrollTo(200);
    scrollTo(196);
    expect(result.current).toBe(true);
    scrollTo(200 - SCROLL_HYSTERESIS_PX);
    expect(result.current).toBe(false);
  });

  it('always shows near the top of the page', () => {
    const { result } = renderHook(() => useHideOnScroll(64));
    scrollTo(200);
    scrollTo(60);
    expect(result.current).toBe(false);
  });
});
