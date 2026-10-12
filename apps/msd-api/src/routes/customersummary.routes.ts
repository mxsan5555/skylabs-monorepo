import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { getMyDashboardSummary } from '../services/customersummary.service';
import { sendData } from '../lib/http';

const router = Router();

router.get('/dashboard-summary', authenticate, async (req, res, next) => {
  try {
    const summary = await getMyDashboardSummary(req.user!.sub);

    sendData(res, summary);
  } catch (err) {
    next(err);
  }
});

export default router;