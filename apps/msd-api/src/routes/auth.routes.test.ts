import request from 'supertest';
import bcrypt from 'bcrypt';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

// otp.service now calls real providers (network SMS gateway / SMTP) — mock both so tests
// never hit a live provider. `vi.hoisted` is required since `vi.mock` factories are
// hoisted above normal `const` declarations.
const { sendSmsOtpMock, sendOtpEmailMock } = vi.hoisted(() => ({
  sendSmsOtpMock: vi.fn().mockResolvedValue(true),
  sendOtpEmailMock: vi.fn().mockResolvedValue(true),
}));
vi.mock('../providers/sms/connectExpress.provider', () => ({ sendOtp: sendSmsOtpMock }));
vi.mock('../providers/email/smtp.provider', () => ({ sendOtpEmail: sendOtpEmailMock }));

import app from '../app';
import { prisma } from '../lib/prisma';

const prismaMock = vi.mocked(prisma, true);

const USER_ID = 'cbd1fefc-c00d-4cdc-bfaf-f57b7f425978';
const OTP_CHALLENGE_ID = '3c8ac548-50c2-41ce-83eb-5e5c6249cfd2';

beforeEach(() => {
  vi.clearAllMocks();
  sendSmsOtpMock.mockReset().mockResolvedValue(true);
  sendOtpEmailMock.mockReset().mockResolvedValue(true);
});

describe('POST /api/v1/auth/otp/request', () => {
  it('returns 200 with a generic message for a valid identifier (no user enumeration)', async () => {
    prismaMock.otpChallenge.create.mockResolvedValue({});
    const res = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ identifier: 'happy-path@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.data.message).toMatch(/OTP sent/);
    expect(prismaMock.otpChallenge.create).toHaveBeenCalledOnce();
  });

  it('returns 422 for an identifier shorter than 3 characters', async () => {
    const res = await request(app).post('/api/v1/auth/otp/request').send({ identifier: 'ab' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 422 for an invalid purpose enum value', async () => {
    const res = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ identifier: 'bad-purpose@example.com', purpose: 'not_a_real_purpose' });
    expect(res.status).toBe(422);
  });

  // Edge case: rate limiting — 5/10min per (ip + identifier) per apps/msd-api/.env.local.
  it('returns 429 after exceeding the per-identifier OTP request rate limit', async () => {
    prismaMock.otpChallenge.create.mockResolvedValue({});
    const identifier = 'rate-limited@example.com';
    let lastStatus = 0;
    for (let i = 0; i < 6; i++) {
      const res = await request(app).post('/api/v1/auth/otp/request').send({ identifier });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});

describe('POST /api/v1/auth/otp/verify', () => {
  const identifier = 'verify-happy@example.com';

  function mockPendingChallenge(overrides: Partial<{ attempts: number; expiresAt: Date; hashedOtp: string }> = {}) {
    prismaMock.otpChallenge.findFirst.mockResolvedValue({
      id: OTP_CHALLENGE_ID,
      identifier,
      attempts: 0,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      hashedOtp: '$2b$10$invalidPlaceholderHashForMismatchTests..................',
      ...overrides,
    });
  }

  it('returns 200 with access/refresh tokens on a correct OTP (happy path)', async () => {
    const realOtp = '123456';
    const hashedOtp = await bcrypt.hash(realOtp, 10);
    mockPendingChallenge({ hashedOtp });
    prismaMock.otpChallenge.update.mockResolvedValue({});
    prismaMock.user.upsert.mockResolvedValue({
      id: USER_ID,
      name: identifier,
      email: identifier,
      phone: null,
      roles: [{ role: { key: 'customer' } }],
    });
    prismaMock.userRole.findMany.mockResolvedValue([{ role: { key: 'customer' } }]);
    prismaMock.loginHistory.create.mockResolvedValue({});
    prismaMock.refreshSession.create.mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ identifier, otp: realOtp });

    expect(res.status).toBe(200);
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(typeof res.body.data.refreshToken).toBe('string');
    expect(res.body.data.user.email).toBe(identifier);
  });

  it('returns 422 when the OTP is not exactly 6 digits', async () => {
    const res = await request(app).post('/api/v1/auth/otp/verify').send({ identifier, otp: '123' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 for a wrong OTP code', async () => {
    mockPendingChallenge();
    prismaMock.otpChallenge.update.mockResolvedValue({});
    const res = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ identifier, otp: '000000' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toMatch(/Incorrect OTP/);
    // Wrong attempt increments the counter.
    expect(prismaMock.otpChallenge.update).toHaveBeenCalledWith({
      where: { id: OTP_CHALLENGE_ID },
      data: { attempts: { increment: 1 } },
    });
  });

  it('returns 401 when the OTP challenge has expired', async () => {
    mockPendingChallenge({ expiresAt: new Date(Date.now() - 1000) });
    const res = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ identifier, otp: '123456' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/expired/);
  });

  it('returns 429 once the max incorrect-attempt count has been reached', async () => {
    mockPendingChallenge({ attempts: 5 }); // env.otpMaxAttempts is 5
    const res = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ identifier, otp: '123456' });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('returns 401 when there is no pending OTP challenge for the identifier', async () => {
    prismaMock.otpChallenge.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ identifier: 'never-requested@example.com', otp: '123456' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/No pending OTP/);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('returns 422 when refreshToken is missing/too short', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: 'short' });
    expect(res.status).toBe(422);
  });

  it('returns 401 when the refresh token does not match any active session', async () => {
    prismaMock.refreshSession.findMany.mockResolvedValue([]);
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'a-refresh-token-that-is-long-enough' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('returns 401 with no bearer token even with a valid-shaped body', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: 'a-refresh-token-that-is-long-enough' });
    expect(res.status).toBe(401);
  });
});
