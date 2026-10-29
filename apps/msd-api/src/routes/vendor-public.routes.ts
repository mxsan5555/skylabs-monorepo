import { Router } from 'express';
import { vendorPublicRegisterRateLimiter } from '../middleware/rateLimiter';
import { validateBody } from '../middleware/validate';
import { VendorApplicationCreateSchema } from '../schemas/vendor.schema';
import { createVendorApplication } from '../services/vendor-application.service';
import { sendData } from '../lib/http';

const router = Router();

router.post(
  '/register',
  vendorPublicRegisterRateLimiter,
  validateBody(VendorApplicationCreateSchema),
  async (req, res, next) => {
    try {
      const result = await createVendorApplication(req.body);
      sendData(res, result, { status: 201 });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
