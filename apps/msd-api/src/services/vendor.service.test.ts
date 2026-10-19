import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import { Prisma } from '../generated/prisma-client';
import { createVendor, createVendorOwner, checkVendorOwnerAvailability, createTherapist, createDeal, updateDeal, getMyVendorOrThrow, setVendorStatus, updateVendor, getMyCustomerOrThrow } from './vendor.service';

const prismaMock = vi.mocked(prisma, true);

const USER_A_ID = 'a0a0a0a0-0000-4000-8000-000000000001';
const USER_B_ID = 'b0b0b0b0-0000-4000-8000-000000000002';
const NEW_USER_ID = 'd0d0d0d0-0000-4000-8000-000000000004';
const ADMIN_ID = 'c0c0c0c0-0000-4000-8000-000000000003';
const VENDOR_ROLE_ID = 'e0e0e0e0-0000-4000-8000-0000000000ee';

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
 * Feature: `createVendor`'s double-submit guard must never collide across two DIFFERENT owner
 * submissions.
 * Scenario: regression test for the real "second vendor creation silently returns the first
 * vendor" bug (confirmed via live API calls against a real Postgres). The guard is meant to
 * catch a rapid double-click resubmitting the SAME payload, but it used to be keyed only on
 * `(createdByUserId, businessName)` — and Step 1 of the admin "Add Vendor" pipeline always POSTs
 * with `businessName` absent (the owner is created before any business field is filled in), so
 * `businessName` is always `null` at this call site. That meant ANY two vendor creations by the
 * SAME admin within the 10s window collided on `(createdByUserId, businessName: null)`
 * regardless of owner identity: the second submission's real owner — a brand-new one, or a
 * genuinely already-taken email/mobile — was silently discarded and the FIRST vendor was
 * returned instead, before `createVendorOwner`'s own conflict check ever ran. So a genuinely
 * duplicate owner never surfaced its intended 409 — it just silently returned an unrelated
 * vendor, and two legitimately different vendors collapsed into one.
 *
 * The fix folds the submitted `ownerEmail`/`ownerMobile` into the guard's own `where` clause, so
 * it only ever treats a call as "the same submission" when the owner identity matches too.
 */
describe('createVendor — double-submit guard scoping (regression: two different owners created seconds apart used to collapse into one vendor)', () => {
  const ROLE_FIXTURE = { id: VENDOR_ROLE_ID, key: 'vendor' };

  /** Arms every downstream call `createVendor` makes once its own double-submit guard clears —
   *  `createVendorOwner`'s email/phone availability check, the new User insert,
   *  `ensureVendorRoleAssigned`'s own `replaceUserRole` transaction (deleteMany + create + the
   *  user update that clears `roleConflict`), and `buildAndInsertVendor`'s slug-uniqueness check +
   *  insert. Keyed off `where.id` (only `getUserOrThrow` queries by id) so the same
   *  `user.findFirst` mock correctly serves both callers regardless of call order. */
  function armDownstreamSuccess(newUserId: string, vendorRow: { id: string; ownerEmail?: string }) {
    prismaMock.user.findFirst.mockImplementation(async (args: unknown) => {
      const where = (args as { where?: { id?: string } })?.where;
      if (where?.id) return { id: where.id, status: 'active', deletedAt: null, roles: [] } as never;
      return null; // createVendorOwner's own email/phone availability checks — nothing taken
    });
    prismaMock.user.create.mockResolvedValue({ id: newUserId } as never);
    prismaMock.role.findUnique.mockResolvedValue(ROLE_FIXTURE as never);
    prismaMock.userRole.deleteMany.mockResolvedValue({} as never);
    prismaMock.userRole.create.mockResolvedValue({} as never);
    prismaMock.user.update.mockResolvedValue({} as never);
    prismaMock.vendor.findUnique.mockResolvedValue(null as never); // slug uniqueness check
    prismaMock.vendor.create.mockResolvedValue({ ...vendorRow, owner: null } as never);
  }

  it("the guard query is scoped by the submitted owner's email/mobile, not businessName alone", async () => {
    prismaMock.vendor.findFirst.mockResolvedValue(null); // no recent duplicate
    armDownstreamSuccess(NEW_USER_ID, { id: 'vendor-a' });

    await createVendor(
      { ownerFirstName: 'Owner', ownerLastName: 'A', ownerEmail: 'owner-a@example.com', ownerMobile: '+919000000001' } as never,
      ADMIN_ID,
    );

    expect(prismaMock.vendor.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdByUserId: ADMIN_ID,
          businessName: null,
          ownerEmail: 'owner-a@example.com',
          ownerMobile: '+919000000001',
        }),
      }),
    );
  });

  it('two different owners submitted by the same admin within the double-submit window create two distinct vendors, never the first vendor returned twice', async () => {
    const ownerA = { ownerFirstName: 'Owner', ownerLastName: 'A', ownerEmail: 'owner-a@example.com', ownerMobile: '+919000000001' };
    const ownerB = { ownerFirstName: 'Owner', ownerLastName: 'B', ownerEmail: 'owner-b@example.com', ownerMobile: '+919000000002' };
    const vendorA = { id: 'vendor-a', ownerEmail: ownerA.ownerEmail };
    const vendorB = { id: 'vendor-b', ownerEmail: ownerB.ownerEmail };

    // Simulates a real Postgres row for vendor A already existing when owner B is submitted
    // seconds later — the guard's own query is what decides whether this counts as "the same
    // submission". A field simply absent from `where` is an unfiltered match-anything (exactly
    // how the pre-fix guard's query — no `ownerEmail`/`ownerMobile` keys at all — matched vendor
    // A regardless of who owner B actually was); a field present in `where` must match vendor A's
    // own value to count as a hit. This is what makes the mock fail the same way the real Prisma
    // query did before the fix, and pass once the guard's `where` actually includes owner identity.
    prismaMock.vendor.findFirst.mockImplementation(async (args: unknown) => {
      const where = (args as { where?: Record<string, unknown> })?.where ?? {};
      if (where.createdByUserId !== ADMIN_ID) return null;
      if (where.businessName !== null) return null;
      if ('ownerEmail' in where && where.ownerEmail !== vendorA.ownerEmail) return null;
      if ('ownerMobile' in where && where.ownerMobile !== ownerA.ownerMobile) return null;
      return vendorA as never;
    });
    armDownstreamSuccess(NEW_USER_ID, vendorB);

    const result = await createVendor(ownerB as never, ADMIN_ID);

    // Before the fix: the guard matched on (createdByUserId, businessName: null) alone, ignored
    // owner identity entirely, and returned vendorA here — a completely different, unrelated
    // vendor silently handed back for owner B's submission.
    expect(result.id).toBe(vendorB.id);
    expect(result.id).not.toBe(vendorA.id);
    expect(prismaMock.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ email: ownerB.ownerEmail }) }));
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
    prismaMock.therapist.findUnique.mockResolvedValue(null as never); // slug uniqueness check
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

/**
 * Feature: Member suspension blocks the self-service vendor portal
 * Scenario: `getMyVendorOrThrow` is the one choke point every `/vendors/me/*` route resolves
 * ownership through — a suspended Member's own access must stop the moment suspension is
 * committed, not just at their next login, so this re-checks the Vendor's live `status` on
 * every call rather than only at token-issue time.
 */
describe('getMyVendorOrThrow — suspension blocks self-service access', () => {
  const VENDOR_ID = 'f0f0f0f0-0000-4000-8000-000000000005';

  it('rejects with FORBIDDEN when the caller\'s own vendor is SUSPENDED', async () => {
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID, ownerUserId: USER_A_ID, status: 'SUSPENDED' } as never);

    await expect(getMyVendorOrThrow(USER_A_ID)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Your member account is suspended. Please contact support.',
    });
  });

  it('a merely INACTIVE (not SUSPENDED) vendor is not blocked here — only SUSPENDED is a portal lockout', async () => {
    const vendor = { id: VENDOR_ID, ownerUserId: USER_A_ID, status: 'INACTIVE' } as never;
    prismaMock.vendor.findUnique.mockResolvedValue(vendor);

    await expect(getMyVendorOrThrow(USER_A_ID)).resolves.toEqual(vendor);
  });

  it('an ACTIVE vendor resolves normally (regression)', async () => {
    const vendor = { id: VENDOR_ID, ownerUserId: USER_A_ID, status: 'ACTIVE' } as never;
    prismaMock.vendor.findUnique.mockResolvedValue(vendor);

    await expect(getMyVendorOrThrow(USER_A_ID)).resolves.toEqual(vendor);
  });

  it('still 404s when the caller has no vendor profile at all (regression)', async () => {
    prismaMock.vendor.findUnique.mockResolvedValue(null);

    await expect(getMyVendorOrThrow(USER_A_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

/**
 * Feature: Suspending a Member revokes their existing sessions immediately
 * Scenario: `setVendorStatus('SUSPENDED')` reuses the exact same `revokeAllRefreshTokens` that
 * `/auth/logout-all` already calls — only on the ACTIVE->SUSPENDED edge, never on a re-save of
 * an already-suspended row or on any other status transition (status_change/deactivate stay
 * their own distinct operations, never conflated with suspension).
 */
describe('setVendorStatus — suspension revokes existing sessions', () => {
  const VENDOR_ID = 'f0f0f0f0-0000-4000-8000-000000000005';

  it('revokes all refresh sessions for the owner when transitioning into SUSPENDED', async () => {
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID, ownerUserId: USER_A_ID, status: 'ACTIVE' } as never);
    prismaMock.vendor.update.mockResolvedValue({ id: VENDOR_ID, ownerUserId: USER_A_ID, status: 'SUSPENDED', owner: null } as never);
    prismaMock.refreshSession.updateMany.mockResolvedValue({ count: 2 } as never);

    await setVendorStatus(VENDOR_ID, 'SUSPENDED', 'Policy violation');

    expect(prismaMock.refreshSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: USER_A_ID, revokedAt: null }) }),
    );
  });

  it('does not re-revoke sessions when the vendor was already SUSPENDED (no-op re-save)', async () => {
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID, ownerUserId: USER_A_ID, status: 'SUSPENDED' } as never);
    prismaMock.vendor.update.mockResolvedValue({ id: VENDOR_ID, ownerUserId: USER_A_ID, status: 'SUSPENDED', owner: null } as never);

    await setVendorStatus(VENDOR_ID, 'SUSPENDED', 'Still suspended');

    expect(prismaMock.refreshSession.updateMany).not.toHaveBeenCalled();
  });

  it('does not revoke sessions for an unrelated transition (e.g. ACTIVE -> INACTIVE, a deactivation, not a suspension)', async () => {
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID, ownerUserId: USER_A_ID, status: 'ACTIVE' } as never);
    prismaMock.vendor.update.mockResolvedValue({ id: VENDOR_ID, ownerUserId: USER_A_ID, status: 'INACTIVE', owner: null } as never);

    await setVendorStatus(VENDOR_ID, 'INACTIVE');

    expect(prismaMock.refreshSession.updateMany).not.toHaveBeenCalled();
  });
});

/**
 * Feature: "Member User" step edits the REAL linked User account
 * Scenario: `updateVendor`'s owner-field propagation (`syncOwnerUserFromVendorFields`) — editing
 * the Vendor's `ownerFirstName`/`ownerLastName`/`ownerEmail`/`ownerMobile` must update that same
 * `User` row's actual name/email/phone (the identity it logs in with), reusing the exact
 * duplicate-check shape `createVendorOwner` already uses (never creating a second owner, never
 * silently colliding with another account).
 *
 * Given: a Vendor with a linked `ownerUserId`
 * When: `updateVendor` is called with one or more owner-identity fields
 * Then: the linked User's name/email/phone updates to match; a duplicate email/phone on a
 *       DIFFERENT user is rejected as a clean 409 (never a raw P2002); clearing both email and
 *       phone at once is rejected (a User must keep at least one); a save that never touches
 *       owner fields leaves the User alone entirely
 */
describe('updateVendor — Member User step syncs the real linked User account', () => {
  const VENDOR_ID = 'vendor-owner-sync-1';
  const OWNER_USER_ID = 'owner-user-1';

  function vendorFixture(overrides: Partial<{ ownerUserId: string | null; businessName: string | null }> = {}) {
    return { id: VENDOR_ID, ownerUserId: OWNER_USER_ID, businessName: 'Existing Business', mapLocationUrl: null, ...overrides };
  }

  beforeEach(() => {
    prismaMock.vendor.findUnique.mockResolvedValue(vendorFixture() as never);
    prismaMock.vendor.update.mockResolvedValue({ ...vendorFixture(), owner: null } as never);
    prismaMock.user.findFirst.mockResolvedValue(null); // no duplicate by default
    prismaMock.user.findUnique.mockResolvedValue({ name: 'Old Name', email: 'old@example.com', phone: '+919000000000' } as never);
    prismaMock.user.update.mockResolvedValue({} as never);
  });

  it('updates the linked User name/email/phone when owner fields are saved', async () => {
    await updateVendor(VENDOR_ID, {
      ownerFirstName: 'New',
      ownerLastName: 'Name',
      ownerEmail: 'new@example.com',
      ownerMobile: '+919876543210',
    } as never);

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: OWNER_USER_ID },
      data: { name: 'New Name', email: 'new@example.com', phone: '+919876543210' },
    });
  });

  it('never touches the User row when the save has no owner-identity fields', async () => {
    await updateVendor(VENDOR_ID, { businessName: 'Renamed Business' } as never);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('rejects with a clean 409 (conflicts detail) when the new email belongs to a different user — never a raw P2002', async () => {
    prismaMock.user.findFirst.mockImplementation(async (args: never) => {
      const where = (args as { where: { email?: string } }).where;
      return where.email ? ({ id: 'someone-else' } as never) : null;
    });

    await expect(updateVendor(VENDOR_ID, { ownerEmail: 'taken@example.com' } as never)).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { conflicts: ['email'] },
    });
    expect(prismaMock.vendor.update).not.toHaveBeenCalled();
  });

  it('rejects clearing both email and mobile at once — a User must keep at least one identifier', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ name: 'Old Name', email: 'old@example.com', phone: null } as never);

    await expect(updateVendor(VENDOR_ID, { ownerEmail: '' } as never)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('does not run the owner-sync at all for a vendor with no linked owner yet (draft)', async () => {
    prismaMock.vendor.findUnique.mockResolvedValue(vendorFixture({ ownerUserId: null }) as never);
    await updateVendor(VENDOR_ID, { ownerFirstName: 'Solo' } as never);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});

/**
 * Feature: member-scoped single-customer lookup — 404-not-403, never confirms existence of a
 * customer unrelated to the caller's own vendor; confirmedPaymentsTotal reuses the exact
 * `Order.status IN (CONFIRMED, COMPLETED)` definition customer.service.ts/settlement.service.ts
 * already use, scoped additionally to this vendor's own line items.
 */
describe('getMyCustomerOrThrow', () => {
  const CALLER_ID = 'a2a2a2a2-0000-4000-8000-000000000001';
  const VENDOR_ID = 'b2b2b2b2-0000-4000-8000-000000000002';
  const CUSTOMER_ID = 'c2c2c2c2-0000-4000-8000-000000000003';

  it('404s when the caller has no vendor profile at all', async () => {
    prismaMock.vendor.findUnique.mockResolvedValue(null);
    await expect(getMyCustomerOrThrow(CALLER_ID, CUSTOMER_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(prismaMock.order.count).not.toHaveBeenCalled();
  });

  it("404s (never confirms existence) when this customer has no Order linking them to the caller's own vendor", async () => {
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    prismaMock.order.count.mockResolvedValue(0);
    prismaMock.order.aggregate.mockResolvedValue({ _sum: { total: null } } as never);

    await expect(getMyCustomerOrThrow(CALLER_ID, CUSTOMER_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('scopes both the count and the confirmed-payments aggregate to items: { some: { vendorId } }, never the bare Order.vendorId', async () => {
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    prismaMock.order.count.mockResolvedValue(3);
    prismaMock.order.aggregate.mockResolvedValue({ _sum: { total: new Prisma.Decimal('1500.00') } } as never);
    prismaMock.user.findUnique.mockResolvedValue({ id: CUSTOMER_ID, name: 'Priya', phone: '+919876543210', email: 'priya@example.com' } as never);

    const result = await getMyCustomerOrThrow(CALLER_ID, CUSTOMER_ID);

    expect(prismaMock.order.count).toHaveBeenCalledWith({ where: { customerId: CUSTOMER_ID, items: { some: { vendorId: VENDOR_ID } } } });
    expect(prismaMock.order.aggregate).toHaveBeenCalledWith({
      where: { customerId: CUSTOMER_ID, items: { some: { vendorId: VENDOR_ID } }, status: { in: ['CONFIRMED', 'COMPLETED'] } },
      _sum: { total: true },
    });
    expect(result).toEqual({
      id: CUSTOMER_ID,
      name: 'Priya',
      phone: '+919876543210',
      email: 'priya@example.com',
      totalOrders: 3,
      confirmedPaymentsTotal: 1500,
    });
  });

  it('defaults confirmedPaymentsTotal to 0 when the aggregate sum is null (no confirmed/completed order yet)', async () => {
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    prismaMock.order.count.mockResolvedValue(1);
    prismaMock.order.aggregate.mockResolvedValue({ _sum: { total: null } } as never);
    prismaMock.user.findUnique.mockResolvedValue({ id: CUSTOMER_ID, name: 'Priya', phone: null, email: null } as never);

    const result = await getMyCustomerOrThrow(CALLER_ID, CUSTOMER_ID);
    expect(result.confirmedPaymentsTotal).toBe(0);
  });

  it("a different vendor's caller never reaches this customer even with the same customerId (isolation via the where clause, not the gate)", async () => {
    const OTHER_VENDOR_ID = 'd2d2d2d2-0000-4000-8000-000000000004';
    prismaMock.vendor.findUnique.mockResolvedValue({ id: OTHER_VENDOR_ID } as never);
    prismaMock.order.count.mockResolvedValue(0);

    await expect(getMyCustomerOrThrow(CALLER_ID, CUSTOMER_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(prismaMock.order.count).toHaveBeenCalledWith({ where: { customerId: CUSTOMER_ID, items: { some: { vendorId: OTHER_VENDOR_ID } } } });
  });
});
