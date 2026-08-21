import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
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

router.get('/summary', async (req, res, next) => {
  try {
    const filters = ReportFiltersQuerySchema.parse(req.query);
    sendData(res, await reportsService.getOverallSummary(filters));
  } catch (err) {
    next(err);
  }
});

router.get('/vendor-wise', async (req, res, next) => {
  try {
    const filters = ReportFiltersQuerySchema.parse(req.query);
    sendData(res, await reportsService.getVendorWiseReport(filters));
  } catch (err) {
    next(err);
  }
});

router.get('/branch-wise', async (req, res, next) => {
  try {
    const filters = ReportFiltersQuerySchema.parse(req.query);
    sendData(res, await reportsService.getBranchWiseReport(filters));
  } catch (err) {
    next(err);
  }
});

router.get('/month-wise', async (req, res, next) => {
  try {
    const filters = ReportFiltersQuerySchema.parse(req.query);
    sendData(res, await reportsService.getMonthWiseReport(filters));
  } catch (err) {
    next(err);
  }
});

router.get('/service-vs-product', async (req, res, next) => {
  try {
    const filters = ReportFiltersQuerySchema.parse(req.query);
    sendData(res, await reportsService.getServiceVsProductReport(filters));
  } catch (err) {
    next(err);
  }
});

router.get('/top-vendors', async (req, res, next) => {
  try {
    const { limit, by, ...filters } = TopVendorsQuerySchema.parse(req.query);
    sendData(res, await reportsService.getTopVendors(filters, by, limit));
  } catch (err) {
    next(err);
  }
});

router.get('/top-products', async (req, res, next) => {
  try {
    const { limit, ...filters } = TopListQuerySchema.parse(req.query);
    sendData(res, await reportsService.getTopProducts(filters, limit));
  } catch (err) {
    next(err);
  }
});

router.get('/top-services', async (req, res, next) => {
  try {
    const { limit, ...filters } = TopListQuerySchema.parse(req.query);
    sendData(res, await reportsService.getTopServices(filters, limit));
  } catch (err) {
    next(err);
  }
});

router.get('/payment-method', async (req, res, next) => {
  try {
    const filters = ReportFiltersQuerySchema.parse(req.query);
    sendData(res, await reportsService.getPaymentMethodReport(filters));
  } catch (err) {
    next(err);
  }
});

export default router;
