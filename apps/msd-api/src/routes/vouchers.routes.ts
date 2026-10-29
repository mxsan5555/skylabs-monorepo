import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { documentUpload } from '../lib/media-upload.middleware';
import {
  VoucherCodeParamSchema,
  VoucherVerifySchema,
  VoucherCompleteSchema,
  VoucherShipSchema,
  VoucherDeliveryEvidenceSchema,
  VoucherQueueQuerySchema,
} from '../schemas/voucher.schema';
import * as voucherService from '../services/voucher.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData, ApiError } from '../lib/http';

/**
 * Member-only Purchase Verification surface — voucher lookup + the Start/OTP/Complete/Ship/
 * Evidence actions. Gated on `vendor-portal.orders:custom` the whole router through (same
 * self-service plumbing gate `/vendors/me/*` uses — see seed.ts's `EXTRA_ACTIONS_BY_MENU_KEY`
 * doc comment), never `vendor-portal.orders:view` alone. Lives on the same page/route as the
 * existing vendor-portal Orders screen (`business-order` menu node) — no new menu node.
 */
const router = Router();
router.use(authenticate, requirePermission('vendor-portal.orders', 'custom'));

router.post('/verify', validateBody(VoucherVerifySchema), async (req, res, next) => {
  try {
    sendData(res, await voucherService.verifyVoucher(req.user!.sub, req.body.code));
  } catch (err) {
    next(err);
  }
});

/**
 * Service Queue — the caller's own vendor's PurchaseEntitlement rows, paginated/searchable (see
 * voucher.service.ts#listMyVoucherQueue). Same single router-wide gate as every other route
 * here — no new permission key.
 */
router.get('/queue', validateQuery(VoucherQueueQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize, search } = req.validatedQuery as ReturnType<typeof VoucherQueueQuerySchema.parse>;
    const { items, total } = await voucherService.listMyVoucherQueue(req.user!.sub, { page, pageSize, search });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.post('/:code/start', validateParams(VoucherCodeParamSchema), async (req, res, next) => {
  try {
    const entitlement = await voucherService.startService(req.user!.sub, req.params.code);
    await writeAuditLog({ actorUserId: req.user!.sub, action: 'voucher.start', targetType: 'PurchaseEntitlement', targetId: entitlement.id, after: entitlement });
    sendData(res, entitlement);
  } catch (err) {
    next(err);
  }
});

router.post('/:code/request-completion-otp', validateParams(VoucherCodeParamSchema), async (req, res, next) => {
  try {
    await voucherService.requestCompletionOtp(req.user!.sub, req.params.code);
    sendData(res, { requested: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:code/complete', validateParams(VoucherCodeParamSchema), validateBody(VoucherCompleteSchema), async (req, res, next) => {
  try {
    const entitlement = await voucherService.completeVoucher(req.user!.sub, req.params.code, req.body.otp);
    await writeAuditLog({ actorUserId: req.user!.sub, action: 'voucher.complete', targetType: 'PurchaseEntitlement', targetId: entitlement.id, after: entitlement });
    sendData(res, entitlement);
  } catch (err) {
    next(err);
  }
});

router.post('/:code/ship', validateParams(VoucherCodeParamSchema), validateBody(VoucherShipSchema), async (req, res, next) => {
  try {
    const entitlement = await voucherService.shipProduct(req.user!.sub, req.params.code, req.body);
    await writeAuditLog({ actorUserId: req.user!.sub, action: 'voucher.ship', targetType: 'PurchaseEntitlement', targetId: entitlement.id, after: entitlement });
    sendData(res, entitlement);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:code/record-delivery-evidence',
  validateParams(VoucherCodeParamSchema),
  documentUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError('VALIDATION_ERROR', 'A delivery evidence photo is required');
      const { note } = VoucherDeliveryEvidenceSchema.parse({ note: req.body.note });
      const entitlement = await voucherService.recordDeliveryEvidence(
        req.user!.sub,
        req.params.code,
        { buffer: req.file.buffer, originalname: req.file.originalname },
        note,
      );
      await writeAuditLog({ actorUserId: req.user!.sub, action: 'voucher.record_delivery_evidence', targetType: 'PurchaseEntitlement', targetId: entitlement.id, after: entitlement });
      sendData(res, entitlement);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
