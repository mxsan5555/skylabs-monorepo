import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { useMediaQuery } from './use-media-query';

let listeners: (() => void)[] = [];
let matches = false;

function stubMedia() {
  listeners = [];
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return matches;
    },
    addEventListener: (_: string, l: () => void) => listeners.push(l),
    removeEventListener: vi.fn(),
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe('useMediaQuery', () => {
  it('reads the current match and updates on change', () => {
    matches = false;
    stubMedia();
    const { result } = renderHook(() => useMediaQuery('(min-width: 840px)'));
    expect(result.current).toBe(false);
    matches = true;
    act(() => listeners.forEach((l) => l()));
    expect(result.current).toBe(true);
  });

  it('removes the listener on unmount', () => {
    const removeEventListener = vi.fn();
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener,
    }));
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 840px)'));
    unmount();
    expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('re-subscribes when the query changes', () => {
    const queriesSeen: string[] = [];
    const removeEventListener = vi.fn();
    vi.stubGlobal('matchMedia', (query: string) => {
      queriesSeen.push(query);
      return {
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener,
      };
    });
    const { rerender } = renderHook(({ query }) => useMediaQuery(query), {
      initialProps: { query: '(min-width: 840px)' },
    });
    expect(queriesSeen).toContain('(min-width: 840px)');
    removeEventListener.mockClear();

    rerender({ query: '(min-width: 600px)' });

    expect(queriesSeen).toContain('(min-width: 600px)');
    expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
