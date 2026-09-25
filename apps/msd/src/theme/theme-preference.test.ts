import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { initThemePreference, readThemePreference, setThemePreference } from './theme-preference';

const media = (active: string[]) =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: active.includes(query),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
  media([]);
});
afterEach(() => vi.unstubAllGlobals());

describe('theme preference', () => {
  it('defaults to light', () => {
    expect(readThemePreference()).toBe('light');
    initThemePreference();
    expect(document.documentElement.className).toBe('light');
  });

  it('persists and applies dark', () => {
    setThemePreference('dark');
    expect(localStorage.getItem('msd.theme')).toBe('dark');
    expect(document.documentElement.className).toBe('dark');
  });

  it('system follows the OS', () => {
    media(['(prefers-color-scheme: dark)']);
    setThemePreference('system');
    expect(document.documentElement.className).toBe('dark');
  });

  it('explicit modes still honour OS high contrast (AAA)', () => {
    media(['(prefers-contrast: more)']);
    setThemePreference('light');
    expect(document.documentElement.className).toBe('light-high-contrast');
  });

  it('explicit modes follow live OS contrast changes, and stop after switching away', () => {
    const active = new Set<string>();
    const listeners = new Map<string, Set<() => void>>();
    vi.stubGlobal('matchMedia', (query: string) => ({
      get matches() {
        return active.has(query);
      },
      addEventListener: (_: string, fn: () => void) => {
        if (!listeners.has(query)) listeners.set(query, new Set());
        listeners.get(query)?.add(fn);
      },
      removeEventListener: (_: string, fn: () => void) => listeners.get(query)?.delete(fn),
    }));
    const flip = (query: string, on: boolean) => {
      if (on) active.add(query);
      else active.delete(query);
      listeners.get(query)?.forEach((fn) => fn());
    };

    setThemePreference('dark');
    expect(document.documentElement.className).toBe('dark');
    flip('(prefers-contrast: more)', true);
    expect(document.documentElement.className).toBe('dark-high-contrast');
    flip('(prefers-contrast: more)', false);
    expect(document.documentElement.className).toBe('dark');

    setThemePreference('light');
    expect(listeners.get('(prefers-contrast: more)')?.size).toBe(1);
    flip('(prefers-contrast: more)', true);
    expect(document.documentElement.className).toBe('light-high-contrast');
  });

  it('ignores junk in storage', () => {
    localStorage.setItem('msd.theme', 'purple');
    expect(readThemePreference()).toBe('light');
  });
});
