import './config/env';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { getUploadRoot } from './lib/media-storage';
import { passport, configurePassport } from './lib/passport';
import { buildOpenApiDocument } from './openapi/registry';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth.routes';
import rbacRoutes from './routes/rbac.routes';
import customersRoutes from './routes/customers.routes';
import vendorsRoutes from './routes/vendors.routes';
import categoriesRoutes from './routes/categories.routes';
import blogPostsRoutes from './routes/blog-posts.routes';
import siteContentRoutes from './routes/site-content.routes';
import popularTagsRoutes from './routes/popular-tags.routes';
import catalogRoutes from './routes/catalog.routes';
import cartRoutes from './routes/cart.routes';
import wishlistRoutes from './routes/wishlist.routes';
import ordersRoutes from './routes/orders.routes';
import paymentRoutes from './routes/payment.routes';
import productsRoutes from './routes/products.routes';
import inventoryRoutes from './routes/inventory.routes';
import reportsRoutes from './routes/reports.routes';
import dashboardRoutes from './routes/dashboard.routes';
import notificationsRoutes from './routes/notifications.routes';

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
  // Uploaded Deal/Product/Therapist media — served by relative storageKey, e.g.
  // `/media/deals/<dealId>/<uuid>.jpg` (see media-storage.ts's doc comment).
  app.use('/media', express.static(getUploadRoot()));

  const api = express.Router();
  api.use('/auth', authRoutes);
  api.use('/rbac', rbacRoutes);
  api.use('/customers', customersRoutes);
  api.use('/vendors', vendorsRoutes);
  api.use('/categories', categoriesRoutes);
  api.use('/blog-posts', blogPostsRoutes);
  // site-content.routes.ts declares its own full paths (`/about-us`, `/contact-us`) rather than
  // living under a shared resource prefix — see that file's own doc comment — so it mounts at
  // the API root, not a sub-path, to avoid double-prefixing (e.g. NOT /site-content/about-us).
  api.use('/', siteContentRoutes);
  api.use('/popular-tags', popularTagsRoutes);
  api.use('/catalog', catalogRoutes);
  api.use('/cart', cartRoutes);
  api.use('/wishlist', wishlistRoutes);
  api.use('/orders', ordersRoutes);
  api.use('/payments', paymentRoutes);
  api.use('/products', productsRoutes);
  api.use('/inventory', inventoryRoutes);
  api.use('/reports', reportsRoutes);
  api.use('/dashboard', dashboardRoutes);
  api.use('/notifications', notificationsRoutes);

  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

const app = createApp();
export default app;
