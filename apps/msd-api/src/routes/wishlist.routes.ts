import { Router } from 'express';

import { authenticate } from '../middleware/authenticate';
import { validateBody, validateParams } from '../middleware/validate';
import { sendData } from '../lib/http';

import {
  WishlistAddItemSchema,
  WishlistDealParamSchema,
  WishlistProductParamSchema,
} from '../schemas/wishlist.schema';

import {
  listWishlist,
  addItem,
  addProductItem,
  removeItem,
  removeProductItem,
  checkWishlisted,
  checkProductWishlisted,
} from '../services/wishlist.service';

const router = Router();

router.use(authenticate);


router.get('/', async (req, res, next) => {
  try {
    const items = await listWishlist(req.user!.sub);

    sendData(res, items);
  } catch (err) {
    next(err);
  }
});


router.post(
  '/',
  validateBody(WishlistAddItemSchema),
  async (req, res, next) => {
    try {
      const customerId = req.user!.sub;

      const item = req.body.dealId
        ? await addItem(
            customerId,
            req.body.dealId,
          )
        : await addProductItem(
            customerId,
            req.body.productId,
          );

      sendData(res, item, {
        status: 201,
      });
    } catch (err) {
      next(err);
    }
  },
);


router.delete(
  '/:dealId',
  validateParams(WishlistDealParamSchema),
  async (req, res, next) => {
    try {
      await removeItem(
        req.user!.sub,
        req.params.dealId,
      );

      sendData(res, {
        removed: true,
      });
    } catch (err) {
      next(err);
    }
  },
);


router.delete(
  '/product/:productId',
  validateParams(WishlistProductParamSchema),
  async (req, res, next) => {
    try {
      await removeProductItem(
        req.user!.sub,
        req.params.productId,
      );

      sendData(res, {
        removed: true,
      });
    } catch (err) {
      next(err);
    }
  },
);



router.get(
  '/check/:dealId',
  validateParams(WishlistDealParamSchema),
  async (req, res, next) => {
    try {
      const result = await checkWishlisted(
        req.user!.sub,
        req.params.dealId,
      );

      sendData(res, result);
    } catch (err) {
      next(err);
    }
  },
);



router.get(
  '/check/product/:productId',
  validateParams(WishlistProductParamSchema),
  async (req, res, next) => {
    try {
      const result = await checkProductWishlisted(
        req.user!.sub,
        req.params.productId,
      );

      sendData(res, result);
    } catch (err) {
      next(err);
    }
  },
);

export default router;