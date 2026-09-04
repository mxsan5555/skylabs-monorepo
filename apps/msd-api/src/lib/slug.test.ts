import { describe, it, expect } from 'vitest';
import { slugify, ensureUniqueSlug } from './slug';

describe('slugify', () => {
  it('lowercases, replaces spaces with hyphens', () => {
    expect(slugify('Urban Wellness Spa')).toBe('urban-wellness-spa');
  });

  it('strips invalid characters and collapses runs into one hyphen', () => {
    expect(slugify('Glow & Beauty!! Studio')).toBe('glow-beauty-studio');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('  --Spa Name--  ')).toBe('spa-name');
  });

  it('falls back to "vendor" for an input with no alphanumeric characters', () => {
    expect(slugify('!!!')).toBe('vendor');
  });
});

describe('ensureUniqueSlug', () => {
  it('returns the plain slug when it does not already exist', async () => {
    const slug = await ensureUniqueSlug('Urban Wellness Spa', 'abc123def456', async () => false);
    expect(slug).toBe('urban-wellness-spa');
  });

  it('appends a short id-derived suffix when the plain slug collides', async () => {
    const calls: string[] = [];
    const slug = await ensureUniqueSlug('Urban Wellness Spa', 'abc123def456', async (candidate) => {
      calls.push(candidate);
      return candidate === 'urban-wellness-spa';
    });
    expect(slug).toBe('urban-wellness-spa-abc123');
    expect(calls).toEqual(['urban-wellness-spa', 'urban-wellness-spa-abc123']);
  });

  it('falls back to the raw id when both the plain slug and the suffixed slug collide', async () => {
    const slug = await ensureUniqueSlug('Urban Wellness Spa', 'abc123def456', async () => true);
    expect(slug).toBe('abc123def456');
  });
});
