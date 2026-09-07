import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateQuery } from '../middleware/validate';
import { sendData } from '../lib/http';
import { ReportFiltersQuerySchema, TopListQuerySchema, TopVendorsQuerySchema } from '../schemas/reports.schema';
import * as reportsService from '../services/reports.service';

/**
 * Superadmin Reports dashboard — real routes replacing the old `createStubRouter('reports')`.
 * Gated on the SAME `reports:view` permission every role already holds for the Reports menu
 * node (see prisma/seed.ts's grantStarterPermissions) — no new Permission/menuKey introduced.
 * Every handler just parses the shared filter query shape and delegates to reports.service.ts —
 * all real aggregation happens there, never in this file.
 */
const router = Router();
router.use(authenticate, requirePermission('reports', 'view'));

router.get('/summary', validateQuery(ReportFiltersQuerySchema), async (req, res, next) => {
  try {
    const filters = req.validatedQuery as ReturnType<typeof ReportFiltersQuerySchema.parse>;
    sendData(res, await reportsService.getOverallSummary(filters));
  } catch (err) {
    next(err);
  }
});

router.get('/vendor-wise', validateQuery(ReportFiltersQuerySchema), async (req, res, next) => {
  try {
    const filters = req.validatedQuery as ReturnType<typeof ReportFiltersQuerySchema.parse>;
    sendData(res, await reportsService.getVendorWiseReport(filters));
  } catch (err) {
    next(err);
  }
});

router.get('/branch-wise', validateQuery(ReportFiltersQuerySchema), async (req, res, next) => {
  try {
    const filters = req.validatedQuery as ReturnType<typeof ReportFiltersQuerySchema.parse>;
    sendData(res, await reportsService.getBranchWiseReport(filters));
  } catch (err) {
    next(err);
  }
});

router.get('/month-wise', validateQuery(ReportFiltersQuerySchema), async (req, res, next) => {
  try {
    const filters = req.validatedQuery as ReturnType<typeof ReportFiltersQuerySchema.parse>;
    sendData(res, await reportsService.getMonthWiseReport(filters));
  } catch (err) {
    next(err);
  }
});

router.get('/service-vs-product', validateQuery(ReportFiltersQuerySchema), async (req, res, next) => {
  try {
    const filters = req.validatedQuery as ReturnType<typeof ReportFiltersQuerySchema.parse>;
    sendData(res, await reportsService.getServiceVsProductReport(filters));
  } catch (err) {
    next(err);
  }
});

router.get('/top-vendors', validateQuery(TopVendorsQuerySchema), async (req, res, next) => {
  try {
    const { limit, by, ...filters } = req.validatedQuery as ReturnType<typeof TopVendorsQuerySchema.parse>;
    sendData(res, await reportsService.getTopVendors(filters, by, limit));
  } catch (err) {
    next(err);
  }
});

router.get('/top-products', validateQuery(TopListQuerySchema), async (req, res, next) => {
  try {
    const { limit, ...filters } = req.validatedQuery as ReturnType<typeof TopListQuerySchema.parse>;
    sendData(res, await reportsService.getTopProducts(filters, limit));
  } catch (err) {
    next(err);
  }
});

router.get('/top-services', validateQuery(TopListQuerySchema), async (req, res, next) => {
  try {
    const { limit, ...filters } = req.validatedQuery as ReturnType<typeof TopListQuerySchema.parse>;
    sendData(res, await reportsService.getTopServices(filters, limit));
  } catch (err) {
    next(err);
  }
});

router.get('/payment-method', validateQuery(ReportFiltersQuerySchema), async (req, res, next) => {
  try {
    const filters = req.validatedQuery as ReturnType<typeof ReportFiltersQuerySchema.parse>;
    sendData(res, await reportsService.getPaymentMethodReport(filters));
  } catch (err) {
    next(err);
  }
});

export default router;
