import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { validateBody, validateParams } from '../middleware/validate';
import { UuidParamSchema } from '../schemas/common.schema';
import { CartAddItemSchema, CartUpdateItemSchema } from '../schemas/cart.schema';
import * as cartService from '../services/cart.service';
import { sendData } from '../lib/http';

/**
 * Customer product cart — self-service only, gated on `authenticate` alone (no
 * `requirePermission`). This mirrors the existing `/wishlist` and `/checkout` frontend routes,
 * which only require `RequireAuth` today: Cart isn't a staff/admin module restricted to
 * specific roles, it's a base capability of any signed-in account. `customerId` is always
 * `req.user.sub`, exactly like `Vendor.ownerUserId` resolution — never a param/body value.
 */
const router = Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    sendData(res, await cartService.getOrCreateCart(req.user!.sub));
  } catch (err) {
    next(err);
  }
});

router.post('/items', validateBody(CartAddItemSchema), async (req, res, next) => {
  try {
    sendData(res, await cartService.addItem(req.user!.sub, req.body), { status: 201 });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/items/:id',
  validateParams(UuidParamSchema),
  validateBody(CartUpdateItemSchema),
  async (req, res, next) => {
    try {
      sendData(res, await cartService.updateItemQuantity(req.user!.sub, req.params.id, req.body.quantity));
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/items/:id', validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    sendData(res, await cartService.removeItem(req.user!.sub, req.params.id));
  } catch (err) {
    next(err);
  }
});

router.delete('/', async (req, res, next) => {
  try {
    sendData(res, await cartService.clearCart(req.user!.sub));
  } catch (err) {
    next(err);
  }
});

export default router;
