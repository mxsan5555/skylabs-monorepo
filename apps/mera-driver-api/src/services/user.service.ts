import { writeAuditLog, type WriteAuditLogInput } from './audit.service';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errorHandler';
import { revokeAllSessionsForUser } from './token.service';
import type { UserStatus } from '../generated/prisma-client';

async function isSuperAdminUser(userId: string): Promise<boolean> {
  const count = await prisma.userRole.count({
    where: { userId, role: { isSuperAdmin: true, isActive: true } },
  });
  return count > 0;
}

/**
 * Blocks an action that would leave zero active Super Admins — the one hard safeguard
 * against self-lockout. Only meaningful for a user who currently holds an
 * `isSuperAdmin`-flagged role; a no-op for everyone else.
 */
async function assertActionWontRemoveLastSuperAdmin(userId: string): Promise<void> {
  if (!(await isSuperAdminUser(userId))) return;

  const otherActiveSuperAdmins = await prisma.user.count({
    where: {
      id: { not: userId },
      status: 'active',
      deletedAt: null,
      roles: { some: { role: { isSuperAdmin: true, isActive: true } } },
    },
  });

  if (otherActiveSuperAdmins === 0) {
    throw new HttpError(409, 'LAST_SUPER_ADMIN', 'This is the last active Super Admin — action blocked to prevent lockout.');
  }
}

export interface ListUsersOptions {
  page?: number;
  pageSize?: number;
  status?: UserStatus;
  search?: string;
  roleId?: string;
  sort?: string;
  direction?: 'asc' | 'desc';
}

export async function listUsers(options: ListUsersOptions = {}) {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 25));

  // Driver and Customer users each have their own dedicated lifecycle — created/linked
  // exclusively via Driver Management → Driver List → "Create Driver User" (see
  // `driver.service.ts`'s `createAndLinkDriverUser`) or the equivalent Customer linkage
  // (see `customer.service.ts`'s `createAndLinkCustomerUser`/`linkCustomerToUser`), never
  // via this admin User Management screen. Both flows auto-assign their respective role on
  // link (same guarantee this exclusion already relied on for `driver`), so role-key is a
  // reliable identifier — no fragile name/email matching, no hardcoded ids. Excluding
  // anyone holding either role keeps them out of the list AND any search over it, since
  // this WHERE clause is what every query (including search) is built on.
  const where = {
    deletedAt: null,
    ...(options.status ? { status: options.status } : {}),
    ...(options.search ? {AND:[{OR:['name','email','phone'].map(field => ({[field]:{contains:options.search,mode:'insensitive' as const}}))}]} : {}),
    ...(options.roleId ? { roles: { some: { roleId: options.roleId } } } : {}),
    OR: [{ roles: { some: { role: { key: { notIn: ['driver', 'customer'] } } } } }, { roles: { none: {} } }],
  };

  const [rows, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      include: { roles: { include: { role: true } }, permissionOverrides: { include: { permission: { select: { key: true } } } } },
      orderBy: { [options.sort && ['name','email','phone','status','createdAt'].includes(options.sort) ? options.sort : 'createdAt']: options.direction === 'asc' ? 'asc' : 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  const provenance = (await prisma.auditLog.findMany({where:{action:'user.create',targetType:'User',targetId:{in:rows.map(row => row.id)}},select:{targetId:true,actor:{select:{name:true}}},orderBy:{createdAt:'asc'}})) ?? [];
  const createdBy = new Map<string,string>();
  for (const entry of provenance) if (!createdBy.has(entry.targetId)) createdBy.set(entry.targetId,entry.actor.name);
  return { rows:rows.map(row => ({...row,createdBy:createdBy.get(row.id) ?? null})), total, page, pageSize };
}

export async function getUserById(id: string) {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    include: { roles: { include: { role: true } }, permissionOverrides: { include: { permission: { select: { key: true } } } } },
  });
  if (!user) throw new HttpError(404, 'NOT_FOUND', 'User not found');
  return user;
}

/**
 * Driver-role users are created exclusively via Driver Management → Driver List →
 * "Create Driver User" (`driverService.createAndLinkDriverUser`), never through this
 * general-purpose User Management path. Blocking it here — not just filtering the list —
 * closes the manual-assignment route too (`POST /users` with `roleIds`, and
 * `POST /users/:id/roles/:roleId`).
 */
async function assertNotDriverRole(roleId: string): Promise<void> {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (role?.key === 'customer') {
    throw new HttpError(400, 'CUSTOMER_ROLE_NOT_ASSIGNABLE_HERE', 'Customer accounts are created from Customer Management, not staff User Management');
  }
  if (role?.key === 'driver') {
    throw new HttpError(
      400,
      'DRIVER_ROLE_NOT_ASSIGNABLE_HERE',
      'Driver accounts are created from Driver Management → Driver List → "Create Driver User", not User Management',
    );
  }
}

/**
 * A staff user holds exactly one role — no per-user permission checklists, one selected
 * role per the User Management single-select dropdown. `roleIds` here is always the full
 * desired set (create, or `updateAdminUser`'s replace-all-roles semantics), never an
 * increment, so a plain length check is correct. An existing user already holding more
 * than one role (from before this guard existed) can still be reconciled down to one via
 * the same call — this only blocks a *new* multi-role assignment, not fixing an old one.
 */
function assertSingleStaffRoleIntent(roleIds: string[]): void {
  if (roleIds.length > 1) throw new HttpError(422, 'SINGLE_ROLE_ONLY', 'Select a single role — a staff user holds exactly one role at a time.');
}

export interface CreateUserInput {
  name: string;
  email?: string;
  phone?: string;
  roleIds?: string[];
  status?:UserStatus;
}

export async function createUser(input: CreateUserInput) {
  if (!input.email?.trim() && !input.phone?.trim()) throw new HttpError(422,'LOGIN_IDENTIFIER_REQUIRED','An email or phone login identifier is required');
  if (input.roleIds?.length) {
    assertSingleStaffRoleIntent(input.roleIds);
    await Promise.all(input.roleIds.map((roleId) => assertNotDriverRole(roleId)));
  }
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name: input.name, email: input.email, phone: input.phone,...(input.status?{status:input.status}:{}) },
    });
    if (input.roleIds?.length) {
      await tx.userRole.createMany({ data: input.roleIds.map((roleId) => ({ userId: user.id, roleId })) });
    }
    // Re-fetch via `tx`, not the outer `prisma` client — against a real Postgres connection,
    // a separate (non-transactional) client can't see this row until the transaction commits.
    const created = await tx.user.findFirst({
      where: { id: user.id, deletedAt: null },
      include: { roles: { include: { role: true } }, permissionOverrides: { include: { permission: { select: { key: true } } } } },
    });
    if (!created) throw new HttpError(404, 'NOT_FOUND', 'User not found');
    return created;
  });
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  phone?: string;
}

export async function updateUser(id: string, input: UpdateUserInput) {
  await getUserById(id);
  await prisma.user.update({ where: { id }, data: input });
  return getUserById(id);
}

/** Staff edit uses existing last-owner and portal-role guards. Role changes are explicit. */
export async function updateAdminUser(id: string, input: UpdateUserInput & {status?:UserStatus;roleIds?:string[]}, audit?: Pick<WriteAuditLogInput,'actorUserId'|'ip'|'userAgent'>) {
  const before=await getUserById(id);
  if(before.roles.length && before.roles.every(link=>['customer','driver'].includes(link.role.key))) throw new HttpError(422,'PORTAL_ACCOUNT','Manage this account through its dedicated portal management flow');
  const {roleIds,status,...profile}=input;
  if (status && status!=='active') await assertActionWontRemoveLastSuperAdmin(id);
  if (roleIds) {
    if(new Set(roleIds).size!==roleIds.length) throw new HttpError(422,'VALIDATION_ERROR','Duplicate roles are not allowed');
    assertSingleStaffRoleIntent(roleIds);
    await Promise.all(roleIds.map(assertNotDriverRole));
    const targetRoles=await prisma.role.findMany({where:{id:{in:roleIds}}});
    if(targetRoles.length!==roleIds.length) throw new HttpError(422,'VALIDATION_ERROR','One or more roles do not exist');
    const retained=new Set(before.roles.map(link=>link.role.id));
    if(targetRoles.some(role=>!role.isActive&&!retained.has(role.id))) throw new HttpError(422,'INACTIVE_ROLE','Only active roles can be newly assigned');
    if(before.roles.some(link=>link.role.isSuperAdmin)&&!targetRoles.some(role=>role.isSuperAdmin)) await assertActionWontRemoveLastSuperAdmin(id);
  }
  const updated = await prisma.$transaction(async tx=>{
    await tx.user.update({where:{id},data:{...profile,...(status?{status}:{})}});
    if(roleIds) {
      await tx.userRole.deleteMany({where:{userId:id,roleId:{notIn:roleIds},role:{key:{notIn:['driver','customer']}}}});
      if(roleIds.length) await tx.userRole.createMany({data:roleIds.map(roleId=>({userId:id,roleId})),skipDuplicates:true});
    }
    if (audit) await writeAuditLog({...audit,action:'user.update',targetType:'User',targetId:id,
      before:{name:before.name,email:before.email,phone:before.phone,status:before.status,roleIds:before.roles.map(link=>link.role.id)},
      after:{...profile,status:status??before.status,roleIds:roleIds??before.roles.map(link=>link.role.id)}},tx);
    const user = await tx.user.findFirst({where:{id,deletedAt:null},include:{roles:{include:{role:true}},permissionOverrides:{include:{permission:{select:{key:true}}}}}});
    if (!user) throw new HttpError(404,'NOT_FOUND','User not found');
    return user;
  });
  const {invalidatePermissionCache}=await import('./permission.service');invalidatePermissionCache();
  return updated;
}

/** Soft delete — never hard-delete user data. */
export async function softDeleteUser(id: string) {
  await getUserById(id);
  await assertActionWontRemoveLastSuperAdmin(id);
  await prisma.user.update({ where: { id }, data: { deletedAt: new Date(), status: 'blocked' } });
}

export async function setUserStatus(id: string, status: UserStatus) {
  await getUserById(id);
  if (status !== 'active') {
    await assertActionWontRemoveLastSuperAdmin(id);
  }
  await prisma.user.update({ where: { id }, data: { status } });
  return getUserById(id);
}

export async function assignRoleToUser(userId: string, roleId: string) {
  const user = await getUserById(userId);
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw new HttpError(404, 'NOT_FOUND', 'Role not found');
  await assertNotDriverRole(roleId);

  const alreadyHeld = user.roles.some((link) => link.role.id === roleId);
  const otherStaffRoles = user.roles.filter((link) => link.role.id !== roleId && !['driver', 'customer'].includes(link.role.key));
  if (!alreadyHeld && otherStaffRoles.length > 0) {
    throw new HttpError(422, 'SINGLE_ROLE_ONLY', 'This user already holds a role — switch roles via the User Management role dropdown instead of adding a second one.');
  }

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId } },
    create: { userId, roleId },
    update: {},
  });
  return getUserById(userId);
}

export async function removeRoleFromUser(userId: string, roleId: string) {
  await getUserById(userId);

  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (role?.isSuperAdmin) {
    const remainingSuperAdminRoles = await prisma.userRole.count({
      where: { userId, roleId: { not: roleId }, role: { isSuperAdmin: true, isActive: true } },
    });
    if (remainingSuperAdminRoles === 0) {
      await assertActionWontRemoveLastSuperAdmin(userId);
    }
  }

  await prisma.userRole.deleteMany({ where: { userId, roleId } });
  return getUserById(userId);
}

export async function revokeAllSessionsForUserId(userId: string) {
  await getUserById(userId);
  await revokeAllSessionsForUser(userId);
}

/** Invalidates any pending OTP challenges for the user's identifiers, forcing a fresh OTP on next login. */
export async function resetOtpForUser(userId: string) {
  const user = await getUserById(userId);
  const identifiers = [user.email, user.phone].filter((v): v is string => Boolean(v));
  if (identifiers.length === 0) return;
  await prisma.otpChallenge.updateMany({
    where: { identifier: { in: identifiers }, verifiedAt: null },
    data: { expiresAt: new Date() },
  });
}

export async function listLoginHistoryForUser(userId: string) {
  await getUserById(userId);
  return prisma.loginHistory.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 });
}

export async function listSessionsForUser(userId: string) {
  await getUserById(userId);
  return prisma.refreshSession.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 });
}
