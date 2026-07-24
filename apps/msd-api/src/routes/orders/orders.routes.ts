import { Router } from 'express';
import { prisma } from '../../lib/prisma-client';
import { money } from '../../lib/money';
import { notFound } from '../../lib/api-error';
import { requireAuth, type AuthedRequest } from '../../middleware/require-auth';
import { requireRole } from '../../middleware/require-role';
import { offsetQuerySchema, offsetResult } from '../../lib/pagination';
import { registry } from '../../lib/openapi-registry';
import { UserRole } from '../../generated/prisma';
import { orderInclude, expireIfStale, toOrderSummary, toOrderDetail } from './orders.service';

registry.registerPath({
  method: 'get',
  path: '/me/orders',
  summary: 'My order history',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Orders' } },
});
registry.registerPath({
  method: 'get',
  path: '/me/payments',
  summary: 'My payment/transaction history',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Payments' } },
});

export const ordersRouter = Router();

ordersRouter.get('/me/orders', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const query = offsetQuerySchema.parse(req.query);
    const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : undefined;
    const where = { userId: req.auth!.id, ...(status ? { status: status as never } : {}) };
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: { placedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.order.count({ where }),
    ]);
    const fresh = await Promise.all(orders.map(expireIfStale));
    res.json(offsetResult(fresh.map(toOrderSummary), total, query));
  } catch (err) {
    next(err);
  }
});

ordersRouter.get('/me/orders/:id', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, userId: req.auth!.id },
      include: orderInclude,
    });
    if (!order) throw notFound('order_not_found');
    const fresh = await expireIfStale(order);
    res.json(toOrderDetail(fresh));
  } catch (err) {
    next(err);
  }
});

ordersRouter.get('/me/payments', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.auth!.id },
      include: orderInclude,
      orderBy: { placedAt: 'desc' },
    });
    const items = orders.flatMap((order) =>
      order.payments.map((p) => ({
        id: p.id,
        orderNumber: order.orderNumber,
        date: p.createdAt,
        description: order.items.map((i) => `${i.dealTitle} × ${i.quantity}`).join(', '),
        method: p.method,
        amount: money(p.amount),
        status: p.status,
        direction: 'debit' as const,
      })),
    );
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

export const adminOrdersRouter = Router();

adminOrdersRouter.get(
  '/admin/orders',
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.SALES]),
  async (req, res, next) => {
    try {
      const query = offsetQuerySchema.parse(req.query);
      const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : undefined;
      const where = status ? { status: status as never } : {};
      const [orders, total] = await Promise.all([
        prisma.order.findMany({
          where,
          include: orderInclude,
          orderBy: { placedAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        prisma.order.count({ where }),
      ]);
      res.json(offsetResult(orders.map(toOrderDetail), total, query));
    } catch (err) {
      next(err);
    }
  },
);
