import { describe, it, expect } from 'vitest';
import { ROLES, MEMBER_GRANTS } from './seed';

describe('seed: roles', () => {
  it('has the seven system roles', () => {
    expect(ROLES.map((r) => r.key).sort()).toEqual(
      ['admin', 'customer', 'marketing', 'member', 'sales', 'super_admin', 'support'].sort(),
    );
  });
});

describe('seed: members grants (matches the role matrix)', () => {
  it('Admin: view, create, edit, status_change, approve, reject, never delete', () => {
    expect(MEMBER_GRANTS.admin).toEqual(
      expect.arrayContaining(['members:view', 'members:create', 'members:edit', 'members:status_change', 'members:approve', 'members:reject']),
    );
    expect(MEMBER_GRANTS.admin).not.toContain('members:delete');
  });

  it('Sales: view, create, edit only', () => {
    expect([...MEMBER_GRANTS.sales].sort()).toEqual(['members:create', 'members:edit', 'members:view']);
  });

  it('Marketing and Support: view only', () => {
    expect(MEMBER_GRANTS.marketing).toEqual(['members:view']);
    expect(MEMBER_GRANTS.support).toEqual(['members:view']);
  });

  it('Member keeps custom, never view (own scope is not enforced yet)', () => {
    expect(MEMBER_GRANTS.member).toEqual(['members:custom']);
  });
});
