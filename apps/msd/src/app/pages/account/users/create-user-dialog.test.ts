import { describe, it, expect } from 'vitest';
import { eligibleStaffRoles } from './create-user-dialog';
import type { Role } from '../../../../api/rbac/roles';

const role = (key: string): Role =>
  ({ id: key, key, name: key, description: '', isSystem: true, isSuperAdmin: false, isActive: true, createdAt: '', updatedAt: '' }) as Role;

describe('eligibleStaffRoles', () => {
  it('excludes the canonical `member` key', () => {
    const roles = [role('admin'), role('member'), role('sales')];
    expect(eligibleStaffRoles(roles).map((r) => r.key)).toEqual(['admin', 'sales']);
  });

  it('excludes the pre-rename `vendor` key too (transitional)', () => {
    const roles = [role('admin'), role('vendor')];
    expect(eligibleStaffRoles(roles).map((r) => r.key)).toEqual(['admin']);
  });

  it('keeps every other staff role', () => {
    const roles = [role('super_admin'), role('admin'), role('marketing'), role('sales'), role('support')];
    expect(eligibleStaffRoles(roles)).toHaveLength(5);
  });
});
