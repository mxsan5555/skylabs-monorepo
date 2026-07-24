import express, { type Express } from 'express';
import cors from 'cors';
import { env } from './env';
import { passport } from './lib/passport-google';
import { authRouter } from './routes/auth/auth.routes';
import { meRouter } from './routes/me/me.routes';
import { addressesRouter } from './routes/me/addresses.routes';
import { wishlistRouter } from './routes/me/wishlist.routes';
import { adminUsersRouter } from './routes/me/admin-users.routes';
import { categoriesRouter, adminCategoriesRouter } from './routes/categories/categories.routes';
import { featuresRouter, adminFeaturesRouter } from './routes/features/features.routes';
import { cancellationPoliciesRouter } from './routes/cancellation-policies/cancellation-policies.routes';
import { companiesRouter, adminCompaniesRouter } from './routes/companies/companies.routes';
import { dealsRouter, adminDealsRouter } from './routes/deals/deals.routes';
import { cartRouter } from './routes/cart/cart.routes';
import { checkoutRouter } from './routes/checkout/checkout.routes';
import { ordersRouter, adminOrdersRouter } from './routes/orders/orders.routes';
import { paymentsRouter, handleRazorpayWebhook } from './routes/payments/payments.routes';
import { promoCodesRouter } from './routes/promo-codes/promo-codes.routes';
import { adminGiftCardsRouter, cartGiftCardRouter } from './routes/gift-cards/gift-cards.routes';
import { cancellationsRouter, adminCancellationsRouter } from './routes/orders/cancellations.routes';
import { reviewsRouter, meReviewsRouter, reviewReportsRouter, adminReviewsRouter } from './routes/reviews/reviews.routes';
import { publicSupportRouter, meTicketsRouter, adminSupportRouter } from './routes/support/support.routes';
import { contentRouter, adminContentRouter } from './routes/content/content.routes';
import { mountDocs } from './lib/openapi-registry';
import { errorHandler } from './middleware/error-handler';

export function createApp(): Express {
  const app = express();

  app.use(cors({ origin: env.frontendUrl, exposedHeaders: ['X-Guest-Token'] }));

  // Razorpay webhook signature is computed over the raw body, so it must be mounted
  // with express.raw() *before* the global express.json() below touches this path.
  app.post('/api/payments/webhook/razorpay', express.raw({ type: 'application/json' }), handleRazorpayWebhook);

  app.use(express.json());
  app.use(passport.initialize());

  app.get('/api', (_req, res) => res.json({ message: 'Welcome to msd-api!' }));
  app.use('/api/auth', authRouter);
  app.use('/api/me', meRouter);
  app.use('/api/me', addressesRouter);
  app.use('/api/me', wishlistRouter);
  app.use('/api', adminUsersRouter);
  app.use('/api', categoriesRouter);
  app.use('/api', adminCategoriesRouter);
  app.use('/api', featuresRouter);
  app.use('/api', adminFeaturesRouter);
  app.use('/api', cancellationPoliciesRouter);
  app.use('/api', companiesRouter);
  app.use('/api', adminCompaniesRouter);
  app.use('/api', dealsRouter);
  app.use('/api', adminDealsRouter);
  app.use('/api', cartRouter);
  app.use('/api', checkoutRouter);
  app.use('/api', ordersRouter);
  app.use('/api', adminOrdersRouter);
  app.use('/api', paymentsRouter);
  app.use('/api', promoCodesRouter);
  app.use('/api', adminGiftCardsRouter);
  app.use('/api', cartGiftCardRouter);
  app.use('/api', cancellationsRouter);
  app.use('/api', adminCancellationsRouter);
  app.use('/api', reviewsRouter);
  app.use('/api/me', meReviewsRouter);
  app.use('/api', reviewReportsRouter);
  app.use('/api', adminReviewsRouter);
  app.use('/api', publicSupportRouter);
  app.use('/api/me', meTicketsRouter);
  app.use('/api', adminSupportRouter);
  app.use('/api', contentRouter);
  app.use('/api', adminContentRouter);

  mountDocs(app);

  app.use(errorHandler);

  return app;
}
