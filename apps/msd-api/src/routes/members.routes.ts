import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { buildMemberAdminRoutes } from './member-admin.routes';

const router = Router();
router.use(authenticate);
router.use(buildMemberAdminRoutes({ deprecated: false }));

export default router;
