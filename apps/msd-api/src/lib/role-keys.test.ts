import { describe, it, expect } from 'vitest';
import { ROLE_KEYS, MEMBER_ROLE_KEYS } from './role-keys';

describe('role keys', () => {
  it('names the seven system roles', () => {
    expect(Object.values(ROLE_KEYS).sort()).toEqual(
      ['admin', 'customer', 'marketing', 'member', 'sales', 'super_admin', 'support'].sort(),
    );
  });

  it('treats the pre-rename key `vendor` as a member while old tokens are still alive', () => {
    expect(MEMBER_ROLE_KEYS).toContain('member');
    expect(MEMBER_ROLE_KEYS).toContain('vendor');
  });
});
