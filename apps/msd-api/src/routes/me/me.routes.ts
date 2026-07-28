import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthedRequest } from '../../middleware/require-auth';
import { prisma } from '../../lib/prisma-client';
import { registry } from '../../lib/openapi-registry';

const meResponseSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  roles: z.array(z.string()),
});

registry.registerPath({
  method: 'get',
  path: '/me',
  summary: 'Current authenticated user (used by the frontend to rehydrate user/roles on boot)',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Current user', content: { 'application/json': { schema: meResponseSchema } } },
    401: { description: 'Missing or invalid token' },
  },
});

export const meRouter = Router();

meRouter.get('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.id } });
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      roles: user.roles.map((role) => role.toLowerCase()),
    });
  } catch (err) {
    next(err);
  }
});
