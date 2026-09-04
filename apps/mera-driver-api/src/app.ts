import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { passport } from './lib/passport';
import { generateOpenApiDocument } from './openapi';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth.routes';
import rbacRoutes from './routes/rbac.routes';
import driversRoutes from './routes/drivers.routes';
import vehiclesRoutes from './routes/vehicles.routes';
import tripsRoutes from './routes/trips.routes';
import attendanceRoutes from './routes/attendance.routes';
import paymentsRoutes from './routes/payments.routes';
import reportsRoutes from './routes/reports.routes';

/**
 * Builds the Express app without binding a port — split out of `main.ts` so
 * Supertest (and any other in-process caller) can exercise the full middleware
 * stack via `request(app)` without starting a real HTTP listener. `main.ts` is
 * the only place that calls `app.listen(...)`.
 */
export function createApp() {
  const app = express();

  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:4400').split(',').map((s) => s.trim());
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(express.json());
  app.use(passport.initialize());

  app.get('/health', (_req, res) => {
    res.json({ data: { status: 'ok', app: 'mera-driver-api' }, error: null });
  });

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(generateOpenApiDocument()));

  // Auth — public (OTP/Google) + a couple of authenticated routes (logout-all) internally.
  app.use('/auth', authRoutes);

  // RBAC — every route inside requires a Bearer token; most are further gated by
  // `requirePermission(menuKey, action)`.
  app.use('/rbac', rbacRoutes);

  // Business-domain stubs — one router per module, each gated by
  // `requirePermission('<menuKey>', 'view')`. Real CRUD is out of scope for this build.
  app.use('/drivers', driversRoutes);
  app.use('/vehicles', vehiclesRoutes);
  app.use('/trips', tripsRoutes);
  app.use('/attendance', attendanceRoutes);
  app.use('/payments', paymentsRoutes);
  app.use('/reports', reportsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
