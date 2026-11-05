import './config/load-env';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { passport } from './lib/passport';
import { generateOpenApiDocument } from './openapi';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';
import { authenticate } from './middleware/authenticate';
import { authorizeDriverUpload } from './middleware/authorizeDriverUpload';
import { UPLOAD_ROOT } from './lib/upload';
import { makeMasterListRouter } from './lib/masterListRouter';
import authRoutes from './routes/auth.routes';
import dashboardRoutes from './routes/dashboard.routes';
import rbacRoutes from './routes/rbac.routes';
import customersRoutes from './routes/customers.routes';
import customerSelfRoutes from './routes/customerSelf.routes';
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
import reportsRoutes from './routes/reports.routes';
import workflowRoutes from './routes/workflow.routes';
import { receiveWebhook } from './services/payment-provider.service';

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
  app.post('/payments/provider/webhook', express.raw({ type: 'application/json', limit: '256kb' }), async (req,res,next) => {
    try { res.json({ data: await receiveWebhook(req.body, req.get('X-Razorpay-Signature') ?? ''), error: null }); } catch(error) { next(error); }
  });
  app.use(express.json());
  app.use(passport.initialize());

  app.get('/health', (_req, res) => {
    res.json({ data: { status: 'ok', app: 'mera-driver-api', workflow: 'cod-razorpay-v2' }, error: null });
  });

  // Bounded public website lookup; no credentials or provider payload are returned.
  const lookupWindows=new Map<string,{started:number;count:number}>();
  app.get('/location/search',async(req,res,next)=>{try{
    const ip=req.ip??'unknown',now=Date.now();let window=lookupWindows.get(ip);
    if(!window||now-window.started>60000){if(lookupWindows.size>=1000&&!lookupWindows.has(ip)){for(const [key,value] of lookupWindows)if(now-value.started>60000)lookupWindows.delete(key);if(lookupWindows.size>=1000){res.status(429).json({data:null,error:{code:'LOCATION_RATE_LIMIT',message:'Address lookup is busy. Please try again later or enter the address manually.'}});return;}}window={started:now,count:0};lookupWindows.set(ip,window);}
    if(++window.count>10){res.status(429).json({data:null,error:{code:'LOCATION_RATE_LIMIT',message:'Too many address lookups. Please wait a minute.'}});return;}
    if(lookupWindows.size>1000)for(const [key,value] of lookupWindows)if(now-value.started>60000)lookupWindows.delete(key);
    const address=typeof req.query.q==='string'?req.query.q:'';
    res.json({data:await import('./services/location-search.service').then(m=>m.searchLocation(address)),error:null});
  }catch(error){next(error);}});

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(generateOpenApiDocument()));

  // Auth — public (OTP/Google) + a couple of authenticated routes (logout-all) internally.
  app.use('/auth', authRoutes);
  app.use('/dashboard', dashboardRoutes);

  // RBAC — every route inside requires a Bearer token; most are further gated by
  // `requirePermission(menuKey, action)`.
  app.use('/rbac', rbacRoutes);
  app.use('/workflow', workflowRoutes);

  // Business domain — Phase 1 (real CRUD, Postgres-backed). Each router is gated by
  // `requirePermission('<menuKey>', 'view'|'create'|'edit'|'delete')`.
  // MUST be registered before `/customers` — otherwise the admin router's `PATCH /:id` would
  // match `PATCH /customers/me` first (with `id` literally 'me'), swallowing the self-service
  // route. Customer self-service is ownership-based (`resolveOwnCustomer`), not a permission
  // grant — a customer has no `customers:*` permission and must never need one for this.
  app.use('/customers/me', customerSelfRoutes);
  app.use('/customers', customersRoutes);
  // Same ordering requirement as above, for the driver self-service router.
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
  app.get('/masters/onboarding-options',authenticate,async(req,res,next)=>{try{
    const granted=await import('./services/permission.service').then(m=>m.resolveEffectivePermissionsForUser(req.user!.sub,req.user!.roles));
    const own=await import('./lib/prisma').then(m=>m.prisma.driver.findFirst({where:{userId:req.user!.sub,accountStatus:'Active'},select:{id:true}}));
    if(!own&&!['drivers:view','drivers:create','drivers:edit','payments.overview:edit'].some(key=>granted.includes(key))){res.status(403).json({data:null,error:{code:'FORBIDDEN',message:'Driver onboarding permission required'}});return;}
    res.json({data:await import('./services/driver-preferences.service').then(m=>m.onboardingOptions()),error:null});
  }catch(error){next(error);}});
  for(const category of ['job-types','job-choices','states','driver-account-statuses'])app.use('/masters/'+category,makeMasterListRouter(category,'masters.source-types'));
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
  app.use('/uploads', authenticate, authorizeDriverUpload, express.static(UPLOAD_ROOT));

  // Business-domain stubs still pending (Phase 2/3) — one router per module, each
  // gated by `requirePermission('<menuKey>', 'view')`. Real CRUD is out of scope for this build.
  app.use('/reports', reportsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
