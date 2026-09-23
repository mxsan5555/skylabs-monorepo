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

  it('ignores junk in storage', () => {
    localStorage.setItem('msd.theme', 'purple');
    expect(readThemePreference()).toBe('light');
  });
});
