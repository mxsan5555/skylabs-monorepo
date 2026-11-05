import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { validateBody } from '../middleware/validate';
import { sendData } from '../lib/http';
import { createSupportRequest , getSupportRequests} from '../services/support.service';
import { SupportRequestSchema } from '../schemas/support.schema';

const router = Router();

router.post(
  '/',
  authenticate,
  validateBody(SupportRequestSchema),
  async (req, res, next) => {
    try {
      const supportRequest = await createSupportRequest(
        req.user!.sub,
        req.body,
      );

      sendData(res, supportRequest, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);


router.get(
  '/',
  authenticate,
  async (req, res, next) => {
    try {
      const supportRequests = await getSupportRequests(
        req.user!.sub,
      );

      sendData(res, supportRequests);
    } catch (err) {
      next(err);
    }
  },
);

export default router;