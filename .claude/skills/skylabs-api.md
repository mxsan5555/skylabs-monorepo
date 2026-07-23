# Skill: Skylabs API

Express + TypeScript + Prisma + Zod patterns for msd-api and mera-driver-api.

## Generate a New API App
```bash
npx nx g @nx/express:app msd-api
npx nx g @nx/express:app mera-driver-api
```

## App Structure (per API)
```
apps/<name>-api/src/
├── routes/             ← one file per resource (auth.routes.ts, deals.routes.ts, …)
├── services/           ← business logic layer; routes call services only
├── middleware/         ← authenticate, requireRole, errorHandler, rateLimiter
├── schemas/            ← Zod schemas + zod-to-openapi registrations
├── lib/
│   └── prisma.ts       ← Prisma client singleton
└── main.ts             ← app bootstrap, swagger setup, starts server

apps/<name>-api/
├── prisma/
│   ├── schema.prisma   ← Prisma schema
│   └── seed.ts         ← seed script
└── .env.local          ← never committed
```

## Response Shape (always)
```ts
// Success:
res.json({ data: result, error: null, meta: { total, page } });

// Error:
res.status(code).json({ data: null, error: { code: 'ERROR_CODE', message: '...', details?: any } });
```

Error codes: `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `VALIDATION_ERROR` (422), `RATE_LIMITED` (429), `SERVER_ERROR` (500)

## Zod + OpenAPI (Schema First)

### 1. Register schemas before writing routes
```ts
// schemas/deal.schema.ts
import { z } from 'zod';
import { extendZodWithOpenApi } from 'zod-to-openapi';
extendZodWithOpenApi(z);

export const DealSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  price: z.number().positive(),
  category: z.string(),
}).openapi('Deal');

export const CreateDealSchema = DealSchema.omit({ id: true });
```

### 2. Register routes in OpenAPI registry
```ts
// main.ts (before starting server)
import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
const registry = new OpenAPIRegistry();
registry.registerPath({
  method: 'get',
  path: '/deals',
  summary: 'List all deals',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Deal list', content: { 'application/json': { schema: z.array(DealSchema) } } },
  },
});
```

### 3. Serve docs
```ts
import swaggerUi from 'swagger-ui-express';
const generator = new OpenApiGeneratorV31(registry.definitions);
const spec = generator.generateDocument({ openapi: '3.1.0', info: { title: 'MSD API', version: '1.0.0' } });
app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));
```

## Route Handler Pattern
```ts
// routes/deals.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { DealService } from '../services/deal.service';
import { CreateDealSchema } from '../schemas/deal.schema';

const router = Router();
const dealService = new DealService();

router.get('/', authenticate, async (req, res, next) => {
  try {
    const deals = await dealService.list();
    res.json({ data: deals, error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, validate(CreateDealSchema), async (req, res, next) => {
  try {
    const deal = await dealService.create(req.body);
    res.status(201).json({ data: deal, error: null });
  } catch (err) {
    next(err);
  }
});

export default router;
```

## Prisma Client Singleton
```ts
// lib/prisma.ts
import { PrismaClient } from '@prisma/client';
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

## Prisma Schema Rules
```prisma
model User {
  id         String    @id @default(uuid())
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
  deletedAt  DateTime? // soft delete — never hard-delete user data
  phone      String?   @unique
  email      String?   @unique
  roles      Role[]    @default([USER])
}

enum Role {
  USER    // msd
  ADMIN
  MARKETING
  SALES
  CUSTOMER  // mera-driver
  DRIVER
}
```

## Validation Middleware
```ts
// middleware/validate.ts
import { z } from 'zod';
export function validate(schema: z.ZodSchema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(422).json({
        data: null,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: result.error.flatten() },
      });
    }
    req.body = result.data;
    next();
  };
}
```

## Global Error Handler
```ts
// middleware/errorHandler.ts
export function errorHandler(err, req, res, next) {
  console.error({ err, path: req.path, userId: req.user?.sub });
  res.status(500).json({ data: null, error: { code: 'SERVER_ERROR', message: 'Internal server error' } });
}
// Register last in main.ts: app.use(errorHandler);
```

## Nx Commands
```bash
npx nx serve msd-api               # dev server
npx nx build msd-api               # production build
npx nx run msd-api:test            # Vitest + Supertest
```
