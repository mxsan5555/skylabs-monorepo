import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errorHandler';
import { revokeAllSessionsForUser } from './token.service';
import type { UserStatus } from '../generated/prisma-client';

export interface ListUsersOptions {
  page?: number;
  pageSize?: number;
  status?: UserStatus;
}

export async function listUsers(options: ListUsersOptions = {}) {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 25;

  const where = { deletedAt: null, ...(options.status ? { status: options.status } : {}) };

  const [rows, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      include: { roles: { include: { role: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { rows, total, page, pageSize };
}

export async function getUserById(id: string) {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    include: { roles: { include: { role: true } } },
  });
  if (!user) throw new HttpError(404, 'NOT_FOUND', 'User not found');
  return user;
}

export interface CreateUserInput {
  name: string;
  email?: string;
  phone?: string;
  roleIds?: string[];
}

export async function createUser(input: CreateUserInput) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name: input.name, email: input.email, phone: input.phone },
    });
    if (input.roleIds?.length) {
      await tx.userRole.createMany({ data: input.roleIds.map((roleId) => ({ userId: user.id, roleId })) });
    }
    return getUserById(user.id);
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

/** Soft delete — never hard-delete user data. */
export async function softDeleteUser(id: string) {
  await getUserById(id);
  await prisma.user.update({ where: { id }, data: { deletedAt: new Date(), status: 'blocked' } });
}

export async function setUserStatus(id: string, status: UserStatus) {
  await getUserById(id);
  await prisma.user.update({ where: { id }, data: { status } });
  return getUserById(id);
}

export async function assignRoleToUser(userId: string, roleId: string) {
  await getUserById(userId);
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw new HttpError(404, 'NOT_FOUND', 'Role not found');

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId } },
    create: { userId, roleId },
    update: {},
  });
  return getUserById(userId);
}

export async function removeRoleFromUser(userId: string, roleId: string) {
  await getUserById(userId);
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
