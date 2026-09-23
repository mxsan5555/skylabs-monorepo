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
});
