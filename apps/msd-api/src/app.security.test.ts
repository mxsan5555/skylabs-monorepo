import request from 'supertest';
import jwt from 'jsonwebtoken';
import { describe, it, expect, vi } from 'vitest';

vi.mock('./lib/prisma', async () => {
  const { createPrismaMock } = await import('./test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import app from './app';
import { env } from './config/env';

describe('HTTP hardening', () => {
  it('sends security headers and hides the framework', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('rejects a JSON body over 100 kb with 413', async () => {
    const res = await request(app)
      .post('/api/v1/auth/otp/verify')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ identifier: 'a'.repeat(110 * 1024), otp: '123456' }));
    expect(res.status).toBe(413);
  });

  it('refuses an access token signed with a different algorithm', async () => {
    const token = jwt.sign({ sub: 'u1', roles: ['admin'], app: 'msd' }, env.jwtSecret, { algorithm: 'HS512' });
    const res = await request(app).get('/api/v1/rbac/bootstrap').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});
