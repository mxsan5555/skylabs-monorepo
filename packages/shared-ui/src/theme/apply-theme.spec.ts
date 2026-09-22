import { afterEach, describe, it, expect, vi } from 'vitest';
import { applySystemTheme, themeClassName } from './apply-theme.js';

describe('themeClassName', () => {
  it('returns the bare mode for standard contrast', () => {
    expect(themeClassName('light')).toBe('light');
    expect(themeClassName('dark', 'standard')).toBe('dark');
  });

  it('suffixes the contrast level', () => {
    expect(themeClassName('light', 'medium')).toBe('light-medium-contrast');
    expect(themeClassName('dark', 'high')).toBe('dark-high-contrast');
  });
});

describe('applySystemTheme', () => {
  const mockMedia = (active: string[]) =>
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: active.includes(query),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

  afterEach(() => vi.unstubAllGlobals());

  it('follows OS dark mode and high-contrast preference', () => {
    mockMedia(['(prefers-color-scheme: dark)', '(prefers-contrast: more)']);
    const el = document.createElement('div');
    applySystemTheme(undefined, el);
    expect(el.className).toBe('dark-high-contrast');
    expect(el.style.colorScheme).toBe('dark');
  });

  it('uses an explicit contrast over the OS preference', () => {
    mockMedia(['(prefers-contrast: more)']);
    const el = document.createElement('div');
    applySystemTheme('standard', el);
    expect(el.className).toBe('light');
  });
});
