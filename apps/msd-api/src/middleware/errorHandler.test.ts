import express from 'express';
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { MulterError } from 'multer';
import { ApiError } from '../lib/http';
import { Prisma } from '../generated/prisma-client';
import { errorHandler } from './errorHandler';

/**
 * Direct middleware-level test — builds a minimal Express app per case so each error type can
 * be thrown from a route handler without needing a real Prisma-backed service, matching
 * requirePermission.test.ts's own "stub route" style for testing middleware in isolation.
 */
function appThatThrows(err: unknown) {
  const app = express();
  app.get('/boom', (_req, _res, next) => {
    next(err);
  });
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('maps a plain ApiError to its own code/status (unchanged pre-existing behavior)', async () => {
    const res = await request(appThatThrows(new ApiError('NOT_FOUND', 'Widget not found'))).get('/boom');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ data: null, error: { code: 'NOT_FOUND', message: 'Widget not found', details: undefined } });
  });

  it('maps a MulterError LIMIT_FILE_SIZE to a friendly 422 (unchanged pre-existing behavior)', async () => {
    const err = new MulterError('LIMIT_FILE_SIZE');
    const res = await request(appThatThrows(err)).get('/boom');
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('File is too large.');
  });

  it('maps an unmapped Prisma P2002 (unique constraint) to 409 CONFLICT', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['email'] },
    });
    const res = await request(appThatThrows(err)).get('/boom');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('maps an unmapped Prisma P2025 (record not found) to 404 NOT_FOUND', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('Record not found', { code: 'P2025', clientVersion: 'test' });
    const res = await request(appThatThrows(err)).get('/boom');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('maps an unmapped Prisma P2003 (FK constraint) to 400 BAD_REQUEST', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
      code: 'P2003',
      clientVersion: 'test',
      meta: { field_name: 'vendorId' },
    });
    const res = await request(appThatThrows(err)).get('/boom');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('falls through an unrecognized Prisma error code to the generic 500', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('Something else', { code: 'P2000', clientVersion: 'test' });
    const res = await request(appThatThrows(err)).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('SERVER_ERROR');
  });

  it('falls back to a generic 500 for a plain, unrecognized error', async () => {
    const res = await request(appThatThrows(new Error('boom'))).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('SERVER_ERROR');
    expect(res.body.error.message).toBe('Internal server error');
  });
});
