import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/require-auth';
import { requireRole } from '../../middleware/require-role';
import { prisma } from '../../lib/prisma-client';
import { notFound } from '../../lib/api-error';
import { offsetQuerySchema, offsetResult } from '../../lib/pagination';
import { UserRole, UserStatus } from '../../generated/prisma';

const statusUpdateSchema = z.object({ status: z.nativeEnum(UserStatus) });

export const adminUsersRouter = Router();
const staffRoles = [UserRole.ADMIN, UserRole.SALES];

adminUsersRouter.get('/users', requireAuth, requireRole(staffRoles), async (req, res, next) => {
  try {
    const query = offsetQuerySchema.parse(req.query);
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const where = q
      ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { email: { contains: q, mode: 'insensitive' as const } }, { phone: { contains: q } }] }
      : {};
    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: { id: true, name: true, email: true, phone: true, roles: true, status: true, createdAt: true },
      }),
      prisma.user.count({ where }),
    ]);
    res.json(offsetResult(items, total, query));
  } catch (err) {
    next(err);
  }
});

adminUsersRouter.get('/users/:id', requireAuth, requireRole(staffRoles), async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, name: true, email: true, phone: true, roles: true, status: true,
        gender: true, dateOfBirth: true, locale: true, createdAt: true, updatedAt: true,
      },
    });
    if (!user) throw notFound('user_not_found');
    res.json(user);
  } catch (err) {
    next(err);
  }
});

adminUsersRouter.patch(
  '/users/:id/status',
  requireAuth,
  requireRole([UserRole.ADMIN]),
  async (req, res, next) => {
    try {
      const { status } = statusUpdateSchema.parse(req.body);
      const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
      if (!existing) throw notFound('user_not_found');
      const user = await prisma.user.update({
        where: { id: existing.id },
        data: { status },
        select: { id: true, name: true, email: true, phone: true, roles: true, status: true },
      });
      res.json(user);
    } catch (err) {
      next(err);
    }
  },
);
