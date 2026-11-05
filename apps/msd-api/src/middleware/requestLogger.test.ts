import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import app from '../app';
import { env } from '../config/env';
import { setLogSink } from '../lib/logger';

let lines: string[] = [];
beforeEach(() => {
  lines = [];
  setLogSink((line) => lines.push(line));
  env.requestLogging = true;
});
afterEach(() => {
  setLogSink(null);
  env.requestLogging = false;
});

const requestLines = () => lines.map((l) => JSON.parse(l)).filter((e) => e.event === 'http.request');

/** P2-10: one log line per request with a request id; no personal data or secret in it. */
describe('request logger', () => {
  it('gives each response an X-Request-Id and logs the request with it', async () => {
    const res = await request(app).get('/api/v1/health');
    const id = res.headers['x-request-id'];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestLines()).toEqual([
      expect.objectContaining({ level: 'info', requestId: id, method: 'GET', path: '/api/v1/health', status: 200 }),
    ]);
    expect(typeof requestLines()[0].durationMs).toBe('number');
  });

  it('keeps a safe incoming request id and replaces an unsafe one', async () => {
    const kept = await request(app).get('/api/v1/health').set('X-Request-Id', 'edge-abc12345');
    expect(kept.headers['x-request-id']).toBe('edge-abc12345');
    const replaced = await request(app).get('/api/v1/health').set('X-Request-Id', 'bad id with "quotes" and spaces');
    expect(replaced.headers['x-request-id']).not.toContain('bad');
  });

  it('never logs the token, an OTP in the query or the request body', async () => {
    await request(app)
      .post('/api/v1/auth/otp/verify?otp=654321')
      .set('Authorization', 'Bearer secret-token-value')
      .send({ identifier: '9876543210', otp: '123456', documentNumber: 'ABCDE1234F' });
    const all = lines.join('\n');
    expect(requestLines()).toHaveLength(1);
    for (const secret of ['secret-token-value', '654321', '123456', 'ABCDE1234F', '9876543210']) {
      expect(all).not.toContain(secret);
    }
  });
});
