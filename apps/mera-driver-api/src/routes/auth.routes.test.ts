import request from 'supertest';
import bcrypt from 'bcryptjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockPrisma, resetPrismaMock } from '../test-utils/prisma-mock';

vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

// otp.service now calls real providers (network/SMTP) — mock both so tests never hit a
// live SMS gateway or mail server. `vi.hoisted` is required since `vi.mock` factories are
// hoisted above normal `const` declarations.
const { sendSmsOtpMock, sendOtpEmailMock } = vi.hoisted(() => ({
  sendSmsOtpMock: vi.fn().mockResolvedValue(true),
  sendOtpEmailMock: vi.fn().mockResolvedValue(true),
}));
vi.mock('../providers/sms/connectExpress.provider', () => ({ sendOtp: sendSmsOtpMock }));
vi.mock('../providers/email/smtp.provider', () => ({ sendOtpEmail: sendOtpEmailMock }));

// Imported after the mocks so auth.routes -> otp.service/auth.service/token.service
// all resolve against the mocked Prisma client and provider modules.
import { app } from '../app';
import { signAccessToken } from '../lib/jwt';

const IDENTIFIER = 'driver@example.com';
const KNOWN_OTP = '123456';

function futureDate(minutes = 10) {
  return new Date(Date.now() + minutes * 60_000);
}

async function seedOtpChallenge(overrides: Partial<Record<string, unknown>> = {}) {
  const hashedOtp = await bcrypt.hash(KNOWN_OTP, 10);
  mockPrisma.otpChallenge.findFirst.mockResolvedValue({
    id: 'otp-1',
    identifier: IDENTIFIER,
    purpose: 'login',
    hashedOtp,
    attempts: 0,
    verifiedAt: null,
    expiresAt: futureDate(),
    createdAt: new Date(),
    ...overrides,
  });
}

describe('auth.routes', () => {
  beforeEach(() => {
    resetPrismaMock();
    mockPrisma.otpChallenge.create.mockResolvedValue({ id: 'otp-1' });
    mockPrisma.otpChallenge.update.mockResolvedValue({});
    sendSmsOtpMock.mockReset().mockResolvedValue(true);
    sendOtpEmailMock.mockReset().mockResolvedValue(true);
  });

  // -------------------------------------------------------------------------
  // POST /auth/otp/request
  // -------------------------------------------------------------------------

  describe('POST /auth/otp/request', () => {
    it('returns 200 and the same generic message for a real identifier', async () => {
      const res = await request(app).post('/auth/otp/request').send({ identifier: IDENTIFIER, purpose: 'login' });
      expect(res.status).toBe(200);
      expect(res.body.data.message).toMatch(/OTP has been sent/i);
      expect(mockPrisma.otpChallenge.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ identifier: IDENTIFIER, purpose: 'login' }) }),
      );
    });

    it('returns the identical response shape for an identifier that does not belong to any user (anti-enumeration)', async () => {
      const res = await request(app)
        .post('/auth/otp/request')
        .send({ identifier: 'nobody@example.com', purpose: 'login' });
      expect(res.status).toBe(200);
      expect(res.body.data.message).toMatch(/OTP has been sent/i);
    });

    it('routes an email identifier through the email provider, not the SMS provider', async () => {
      await request(app).post('/auth/otp/request').send({ identifier: IDENTIFIER, purpose: 'login' });
      expect(sendOtpEmailMock).toHaveBeenCalledWith(IDENTIFIER, expect.any(String));
      expect(sendSmsOtpMock).not.toHaveBeenCalled();
    });

    it('routes a phone identifier through the SMS provider, not the email provider', async () => {
      await request(app).post('/auth/otp/request').send({ identifier: '7234882093', purpose: 'login' });
      expect(sendSmsOtpMock).toHaveBeenCalledWith('7234882093', expect.any(String));
      expect(sendOtpEmailMock).not.toHaveBeenCalled();
    });

    it('returns 500 when the delivery provider reports failure', async () => {
      sendOtpEmailMock.mockResolvedValue(false);
      const res = await request(app).post('/auth/otp/request').send({ identifier: IDENTIFIER, purpose: 'login' });
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('SERVER_ERROR');
    });

    it('returns 422 when identifier is missing/too short', async () => {
      const res = await request(app).post('/auth/otp/request').send({ identifier: 'ab' });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 422 for an invalid purpose enum value', async () => {
      const res = await request(app)
        .post('/auth/otp/request')
        .send({ identifier: IDENTIFIER, purpose: 'not-a-real-purpose' });
      expect(res.status).toBe(422);
    });
  });

  // -------------------------------------------------------------------------
  // POST /auth/otp/verify
  // -------------------------------------------------------------------------

  describe('POST /auth/otp/verify', () => {
    it('returns 422 when the request body is missing the otp field', async () => {
      const res = await request(app).post('/auth/otp/verify').send({ identifier: IDENTIFIER });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('issues a token pair for the correct code (happy path, new user)', async () => {
      await seedOtpChallenge();
      mockPrisma.user.findFirst.mockResolvedValue(null); // no existing user -> create one
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: IDENTIFIER,
        phone: null,
        name: IDENTIFIER,
      });
      mockPrisma.role.findUnique.mockResolvedValue(null); // default-role seed not run — service tolerates this
      mockPrisma.userRole.findMany.mockResolvedValue([]);
      mockPrisma.refreshSession.create.mockResolvedValue({ id: 'session-1' });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.loginHistory.create.mockResolvedValue({});

      const res = await request(app)
        .post('/auth/otp/verify')
        .send({ identifier: IDENTIFIER, otp: KNOWN_OTP, purpose: 'login' });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toEqual(expect.any(String));
      expect(res.body.data.refreshToken).toEqual(expect.any(String));
      expect(res.body.data.user).toEqual(
        expect.objectContaining({ id: 'user-1', email: IDENTIFIER, roles: [] }),
      );
      // The challenge is marked verified, not deleted.
      expect(mockPrisma.otpChallenge.update).toHaveBeenCalledWith({
        where: { id: 'otp-1' },
        data: { verifiedAt: expect.any(Date) },
      });
    });

    it('returns 422 and increments attempts for the wrong code', async () => {
      await seedOtpChallenge({ attempts: 0 });
      mockPrisma.user.findFirst.mockResolvedValue(null); // route's failure-path re-lookup

      const res = await request(app)
        .post('/auth/otp/verify')
        .send({ identifier: IDENTIFIER, otp: '000000', purpose: 'login' });

      expect(res.status).toBe(422);
      expect(res.body.error.message).toMatch(/invalid or has expired/i);
      expect(mockPrisma.otpChallenge.update).toHaveBeenCalledWith({
        where: { id: 'otp-1' },
        data: { attempts: { increment: 1 } },
      });
    });

    it('returns 422 when no unexpired challenge exists (expired or never requested)', async () => {
      mockPrisma.otpChallenge.findFirst.mockResolvedValue(null);
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .post('/auth/otp/verify')
        .send({ identifier: IDENTIFIER, otp: KNOWN_OTP, purpose: 'login' });

      expect(res.status).toBe(422);
      expect(res.body.error.message).toMatch(/invalid or has expired/i);
    });

    it('returns 422 without checking the code once attempts are exhausted', async () => {
      await seedOtpChallenge({ attempts: 5 }); // OTP_MAX_ATTEMPTS default is 5
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .post('/auth/otp/verify')
        .send({ identifier: IDENTIFIER, otp: KNOWN_OTP, purpose: 'login' });

      expect(res.status).toBe(422);
      expect(res.body.error.message).toMatch(/too many attempts/i);
      // Attempts-exhausted short-circuits before ever calling bcrypt.compare / update.
      expect(mockPrisma.otpChallenge.update).not.toHaveBeenCalled();
    });

    it('records a failed login-history entry for an existing user on a wrong code', async () => {
      await seedOtpChallenge();
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1', email: IDENTIFIER, phone: null });
      mockPrisma.loginHistory.create.mockResolvedValue({});

      const res = await request(app)
        .post('/auth/otp/verify')
        .send({ identifier: IDENTIFIER, otp: '000000', purpose: 'login' });

      expect(res.status).toBe(422);
      expect(mockPrisma.loginHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1', success: false }) }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // POST /auth/refresh, /auth/logout, /auth/logout-all — quick coverage per the
  // "every endpoint: success + 401/validation" rule.
  // -------------------------------------------------------------------------

  describe('POST /auth/refresh', () => {
    it('returns 422 when refreshToken is missing/too short', async () => {
      const res = await request(app).post('/auth/refresh').send({ refreshToken: 'short' });
      expect(res.status).toBe(422);
    });

    it('returns 401 for a refresh token with no matching session', async () => {
      mockPrisma.refreshSession.findUnique.mockResolvedValue(null);
      const res = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: 'a'.repeat(48) });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/logout-all', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app).post('/auth/logout-all');
      expect(res.status).toBe(401);
    });

    it('revokes every session for an authenticated caller', async () => {
      mockPrisma.refreshSession.updateMany.mockResolvedValue({ count: 2 });
      const token = signAccessToken({ sub: 'user-1', roles: ['driver'], app: 'mera-driver' });
      const res = await request(app).post('/auth/logout-all').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(mockPrisma.refreshSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'user-1' }) }),
      );
    });
  });
});
