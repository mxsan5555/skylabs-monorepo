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
import categoriesRoutes from './routes/categories.routes';
import catalogRoutes from './routes/catalog.routes';
import cartRoutes from './routes/cart.routes';
import wishlistRoutes from './routes/wishlist.routes';
import bookingRoutes from './routes/booking.routes';
import ordersRoutes from './routes/orders.routes';
import paymentRoutes from './routes/payment.routes';
import productsRoutes from './routes/products.routes';
import servicesRoutes from './routes/services.routes';
import inventoryRoutes from './routes/inventory.routes';
import reportsRoutes from './routes/reports.routes';
import dashboardRoutes from './routes/dashboard.routes';

/**
 * The Express app, wired up but not listening. Split out of main.ts so Supertest can
 * `import app from '../app'` and drive requests in-process without opening a real port
 * or requiring a reachable Postgres (routes/services hit `lib/prisma`'s singleton, which
 * tests mock at the module boundary — see src/test-utils/prisma-mock.ts).
 */
export function createApp(): express.Express {
  const app = express();

  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  // `verify` captures the exact raw bytes onto req.rawBody — payment.routes.ts's webhook needs
  // these (not a re-serialized JSON.stringify of the parsed body) to match Razorpay's HMAC
  // signature, which is computed over the literal request body it sent.
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );

  configurePassport();
  app.use(passport.initialize());

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(buildOpenApiDocument()));

  const api = express.Router();
  api.use('/auth', authRoutes);
  api.use('/rbac', rbacRoutes);
  api.use('/customers', customersRoutes);
  api.use('/vendors', vendorsRoutes);
  api.use('/categories', categoriesRoutes);
  api.use('/catalog', catalogRoutes);
  api.use('/cart', cartRoutes);
  api.use('/wishlist', wishlistRoutes);
  api.use('/bookings', bookingRoutes);
  api.use('/orders', ordersRoutes);
  api.use('/payments', paymentRoutes);
  api.use('/products', productsRoutes);
  api.use('/services', servicesRoutes);
  api.use('/inventory', inventoryRoutes);
  api.use('/reports', reportsRoutes);
  api.use('/dashboard', dashboardRoutes);

  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

const app = createApp();
export default app;
