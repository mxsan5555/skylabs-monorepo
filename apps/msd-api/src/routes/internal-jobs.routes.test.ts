import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});
const runDocumentReminders = vi.fn();
vi.mock('../services/member-reminder.service', () => ({ runDocumentReminders: (...a: unknown[]) => runDocumentReminders(...a) }));

import { env } from '../config/env';
import { createApp } from '../app';
import { CRON_SECRET_HEADER } from '../middleware/requireCronSecret';
import { buildOpenApiDocument } from '../openapi/registry';

const app = createApp();
const SECRET = 'cron-secret-for-tests-0123456789abcdef';
const PATH = '/api/v1/internal/jobs/document-reminders';
const SUMMARY = { checked: 3, sent: 2, failed: 0, flagged: 1, cleared: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  env.cronSecret = SECRET;
  runDocumentReminders.mockResolvedValue(SUMMARY);
});

describe('POST /internal/jobs/document-reminders', () => {
  it('runs one pass and returns the summary for the right secret', async () => {
    const res = await request(app).post(PATH).set(CRON_SECRET_HEADER, SECRET);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(SUMMARY);
    expect(runDocumentReminders).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no secret', undefined],
    ['a wrong secret', 'wrong'],
    ['a secret with one extra character', `${SECRET}x`],
  ])('401 with %s, and the job never runs', async (_label, given) => {
    const req = request(app).post(PATH);
    const res = await (given === undefined ? req : req.set(CRON_SECRET_HEADER, given));
    expect(res.status).toBe(401);
    expect(runDocumentReminders).not.toHaveBeenCalled();
  });

  it('503 while CRON_SECRET is not configured, even with an empty header', async () => {
    env.cronSecret = '';
    const res = await request(app).post(PATH).set(CRON_SECRET_HEADER, '');
    expect(res.status).toBe(503);
    expect(runDocumentReminders).not.toHaveBeenCalled();
  });

  it('is not part of the public API document', () => {
    const paths = Object.keys(buildOpenApiDocument().paths ?? {});
    expect(paths.some((p) => p.includes('/internal/'))).toBe(false);
  });
});
