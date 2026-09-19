import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import { loginWithIdentifier, loginWithGoogle } from './auth.service';
import { ApiError } from '../lib/http';

const prismaMock = vi.mocked(prisma, true);

const USER_ID = 'a0a0a0a0-0000-4000-8000-000000000001';
const CUSTOMER_ROLE = { id: 'role-customer', key: 'customer', name: 'Customer' };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.refreshSession.create.mockResolvedValue({});
  prismaMock.loginHistory.create.mockResolvedValue({});
});

/**
 * Feature: Login blocked for an existing inactive/suspended account
 * Scenario: `loginWithIdentifier`/`loginWithGoogle` gained a pre-check (`assertUserMayLogIn`)
 * that rejects any EXISTING user whose status isn't `active`, before a token is issued and before
 * `lastLoginAt`/`googleId` is touched. A brand-new (first-ever) identifier is never subject to
 * this check — it always defaults to `active`.
 *
 * Given: a returning user whose account was deactivated/suspended since their last login
 * When: they attempt to log in again (OTP identifier or Google)
 * Then: FORBIDDEN is thrown before any token/session is created, `user.upsert`/`user.update` for
 *       lastLoginAt is never reached, and a failed LoginHistory row is written
 *
 * Edge cases:
 * - a brand-new identifier (no existing row) always succeeds — the check is a no-op for signup
 * - an active existing user logs in normally (regression)
 */
describe('loginWithIdentifier — blocked account pre-check', () => {
  it('rejects an inactive existing user with FORBIDDEN before issuing any token, and never touches lastLoginAt', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID, status: 'inactive' });

    await expect(loginWithIdentifier('blocked@example.com', { ip: '1.1.1.1' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'This account has been disabled. Please contact support.',
    });

    expect(prismaMock.user.upsert).not.toHaveBeenCalled();
    expect(prismaMock.refreshSession.create).not.toHaveBeenCalled();
  });

  it('rejects a blocked (suspended) existing user the same way', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID, status: 'blocked' });

    await expect(loginWithIdentifier('suspended@example.com')).rejects.toBeInstanceOf(ApiError);
    expect(prismaMock.user.upsert).not.toHaveBeenCalled();
  });

  it('writes a failed (success: false) LoginHistory row for a blocked login attempt', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID, status: 'blocked' });

    await expect(loginWithIdentifier('suspended@example.com')).rejects.toThrow();

    expect(prismaMock.loginHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: USER_ID, success: false }) }),
    );
  });

  it('a brand-new identifier (no existing row) is never subject to the block — signup succeeds normally', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null); // no existing row
    prismaMock.user.upsert.mockResolvedValue({
      id: USER_ID,
      name: 'new@example.com',
      email: 'new@example.com',
      phone: null,
      roles: [],
    });
    prismaMock.userRole.findMany.mockResolvedValue([{ role: CUSTOMER_ROLE }]);
    prismaMock.role.findUnique.mockResolvedValue(CUSTOMER_ROLE);
    prismaMock.userRole.create.mockResolvedValue({});

    const result = await loginWithIdentifier('new@example.com');

    expect(result.accessToken).toBeTruthy();
    expect(prismaMock.loginHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ success: true }) }),
    );
  });

  it('an active existing user logs in normally (regression)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID, status: 'active' });
    prismaMock.user.upsert.mockResolvedValue({
      id: USER_ID,
      name: 'Active User',
      email: 'active@example.com',
      phone: null,
      roles: [{ role: CUSTOMER_ROLE }],
    });
    prismaMock.userRole.findMany.mockResolvedValue([{ role: CUSTOMER_ROLE }]);

    const result = await loginWithIdentifier('active@example.com');

    expect(result.accessToken).toBeTruthy();
    expect(prismaMock.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ lastLoginAt: expect.any(Date) }) }),
    );
  });
});

describe('loginWithGoogle — blocked account pre-check', () => {
  it('rejects an inactive existing user with FORBIDDEN before touching googleId/lastLoginAt', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID, status: 'inactive', email: 'blocked@example.com' });

    await expect(loginWithGoogle('google-sub-1', 'blocked@example.com', 'Blocked User')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('writes a failed LoginHistory row (method: google) for a blocked attempt', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID, status: 'blocked', email: 'blocked@example.com' });

    await expect(loginWithGoogle('google-sub-1', 'blocked@example.com', 'Blocked User')).rejects.toThrow();

    expect(prismaMock.loginHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ method: 'google', success: false }) }),
    );
  });

  it('a brand-new Google profile (no existing row) always succeeds — never subject to the block', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: USER_ID,
      name: 'New Google User',
      email: 'newgoogle@example.com',
      phone: null,
    });
    prismaMock.userRole.findMany.mockResolvedValue([{ role: CUSTOMER_ROLE }]);
    prismaMock.role.findUnique.mockResolvedValue(CUSTOMER_ROLE);
    prismaMock.userRole.create.mockResolvedValue({});

    const result = await loginWithGoogle('google-sub-2', 'newgoogle@example.com', 'New Google User');
    expect(result.accessToken).toBeTruthy();
  });

  it('an active existing user logs in normally via Google (regression)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID, status: 'active', email: 'active@example.com', name: 'Active User' });
    prismaMock.user.update.mockResolvedValue({ id: USER_ID, name: 'Active User', email: 'active@example.com', phone: null });
    prismaMock.userRole.findMany.mockResolvedValue([{ role: CUSTOMER_ROLE }]);

    const result = await loginWithGoogle('google-sub-3', 'active@example.com', 'Active User');
    expect(result.accessToken).toBeTruthy();
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ googleId: 'google-sub-3' }) }),
    );
  });
});
