import type { PrismaClient } from '../src/generated/prisma-client';
import type { PermissionAction } from '@skylabs-monorepo/shared-types';

/** Existing roles, including intentionally empty roles, are never defaulted again. */
export async function seedNewRolePermissions(
  client: Pick<PrismaClient, 'permission' | 'rolePermission'>,
  createdRoles: ReadonlyMap<string, {id: string}>,
  defaults: Record<string, {menuKey: string; actions: PermissionAction[]}[]>,
): Promise<void> {
  for (const [key, grants] of Object.entries(defaults)) {
    const role = createdRoles.get(key);
    if (!role) continue;
    const permissions = await client.permission.findMany({where:{OR:grants.map(grant=>({menuKey:grant.menuKey,action:{in:grant.actions}}))}});
    await client.rolePermission.createMany({data:permissions.map(permission=>({roleId:role.id,permissionId:permission.id})),skipDuplicates:true});
  }
}
