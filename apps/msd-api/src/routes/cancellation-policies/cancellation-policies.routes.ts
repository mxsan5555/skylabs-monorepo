import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma-client';
import { notFound } from '../../lib/api-error';
import { requireAuth } from '../../middleware/require-auth';
import { requireRole } from '../../middleware/require-role';
import { registry } from '../../lib/openapi-registry';
import { UserRole } from '../../generated/prisma';

const policyCreateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(2000),
  freeCancelHoursBefore: z.number().int().min(0),
  partialRefundPct: z.number().int().min(0).max(100).default(0),
});
const policyUpdateSchema = policyCreateSchema.partial();

registry.registerPath({
  method: 'get',
  path: '/admin/cancellation-policies',
  summary: 'List cancellation policies (admin)',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'List' } },
});
registry.registerPath({
  method: 'post',
  path: '/admin/cancellation-policies',
  summary: 'Create a cancellation policy (admin)',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: policyCreateSchema } } } },
  responses: { 201: { description: 'Created' } },
});

export const cancellationPoliciesRouter = Router();
const adminOnly = [UserRole.ADMIN];

cancellationPoliciesRouter.get('/cancellation-policies', async (_req, res, next) => {
  try {
    const items = await prisma.cancellationPolicy.findMany({ orderBy: { name: 'asc' } });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

cancellationPoliciesRouter.get(
  '/admin/cancellation-policies',
  requireAuth,
  requireRole(adminOnly),
  async (_req, res, next) => {
    try {
      const items = await prisma.cancellationPolicy.findMany({ orderBy: { name: 'asc' } });
      res.json({ items });
    } catch (err) {
      next(err);
    }
  },
);

cancellationPoliciesRouter.post(
  '/admin/cancellation-policies',
  requireAuth,
  requireRole(adminOnly),
  async (req, res, next) => {
    try {
      const input = policyCreateSchema.parse(req.body);
      const policy = await prisma.cancellationPolicy.create({ data: input });
      res.status(201).json(policy);
    } catch (err) {
      next(err);
    }
  },
);

cancellationPoliciesRouter.patch(
  '/admin/cancellation-policies/:id',
  requireAuth,
  requireRole(adminOnly),
  async (req, res, next) => {
    try {
      const input = policyUpdateSchema.parse(req.body);
      const existing = await prisma.cancellationPolicy.findUnique({ where: { id: req.params.id } });
      if (!existing) throw notFound('policy_not_found');
      const policy = await prisma.cancellationPolicy.update({ where: { id: req.params.id }, data: input });
      res.json(policy);
    } catch (err) {
      next(err);
    }
  },
);
