import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma-client';
import { notFound, conflict } from '../../lib/api-error';
import { requireAuth } from '../../middleware/require-auth';
import { requireRole } from '../../middleware/require-role';
import { registry } from '../../lib/openapi-registry';
import { UserRole } from '../../generated/prisma';

const featureCreateSchema = z.object({ name: z.string().min(1).max(60) });
const featureUpdateSchema = z.object({ name: z.string().min(1).max(60) });

registry.registerPath({
  method: 'get',
  path: '/features',
  summary: 'Shared feature/amenity vocabulary',
  responses: { 200: { description: 'Feature list' } },
});
registry.registerPath({
  method: 'post',
  path: '/admin/features',
  summary: 'Create a feature (admin, marketing)',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: featureCreateSchema } } } },
  responses: { 201: { description: 'Created' } },
});

export const featuresRouter = Router();

featuresRouter.get('/features', async (_req, res, next) => {
  try {
    const items = await prisma.feature.findMany({ orderBy: { name: 'asc' } });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

export const adminFeaturesRouter = Router();
const staffRoles = [UserRole.ADMIN, UserRole.MARKETING];

adminFeaturesRouter.post('/admin/features', requireAuth, requireRole(staffRoles), async (req, res, next) => {
  try {
    const input = featureCreateSchema.parse(req.body);
    const existing = await prisma.feature.findUnique({ where: { name: input.name } });
    if (existing) throw conflict('feature_exists');
    const feature = await prisma.feature.create({ data: input });
    res.status(201).json(feature);
  } catch (err) {
    next(err);
  }
});

adminFeaturesRouter.patch('/admin/features/:id', requireAuth, requireRole(staffRoles), async (req, res, next) => {
  try {
    const input = featureUpdateSchema.parse(req.body);
    const existing = await prisma.feature.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('feature_not_found');
    const feature = await prisma.feature.update({ where: { id: req.params.id }, data: input });
    res.json(feature);
  } catch (err) {
    next(err);
  }
});

adminFeaturesRouter.delete('/admin/features/:id', requireAuth, requireRole(staffRoles), async (req, res, next) => {
  try {
    const existing = await prisma.feature.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('feature_not_found');
    await prisma.feature.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
