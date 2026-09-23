import { describe, it, expect } from 'vitest';
import { countLabel } from './shell-labels';

describe('countLabel', () => {
  it('returns the bare label at zero', () => expect(countLabel('Cart', 0)).toBe('Cart'));
  it('uses the singular form at one', () => expect(countLabel('Cart', 1)).toBe('Cart, 1 item'));
  it('uses the plural form above one', () => expect(countLabel('Wishlist', 3)).toBe('Wishlist, 3 items'));
});
