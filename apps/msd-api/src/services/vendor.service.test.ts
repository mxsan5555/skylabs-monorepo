import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import { createVendorOwner, checkVendorOwnerAvailability } from './vendor.service';

const prismaMock = vi.mocked(prisma, true);

const USER_A_ID = 'a0a0a0a0-0000-4000-8000-000000000001';
const USER_B_ID = 'b0b0b0b0-0000-4000-8000-000000000002';
const NEW_USER_ID = 'd0d0d0d0-0000-4000-8000-000000000004';

function userFixture(overrides: Partial<{ id: string }> = {}) {
  return { id: USER_A_ID, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Feature: Vendor owner is always a brand-new User
 * Scenario: `createVendorOwner` rejects outright — never reuses, never merges — if EITHER the
 * email or the phone already belongs to any existing User, including the case where both belong
 * to the very same existing User (e.g. an existing Customer supplying their own details). Only
 * when neither identifier matches anything does it create a fresh User.
 *
 * Given: an email and/or phone typed into "Add Vendor"/"Become a Vendor"
 * When: `createVendorOwner` is called
 * Then: a brand-new User is created only if neither identifier is already taken; any match at
 *       all — partial or full, same user or different users — rejects with CONFLICT
 *
 * Edge cases:
 * - neither email nor phone given is a validation error
 * - the new User is created with only name/email/phone — no status/role set at creation
 */
describe('createVendorOwner', () => {
  it('creates a brand-new User with only name/email/phone set when neither identifier matches anything', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: NEW_USER_ID });

    const userId = await createVendorOwner('new@example.com', '9000000000', 'New Owner');

    expect(userId).toBe(NEW_USER_ID);
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: { name: 'New Owner', email: 'new@example.com', phone: '9000000000' },
    });
  });

  it('falls back to email, then phone, for the new User name when no name/contactPerson was given', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: NEW_USER_ID });

    await createVendorOwner('new@example.com', undefined, undefined);
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: { name: 'new@example.com', email: 'new@example.com', phone: undefined },
    });
  });

  it('rejects with CONFLICT and creates nothing when the email already belongs to an existing User', async () => {
    prismaMock.user.findFirst.mockResolvedValueOnce(userFixture()).mockResolvedValueOnce(null);

    await expect(createVendorOwner('taken@example.com', '9999999999', 'Someone')).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'A user with this email or phone already exists. Please use a different email/phone to create this Vendor.',
    });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('rejects with CONFLICT and creates nothing when the phone already belongs to an existing User', async () => {
    prismaMock.user.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(userFixture());

    await expect(createVendorOwner('fresh@example.com', '9876543210', 'Someone')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('rejects with CONFLICT when BOTH email and phone belong to the SAME existing User — never reused, never converted', async () => {
    prismaMock.user.findFirst.mockResolvedValue(userFixture());

    await expect(createVendorOwner('vinay@example.com', '9889259224', 'Vinay')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('rejects with CONFLICT when email belongs to User A and phone belongs to a different User B', async () => {
    prismaMock.user.findFirst.mockResolvedValueOnce(userFixture({ id: USER_A_ID })).mockResolvedValueOnce(userFixture({ id: USER_B_ID }));

    await expect(createVendorOwner('a@example.com', '9876543210', 'Someone')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('throws a validation error when neither email nor phone is given', async () => {
    await expect(createVendorOwner(undefined, undefined, 'No Identifier')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Provide an owner email or mobile number',
    });
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });
});

/**
 * Feature: Vendor owner-identity AVAILABILITY preview
 * Scenario: `checkVendorOwnerAvailability` — read-only, UX-only. Reports which of email/phone
 * (if any) is already taken, without creating or rejecting anything itself.
 */
describe('checkVendorOwnerAvailability', () => {
  it('returns available:true with no conflicts when neither identifier matches anything', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    const result = await checkVendorOwnerAvailability('nobody@example.com', '9000000000');
    expect(result).toEqual({ available: true, conflicts: [] });
  });

  it('returns available:false with conflicts:["email"] when only the email is taken', async () => {
    prismaMock.user.findFirst.mockResolvedValueOnce(userFixture()).mockResolvedValueOnce(null);
    const result = await checkVendorOwnerAvailability('taken@example.com', '9000000000');
    expect(result).toEqual({ available: false, conflicts: ['email'] });
  });

  it('returns available:false with conflicts:["phone"] when only the phone is taken', async () => {
    prismaMock.user.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(userFixture());
    const result = await checkVendorOwnerAvailability('fresh@example.com', '9876543210');
    expect(result).toEqual({ available: false, conflicts: ['phone'] });
  });

  it('returns available:false with conflicts:["email","phone"] when both are taken, even by the same User', async () => {
    prismaMock.user.findFirst.mockResolvedValue(userFixture());
    const result = await checkVendorOwnerAvailability('a@example.com', '9876543210');
    expect(result).toEqual({ available: false, conflicts: ['email', 'phone'] });
  });

  it('throws a validation error when neither email nor phone is given', async () => {
    await expect(checkVendorOwnerAvailability(undefined, undefined)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });
});
