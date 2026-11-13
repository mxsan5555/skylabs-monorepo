import { Router } from 'express';
import type { Request } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody, validateQuery } from '../middleware/validate';
import { CustomerPaymentsQuerySchema, FinanceSettingsUpdateSchema } from '../schemas/settlement.schema';
import * as settlementService from '../services/settlement.service';
import { getDisputeAttentionSummary } from '../services/dispute.service';
import { shortOrderNumber } from '../services/notification.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData } from '../lib/http';

/**
 * Super-Admin "Accounts" console — overview totals, the customer-payments ledger view, and
 * Finance Settings (commission/hold-period/completion-OTP config). Finance Settings reuses the
 * existing `system-settings` menu/permission node (no new menu node — see msd-menu.json);
 * everything else is gated on the new `accounts.*` keys.
 */
const router = Router();
router.use(authenticate);

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

router.get('/overview', requirePermission('accounts.overview', 'view'), async (_req, res, next) => {
  try {
    // Additive: `disputeAttention` rides along on the same response — a tiny extension rather
    // than a new endpoint (see getDisputeAttentionSummary's own doc comment for why its
    // blockedAmount is never a second, parallel definition from getAccountsOverview's onHold).
    const [overview, disputeAttention] = await Promise.all([
      settlementService.getAccountsOverview(),
      getDisputeAttentionSummary(),
    ]);
    sendData(res, { ...overview, disputeAttention });
  } catch (err) {
    next(err);
  }
});

router.get(
  '/customer-payments',
  requirePermission('accounts.customer-payments', 'view'),
  validateQuery(CustomerPaymentsQuerySchema),
  async (req, res, next) => {
    try {
      const { page, pageSize, vendorId, search, createdFrom, createdTo } = req.validatedQuery as ReturnType<typeof CustomerPaymentsQuerySchema.parse>;
      const { items, total } = await settlementService.listCustomerPayments({ page, pageSize, vendorId, search, createdFrom, createdTo });
      sendData(
        res,
        items.map((order) => ({
          id: order.id,
          orderNumber: shortOrderNumber(order.id),
          customerName: order.customer.name,
          vendorNameSnapshot: order.vendorNameSnapshot,
          total: order.total,
          status: order.status,
          latestPayment: order.payments[0] ?? null,
          createdAt: order.createdAt,
        })),
        { meta: { total, page, pageSize } },
      );
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/customer-payments/export',
  requirePermission('accounts.customer-payments', 'export'),
  validateQuery(CustomerPaymentsQuerySchema),
  async (req, res, next) => {
    try {
      const { vendorId, search, createdFrom, createdTo } = req.validatedQuery as ReturnType<typeof CustomerPaymentsQuerySchema.parse>;
      const orders = await settlementService.listCustomerPaymentsForExport({ vendorId, search, createdFrom, createdTo });
      const header = 'Order Number,Customer,Vendor,Total,Status,Payment Method,Created At\n';
      const rows = orders
        .map((o) =>
          [
            shortOrderNumber(o.id),
            o.customer.name,
            o.vendorNameSnapshot,
            o.total.toString(),
            o.status,
            o.payments[0]?.provider ?? '',
            o.createdAt.toISOString(),
          ]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(','),
        )
        .join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="customer-payments.csv"');
      res.send(header + rows);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Finance Settings (reuses the `system-settings` menu/permission) ─────────

router.get('/finance-settings', requirePermission('system-settings', 'view'), async (_req, res, next) => {
  try {
    sendData(res, await settlementService.getFinanceSettings());
  } catch (err) {
    next(err);
  }
});

router.put(
  '/finance-settings',
  requirePermission('system-settings', 'edit'),
  validateBody(FinanceSettingsUpdateSchema),
  async (req, res, next) => {
    try {
      const before = await settlementService.getFinanceSettings();
      const updated = await settlementService.updateFinanceSettings(req.user!.sub, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'finance_settings.update',
        targetType: 'FinanceSettings',
        targetId: updated.id,
        before,
        after: updated,
        ...requestMeta(req),
      });
      sendData(res, updated);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
