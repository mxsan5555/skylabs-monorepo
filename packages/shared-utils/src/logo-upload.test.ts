import { describe, it, expect } from 'vitest';
import { LOGO_ACCEPT, LOGO_MAX_BYTES, LOGO_MAX_KB, LOGO_MIME_TYPES, isLogoTooLarge } from './logo-upload';

describe('vendor logo upload rules', () => {
  it('allows 300 KB, the limit msd-api enforces', () => {
    expect(LOGO_MAX_BYTES).toBe(300 * 1024);
    expect(LOGO_MAX_KB).toBe(300);
  });

  it('accepts JPEG, PNG and WEBP by extension and by type, never SVG', () => {
    expect(LOGO_ACCEPT.split(',')).toEqual(['.jpg', '.jpeg', '.png', '.webp', 'image/jpeg', 'image/png', 'image/webp']);
    expect(LOGO_MIME_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(LOGO_ACCEPT).not.toContain('svg');
  });

  it('flags only files over the limit', () => {
    expect(isLogoTooLarge({ size: LOGO_MAX_BYTES })).toBe(false);
    expect(isLogoTooLarge({ size: LOGO_MAX_BYTES + 1 })).toBe(true);
    expect(isLogoTooLarge({ size: 0 })).toBe(false);
  });
});
