import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';

/**
 * Super Admin protection (docs/msd/PLANNING.md §1.3 rules 3 and 5, §1.4). Permissions decide who
 * may manage users and roles at all; these checks stop any of those permissions from being used
 * to reach Super Admin. Checked through `Role.isSuperAdmin`, never a role-key string.
 */
export async function isSuperAdminUser(userId: string): Promise<boolean> {
  return Boolean(await prisma.userRole.count({ where: { userId, role: { isSuperAdmin: true } } }));
}

/** Only a Super Admin edits, blocks, deletes or re-roles a Super Admin account. */
export async function assertCanManageUser(callerId: string, targetId: string): Promise<void> {
  if ((await isSuperAdminUser(targetId)) && !(await isSuperAdminUser(callerId))) {
    throw new ApiError('FORBIDDEN', 'Only a Super Admin can manage a Super Admin account');
  }
}

/** Only a Super Admin gives or removes the Super Admin role. Returns whether `roleId` is it. */
export async function assertCanAssignRole(callerId: string, roleId: string): Promise<boolean> {
  const superRole = await prisma.role.findFirst({ where: { id: roleId, isSuperAdmin: true }, select: { id: true } });
  if (superRole && !(await isSuperAdminUser(callerId))) {
    throw new ApiError('FORBIDDEN', 'Only a Super Admin can give or remove the Super Admin role');
  }
  return Boolean(superRole);
}

/** The last active Super Admin cannot lose the role, be blocked or be deleted. */
export async function assertNotLastSuperAdmin(targetId: string): Promise<void> {
  if (!(await isSuperAdminUser(targetId))) return;
  const others = await prisma.user.count({
    where: { id: { not: targetId }, deletedAt: null, status: 'active', roles: { some: { role: { isSuperAdmin: true } } } },
  });
  if (!others) {
    throw new ApiError('CONFLICT', 'The last active Super Admin cannot be removed, blocked or deleted');
  }
}

/** Role edits: never the Super Admin role, and never a role the caller holds, unless the caller
 *  is a Super Admin (otherwise `rbac.roles:edit` would let a role grant itself anything). */
export async function assertCanEditRole(callerId: string, roleId: string): Promise<void> {
  if (await isSuperAdminUser(callerId)) return;
  const superRole = await prisma.role.findFirst({ where: { id: roleId, isSuperAdmin: true }, select: { id: true } });
  if (superRole) throw new ApiError('FORBIDDEN', 'Only a Super Admin can change the Super Admin role');
  if (await prisma.userRole.count({ where: { userId: callerId, roleId } })) {
    throw new ApiError('FORBIDDEN', 'You cannot change a role you hold');
  }
}
