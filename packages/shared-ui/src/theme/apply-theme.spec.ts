import { describe, it, expect } from 'vitest';
import { themeClassName } from './apply-theme.js';

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
