import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { revokeAllRefreshTokens } from './token.service';
import { Prisma, type UserStatus } from '../generated/prisma-client';

export async function listUsers(page: number, pageSize: number, search?: string) {
  const where = {
    deletedAt: null,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { roles: { include: { role: true } } },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    items: items.map(serializeUser),
    total,
  };
}

export function serializeUser(user: {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roles: { role: { id: string; key: string; name: string } }[];
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    roles: user.roles.map((ur) => ur.role),
  };
}

export async function getUserOrThrow(id: string) {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    include: { roles: { include: { role: true } } },
  });
  if (!user) throw new ApiError('NOT_FOUND', 'User not found');
  return user;
}

export async function createUser(input: {
  name: string;
  email?: string;
  phone?: string;
  roleIds: string[];
}) {
  if (!input.email && !input.phone) {
    throw new ApiError('VALIDATION_ERROR', 'A user requires at least one of email or phone');
  }
  const validRoleCount = await prisma.role.count({ where: { id: { in: input.roleIds } } });
  if (validRoleCount !== input.roleIds.length) {
    throw new ApiError('VALIDATION_ERROR', 'One or more roleIds do not exist');
  }

  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        roles: { create: input.roleIds.map((roleId) => ({ roleId })) },
      },
      include: { roles: { include: { role: true } } },
    });
    return serializeUser(user);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ApiError('CONFLICT', 'A user with this email or phone already exists.');
    }
    throw err;
  }
}

export async function updateUser(id: string, input: { name?: string; email?: string; phone?: string }) {
  await getUserOrThrow(id);
  const user = await prisma.user.update({
    where: { id },
    data: input,
    include: { roles: { include: { role: true } } },
  });
  return serializeUser(user);
}

export async function softDeleteUser(id: string) {
  await getUserOrThrow(id);
  await prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function setUserStatus(id: string, status: UserStatus) {
  await getUserOrThrow(id);
  const user = await prisma.user.update({ where: { id }, data: { status }, include: { roles: { include: { role: true } } } });
  return serializeUser(user);
}

export async function assignRole(userId: string, roleId: string) {
  await getUserOrThrow(userId);
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw new ApiError('NOT_FOUND', 'Role not found');

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId } },
    update: {},
    create: { userId, roleId },
  });
}

export async function unassignRole(userId: string, roleId: string) {
  await prisma.userRole.deleteMany({ where: { userId, roleId } });
}

export async function revokeAllSessionsForUser(userId: string) {
  await getUserOrThrow(userId);
  await revokeAllRefreshTokens(userId);
}

/** Invalidates any pending (unconsumed) OTP challenges tied to the user's identifiers. */
export async function resetOtpForUser(userId: string) {
  const user = await getUserOrThrow(userId);
  const identifiers = [user.email, user.phone].filter((v): v is string => Boolean(v));
  if (identifiers.length === 0) return;
  await prisma.otpChallenge.updateMany({
    where: { identifier: { in: identifiers }, verifiedAt: null },
    data: { verifiedAt: new Date() },
  });
}

export async function getLoginHistory(userId: string, page: number, pageSize: number) {
  const [items, total] = await Promise.all([
    prisma.loginHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.loginHistory.count({ where: { userId } }),
  ]);
  return { items, total };
}

export async function getSessions(userId: string) {
  return prisma.refreshSession.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      userId: true,
      deviceInfo: true,
      ip: true,
      userAgent: true,
      createdAt: true,
      expiresAt: true,
      revokedAt: true,
    },
  });
}
