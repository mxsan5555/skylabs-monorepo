import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { validateBody, validateParams } from '../middleware/validate';
import { WishlistAddItemSchema, WishlistDealParamSchema } from '../schemas/wishlist.schema';
import * as wishlistService from '../services/wishlist.service';
import { sendData } from '../lib/http';

/**
 * Customer wishlist — self-service only, gated on `authenticate` alone (no `requirePermission`).
 * This mirrors `cart.routes.ts`/`booking.routes.ts`: not a staff/admin module restricted to
 * specific roles, it's a base capability of any signed-in account. `customerId` is always
 * `req.user.sub`, never a param/body value.
 */
const router = Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    sendData(res, await wishlistService.listWishlist(req.user!.sub));
  } catch (err) {
    next(err);
  }
});

router.post('/', validateBody(WishlistAddItemSchema), async (req, res, next) => {
  try {
    sendData(res, await wishlistService.addItem(req.user!.sub, req.body.dealId), { status: 201 });
  } catch (err) {
    next(err);
  }
});

router.get('/check/:dealId', validateParams(WishlistDealParamSchema), async (req, res, next) => {
  try {
    sendData(res, await wishlistService.checkWishlisted(req.user!.sub, req.params.dealId));
  } catch (err) {
    next(err);
  }
});

router.delete('/:dealId', validateParams(WishlistDealParamSchema), async (req, res, next) => {
  try {
    await wishlistService.removeItem(req.user!.sub, req.params.dealId);
    sendData(res, { removed: true });
  } catch (err) {
    next(err);
  }
});

export default router;
