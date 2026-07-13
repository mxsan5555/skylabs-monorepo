import express, { type Express } from 'express';
import cors from 'cors';
import { env } from './env';
import { passport } from './lib/passport-google';
import { authRouter } from './routes/auth/auth.routes';
import { meRouter } from './routes/me/me.routes';
import { mountDocs } from './lib/openapi-registry';
import { errorHandler } from './middleware/error-handler';

export function createApp(): Express {
  const app = express();

  app.use(cors({ origin: env.frontendUrl }));
  app.use(express.json());
  app.use(passport.initialize());

  app.get('/api', (_req, res) => res.json({ message: 'Welcome to msd-api!' }));
  app.use('/api/auth', authRouter);
  app.use('/api/me', meRouter);

  mountDocs(app);

  app.use(errorHandler);

  return app;
}
