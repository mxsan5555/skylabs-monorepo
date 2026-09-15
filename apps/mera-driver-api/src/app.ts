import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { passport } from './lib/passport';
import { generateOpenApiDocument } from './openapi';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';
import { authenticate } from './middleware/authenticate';
import { UPLOAD_ROOT } from './lib/upload';
import { makeMasterListRouter } from './lib/masterListRouter';
import authRoutes from './routes/auth.routes';
import rbacRoutes from './routes/rbac.routes';
import customersRoutes from './routes/customers.routes';
import driverSelfRoutes from './routes/driverSelf.routes';
import driversRoutes from './routes/drivers.routes';
import vehiclesRoutes from './routes/vehicles.routes';
import attendanceRoutes from './routes/attendance.routes';
import tripTypesRoutes from './routes/tripTypes.routes';
import bookingsRoutes from './routes/bookings.routes';
import driverLocationsRoutes from './routes/driverLocations.routes';
import cancellationReasonsRoutes from './routes/cancellationReasons.routes';
import fareRulesRoutes from './routes/fareRules.routes';
import vehicleTypesRoutes from './routes/vehicleTypes.routes';
import serviceZonesRoutes from './routes/serviceZones.routes';
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

  // Business domain — Phase 1 (real CRUD, Postgres-backed). Each router is gated by
  // `requirePermission('<menuKey>', 'view'|'create'|'edit'|'delete')`.
  app.use('/customers', customersRoutes);
  // MUST be registered before `/drivers` — otherwise the admin router's `PATCH /:id` would
  // match `PATCH /drivers/me` first (with `id` literally 'me'), swallowing the self-service
  // route. Driver self-service is ownership-based (`resolveOwnDriver`), not a permission
  // grant — a driver has no `drivers:*` permission and must never need one for this.
  app.use('/drivers/me', driverSelfRoutes);
  app.use('/drivers', driversRoutes);
  app.use('/vehicles', vehiclesRoutes);
  app.use('/attendance', attendanceRoutes);
  app.use('/trips/trip-types', tripTypesRoutes);
  app.use('/trips/bookings', bookingsRoutes);
  app.use('/trips/driver-locations', driverLocationsRoutes);
  app.use('/trips/cancellation-reasons', cancellationReasonsRoutes);
  app.use('/trips/pricing', fareRulesRoutes);

  // Master data — 8 structurally-identical lookup lists sharing one `MasterListItem`
  // table (category baked in per mount), plus the 2 richer masters with their own tables.
  app.use('/masters/driver-types', makeMasterListRouter('driver-types', 'masters.driver-types'));
  app.use('/masters/education', makeMasterListRouter('education', 'masters.education'));
  app.use('/masters/eye-visions', makeMasterListRouter('eye-visions', 'masters.eye-visions'));
  app.use('/masters/health-docs', makeMasterListRouter('health-docs', 'masters.health-docs'));
  app.use('/masters/personal-docs', makeMasterListRouter('personal-docs', 'masters.personal-docs'));
  app.use('/masters/police-docs', makeMasterListRouter('police-docs', 'masters.police-docs'));
  app.use('/masters/source-types', makeMasterListRouter('source-types', 'masters.source-types'));
  app.use('/masters/statuses', makeMasterListRouter('statuses', 'masters.statuses'));
  app.use('/masters/vehicle-types', vehicleTypesRoutes);
  app.use('/masters/zones', serviceZonesRoutes);
  app.use('/masters/languages', makeMasterListRouter('languages', 'masters.languages'));

  // Uploaded driver KYC documents — signed-in users only, served as static files.
  app.use('/uploads', authenticate, express.static(UPLOAD_ROOT));

  // Business-domain stubs still pending (Phase 2/3) — one router per module, each
  // gated by `requirePermission('<menuKey>', 'view')`. Real CRUD is out of scope for this build.
  app.use('/payments', paymentsRoutes);
  app.use('/reports', reportsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
