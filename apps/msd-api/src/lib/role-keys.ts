/** The seven fixed system roles. One definition, so no service compares a role-key literal. */
export const ROLE_KEYS = {
  superAdmin: 'super_admin',
  admin: 'admin',
  marketing: 'marketing',
  sales: 'sales',
  member: 'member',
  support: 'support',
  customer: 'customer',
} as const;

/**
 * Role keys that mean "this user owns a member business". `vendor` is the pre-rename key:
 * access tokens issued before the rename migration still carry it for up to one token TTL.
 */
export const MEMBER_ROLE_KEYS: readonly string[] = [ROLE_KEYS.member, 'vendor'];
