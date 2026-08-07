import './config/env';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { passport, configurePassport } from './lib/passport';
import { buildOpenApiDocument } from './openapi/registry';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth.routes';
import rbacRoutes from './routes/rbac.routes';
import customersRoutes from './routes/customers.routes';
import vendorsRoutes from './routes/vendors.routes';
import ordersRoutes from './routes/orders.routes';
import productsRoutes from './routes/products.routes';
import inventoryRoutes from './routes/inventory.routes';
import reportsRoutes from './routes/reports.routes';

/**
 * The Express app, wired up but not listening. Split out of main.ts so Supertest can
 * `import app from '../app'` and drive requests in-process without opening a real port
 * or requiring a reachable Postgres (routes/services hit `lib/prisma`'s singleton, which
 * tests mock at the module boundary — see src/test-utils/prisma-mock.ts).
 */
export function createApp(): express.Express {
  const app = express();

  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(express.json());

  configurePassport();
  app.use(passport.initialize());

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(buildOpenApiDocument()));

  const api = express.Router();
  api.use('/auth', authRoutes);
  api.use('/rbac', rbacRoutes);
  api.use('/customers', customersRoutes);
  api.use('/vendors', vendorsRoutes);
  api.use('/orders', ordersRoutes);
  api.use('/products', productsRoutes);
  api.use('/inventory', inventoryRoutes);
  api.use('/reports', reportsRoutes);

  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

const app = createApp();
export default app;
