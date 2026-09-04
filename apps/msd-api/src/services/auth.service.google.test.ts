import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import { loginWithGoogle } from './auth.service';
import { decodeJwtPayload } from '@skylabs-monorepo/shared-auth';

const prismaMock = vi.mocked(prisma, true);

const CUSTOMER_ROLE = { id: 'role-customer', key: 'customer', name: 'Customer' };

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Real Google OAuth requires a live client ID/secret registered with Google and a browser
 * redirect through Google's consent screen — neither is available in this environment
 * (GOOGLE_CLIENT_ID/SECRET are unset in .env.local). This exercises the exact same service
 * function `passport.ts`'s strategy callback calls once Google returns a verified profile,
 * so it verifies everything downstream of "Google confirmed this email" without needing a
 * live OAuth handshake: user creation/linking, default role assignment, JWT issuance,
 * refresh session issuance, and login-history recording.
 */
describe('loginWithGoogle', () => {
  it('creates a new user, assigns the default customer role, and issues tokens + login history', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: 'new-user-id',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: null,
    });
    prismaMock.userRole.findMany
      .mockResolvedValueOnce([]) // no roles yet
      .mockResolvedValueOnce([{ role: CUSTOMER_ROLE }]); // after assigning default
    prismaMock.role.findUnique.mockResolvedValue(CUSTOMER_ROLE);
    prismaMock.userRole.create.mockResolvedValue({});
    prismaMock.refreshSession.create.mockResolvedValue({});
    prismaMock.loginHistory.create.mockResolvedValue({});

    const result = await loginWithGoogle('google-sub-123', 'ada@example.com', 'Ada Lovelace');

    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ googleId: 'google-sub-123', email: 'ada@example.com', name: 'Ada Lovelace' }),
    });
    expect(prismaMock.role.findUnique).toHaveBeenCalledWith({ where: { key: 'customer' } });
    expect(prismaMock.userRole.create).toHaveBeenCalledWith({
      data: { userId: 'new-user-id', roleId: 'role-customer' },
    });

    const payload = decodeJwtPayload<{ sub: string; roles: string[]; app: string }>(result.accessToken);
    expect(payload?.sub).toBe('new-user-id');
    expect(payload?.roles).toEqual(['customer']);
    expect(payload?.app).toBe('msd');

    expect(typeof result.refreshToken).toBe('string');
    expect(result.refreshToken.length).toBeGreaterThan(0);
    expect(prismaMock.refreshSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'new-user-id' }),
    });

    expect(prismaMock.loginHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'new-user-id', method: 'google', success: true }),
    });

    expect(result.user).toEqual(
      expect.objectContaining({ id: 'new-user-id', email: 'ada@example.com', roles: ['customer'] }),
    );
  });

  it('links to an existing user by email instead of creating a duplicate, and does not re-assign a role that already exists', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'existing-user-id',
      name: 'Existing Name',
      email: 'existing@example.com',
      phone: '+911234567890',
    });
    prismaMock.user.update.mockResolvedValue({
      id: 'existing-user-id',
      name: 'Existing Name',
      email: 'existing@example.com',
      phone: '+911234567890',
    });
    prismaMock.userRole.findMany.mockResolvedValue([{ role: CUSTOMER_ROLE }]); // already has a role
    prismaMock.refreshSession.create.mockResolvedValue({});
    prismaMock.loginHistory.create.mockResolvedValue({});

    const result = await loginWithGoogle('google-sub-999', 'existing@example.com', 'New Display Name');

    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'existing-user-id' },
      data: expect.objectContaining({ googleId: 'google-sub-999', name: 'Existing Name' }),
    });
    expect(prismaMock.role.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.userRole.create).not.toHaveBeenCalled();

    const payload = decodeJwtPayload<{ sub: string }>(result.accessToken);
    expect(payload?.sub).toBe('existing-user-id');
    expect(prismaMock.loginHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'existing-user-id', method: 'google', success: true }),
    });
  });
});
