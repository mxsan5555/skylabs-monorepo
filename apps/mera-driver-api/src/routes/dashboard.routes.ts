import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { accountDashboard } from '../services/dashboard.service';
const router=Router();
router.get('/',authenticate,requirePermission('dashboard','view'),async(req,res,next)=>{
  try {res.setHeader('Cache-Control','private, no-store');res.json({data:await accountDashboard(req),error:null});}catch(error){next(error);}
});
export default router;
