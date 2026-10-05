import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import { createVendorOwner, checkVendorOwnerAvailability, createTherapist, createDeal, updateDeal } from './vendor.service';

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

const VENDOR_ID = 'e0e0e0e0-0000-4000-8000-000000000005';
const BRANCH_ID = 'f0f0f0f0-0000-4000-8000-000000000006';

function branchFixture(overrides: Partial<{ id: string; vendorId: string }> = {}) {
  return { id: BRANCH_ID, vendorId: VENDOR_ID, ...overrides };
}

/**
 * Feature: branch-level Therapy access is a real, backend-enforced gate — never just a
 * frontend branch-picker filter.
 * Scenario: a branch with zero `BranchCategoryAccess` rows of type THERAPY must be rejected by
 * `createTherapist` even when the caller simply omits `specializationCategoryId` (the one field
 * the pre-existing code already validated) — this is the exact bypass the Issue #2 fix closes.
 */
describe('createTherapist — branch-level Therapy access gate', () => {
  it('rejects with VALIDATION_ERROR when the branch has zero THERAPY category access, even with no specializationCategoryId given', async () => {
    prismaMock.branch.findUnique.mockResolvedValue(branchFixture());
    prismaMock.branchCategoryAccess.findFirst.mockResolvedValue(null);

    await expect(
      createTherapist(VENDOR_ID, BRANCH_ID, { therapistType: 'Physio', personName: 'Alex' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prismaMock.therapist.create).not.toHaveBeenCalled();
  });

  it('creates the therapist when the branch has at least one THERAPY category access row', async () => {
    prismaMock.branch.findUnique.mockResolvedValue(branchFixture());
    prismaMock.branchCategoryAccess.findFirst.mockResolvedValue({ id: 'bca-1' });
    prismaMock.therapist.findFirst.mockResolvedValue(null);
    prismaMock.therapist.create.mockResolvedValue({ id: 'th-1' });

    const result = await createTherapist(VENDOR_ID, BRANCH_ID, { therapistType: 'Physio', personName: 'Alex' });

    expect(result).toEqual({ id: 'th-1' });
    expect(prismaMock.therapist.create).toHaveBeenCalled();
  });
});

const DEAL_ID = 'a1a1a1a1-0000-4000-8000-000000000007';
const CATEGORY_ID = 'b1b1b1b1-0000-4000-8000-000000000008';
const OTHER_BRANCH_ID = 'c2c2c2c2-0000-4000-8000-000000000009';
const THERAPIST_ID = 'd3d3d3d3-0000-4000-8000-00000000000a';

const serviceCategoryFixture = { id: CATEGORY_ID, name: 'Beauty', parentId: null, type: 'SERVICE' };
const baseDealInput = {
  categoryId: CATEGORY_ID,
  title: 'Deep tissue',
  slug: 'deep-tissue',
  originalPrice: '399.00',
  salePrice: '299.00',
  durationMinutes: 30,
  packages: [{ durationMinutes: 30, sellingPrice: 299 }],
};

/** Arranges every category/branch-access check `createDeal`/`updateDeal` makes before it ever
 *  touches therapist linking, so each test below only needs to vary the therapist-related mocks. */
function arrangeDealOfferingChecksPass() {
  prismaMock.category.findUnique.mockResolvedValue(serviceCategoryFixture as never);
  prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue({ id: 'grant-1' } as never);
  prismaMock.branchCategoryAccess.findUnique.mockResolvedValue({ id: 'branch-grant-1' } as never);
  prismaMock.deal.findUnique.mockResolvedValue(null); // slug free
  prismaMock.dealPackage.findFirst.mockResolvedValue(null); // syncDealPriceFromPackages no-op
}

/**
 * Feature: a Deal may link the Therapist(s) who perform it, but only ones that actually work at
 * the same branch as the Deal (the real security boundary — see
 * vendor.service.ts#assertTherapistsBelongToBranch).
 */
describe('createDeal / updateDeal — therapist linking', () => {
  beforeEach(() => {
    prismaMock.branch.findUnique.mockResolvedValue(branchFixture());
  });

  it('rejects with VALIDATION_ERROR and creates nothing when a therapistId belongs to a different branch', async () => {
    arrangeDealOfferingChecksPass();
    prismaMock.therapist.findMany.mockResolvedValue([{ id: THERAPIST_ID, vendorId: VENDOR_ID, branchId: OTHER_BRANCH_ID }] as never);

    await expect(
      createDeal(VENDOR_ID, BRANCH_ID, { ...baseDealInput, therapistIds: [THERAPIST_ID] } as never, true),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prismaMock.deal.create).not.toHaveBeenCalled();
  });

  it('rejects with VALIDATION_ERROR when a therapistId does not exist at all', async () => {
    arrangeDealOfferingChecksPass();
    prismaMock.therapist.findMany.mockResolvedValue([]);

    await expect(
      createDeal(VENDOR_ID, BRANCH_ID, { ...baseDealInput, therapistIds: [THERAPIST_ID] } as never, true),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prismaMock.deal.create).not.toHaveBeenCalled();
  });

  it('creates the deal and writes DealTherapist rows for each valid, branch-matching therapistId', async () => {
    arrangeDealOfferingChecksPass();
    prismaMock.therapist.findMany.mockResolvedValue([{ id: THERAPIST_ID, vendorId: VENDOR_ID, branchId: BRANCH_ID }] as never);
    prismaMock.deal.create.mockResolvedValue({ id: DEAL_ID } as never);
    prismaMock.deal.findUniqueOrThrow.mockResolvedValue({ id: DEAL_ID, therapistLinks: [] } as never);

    await createDeal(VENDOR_ID, BRANCH_ID, { ...baseDealInput, therapistIds: [THERAPIST_ID] } as never, true);

    expect(prismaMock.dealTherapist.createMany).toHaveBeenCalledWith({
      data: [{ dealId: DEAL_ID, therapistId: THERAPIST_ID }],
    });
  });

  it('createDeal never touches DealTherapist when therapistIds is omitted', async () => {
    arrangeDealOfferingChecksPass();
    prismaMock.deal.create.mockResolvedValue({ id: DEAL_ID } as never);
    prismaMock.deal.findUniqueOrThrow.mockResolvedValue({ id: DEAL_ID, therapistLinks: [] } as never);

    await createDeal(VENDOR_ID, BRANCH_ID, baseDealInput as never, true);

    expect(prismaMock.therapist.findMany).not.toHaveBeenCalled();
    expect(prismaMock.dealTherapist.createMany).not.toHaveBeenCalled();
  });

  it('updateDeal with therapistIds: [] clears every existing link without re-adding any', async () => {
    prismaMock.deal.findUnique.mockResolvedValue({ id: DEAL_ID, vendorId: VENDOR_ID, branchId: BRANCH_ID, categoryId: CATEGORY_ID } as never);
    prismaMock.therapist.findMany.mockResolvedValue([]);
    prismaMock.deal.findUniqueOrThrow.mockResolvedValue({ id: DEAL_ID, therapistLinks: [] } as never);

    await updateDeal(VENDOR_ID, BRANCH_ID, DEAL_ID, { therapistIds: [] } as never);

    expect(prismaMock.dealTherapist.deleteMany).toHaveBeenCalledWith({ where: { dealId: DEAL_ID } });
    expect(prismaMock.dealTherapist.createMany).not.toHaveBeenCalled();
  });

  it('updateDeal omitting therapistIds leaves existing links completely untouched', async () => {
    prismaMock.deal.findUnique.mockResolvedValue({ id: DEAL_ID, vendorId: VENDOR_ID, branchId: BRANCH_ID, categoryId: CATEGORY_ID } as never);
    prismaMock.deal.findUniqueOrThrow.mockResolvedValue({ id: DEAL_ID, therapistLinks: [] } as never);

    await updateDeal(VENDOR_ID, BRANCH_ID, DEAL_ID, { title: 'Renamed' } as never);

    expect(prismaMock.therapist.findMany).not.toHaveBeenCalled();
    expect(prismaMock.dealTherapist.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.dealTherapist.createMany).not.toHaveBeenCalled();
  });
});
