import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import {
  createVendor,
  createVendorOwner,
  checkVendorOwnerAvailability,
  createTherapist,
  listVendors,
  listMyCustomers,
} from './vendor.service';

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
  const ROLE_FIXTURE = { id: VENDOR_ROLE_ID, key: 'member' };

  /** Arms every downstream call `createVendor` makes once its own double-submit guard clears —
   *  `createVendorOwner`'s email/phone availability check, the new User insert, `assignRole`'s
   *  own `getUserOrThrow` + role grant, and `buildAndInsertVendor`'s slug-uniqueness check +
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
    prismaMock.userRole.upsert.mockResolvedValue({} as never);
    prismaMock.member.findUnique.mockResolvedValue(null as never); // slug uniqueness check
    prismaMock.member.create.mockResolvedValue({ ...vendorRow, owner: null } as never);
  }

  it("the guard query is scoped by the submitted owner's email/mobile, not businessName alone", async () => {
    prismaMock.member.findFirst.mockResolvedValue(null); // no recent duplicate
    armDownstreamSuccess(NEW_USER_ID, { id: 'vendor-a' });

    await createVendor(
      { ownerFirstName: 'Owner', ownerLastName: 'A', ownerEmail: 'owner-a@example.com', ownerMobile: '+919000000001' } as never,
      ADMIN_ID,
    );

    expect(prismaMock.member.findFirst).toHaveBeenCalledWith(
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
    prismaMock.member.findFirst.mockImplementation(async (args: unknown) => {
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
 * Feature: therapists need no category grant (D10, P4-15): a branch with no category mapping
 * still gets therapists (the deal form creates them inline); a specialization must be THERAPY.
 */
describe('createTherapist — no category grants (D10)', () => {
  it('creates the therapist on a branch with no category mapping at all', async () => {
    prismaMock.branch.findUnique.mockResolvedValue(branchFixture());
    prismaMock.therapist.findFirst.mockResolvedValue(null);
    prismaMock.therapist.create.mockResolvedValue({ id: 'th-1' });

    const result = await createTherapist(VENDOR_ID, BRANCH_ID, { therapistType: 'Physio', personName: 'Alex' });

    expect(result).toEqual({ id: 'th-1' });
    expect(prismaMock.branchCategoryAccess.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.therapist.create.mock.calls[0][0]!.data).toMatchObject({ vendorId: VENDOR_ID, branchId: BRANCH_ID });
  });

  it('rejects a specialization that is not a THERAPY category', async () => {
    prismaMock.branch.findUnique.mockResolvedValue(branchFixture());
    prismaMock.therapist.findFirst.mockResolvedValue(null);
    prismaMock.category.findUnique.mockResolvedValue({ id: 'cat-1', parentId: null, type: 'SERVICE' } as never);

    await expect(
      createTherapist(VENDOR_ID, BRANCH_ID, { therapistType: 'Physio', personName: 'Alex', specializationCategoryId: 'b1b1b1b1-0000-4000-8000-000000000008' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prismaMock.therapist.create).not.toHaveBeenCalled();
  });
});

/**
 * Feature: the staff member list filters by status, missing documents, review flag and search,
 * and every row carries a documents summary.
 */
describe('listVendors — member list filters', () => {
  beforeEach(() => {
    prismaMock.member.findMany.mockResolvedValue([
      { id: VENDOR_ID, owner: null, documents: [{ documentType: 'PAN', status: 'APPROVED' }], documentsDueAt: null },
    ] as never);
    prismaMock.member.count.mockResolvedValue(1);
  });

  it('documents=incomplete matches members missing any provided AADHAAR, PAN or GST document', async () => {
    await listVendors({ page: 1, pageSize: 20, documents: 'incomplete' });
    const where = prismaMock.member.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      ['AADHAAR', 'PAN', 'GST'].map((documentType) => ({
        documents: { none: { documentType, status: { in: ['SUBMITTED', 'APPROVED'] } } },
      })),
    );
    expect(prismaMock.member.count).toHaveBeenCalledWith({ where });
  });

  it('reviewFlag=true matches flagged members only', async () => {
    await listVendors({ page: 1, pageSize: 20, reviewFlag: 'true', status: 'INACTIVE' });
    const where = prismaMock.member.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ status: 'INACTIVE', reviewFlaggedAt: { not: null } });
  });

  it('search covers business name, business email and owner mobile, and combines with the documents filter', async () => {
    await listVendors({ page: 1, pageSize: 20, search: '98765', documents: 'incomplete' });
    const where = prismaMock.member.findMany.mock.calls[0][0].where;
    expect(where.OR).toHaveLength(3);
    expect(where.AND[0].OR).toEqual(
      expect.arrayContaining([{ ownerMobile: { contains: '98765' } }, expect.objectContaining({ businessName: expect.anything() })]),
    );
  });

  it('adds a documents summary to every row', async () => {
    const { items, total } = await listVendors({ page: 1, pageSize: 20 });
    expect(total).toBe(1);
    expect(items[0].documentsSummary).toMatchObject({ complete: false, missing: ['AADHAAR', 'GST'] });
  });
});

/**
 * Member customers (D19, P4-16): name, city, order count, last order date; phone and email only
 * while the customer has a CONFIRMED order with this member. Staff (`contact: 'full'`) always
 * get contact details (D12).
 */
describe('listMyCustomers', () => {
  const day = (n: number) => new Date(Date.UTC(2026, 9, n));
  const item = (orderId: string, customerId: string, status: string, createdAt: Date, shippingCity: string | null = null) => ({
    orderId,
    order: { customerId, createdAt, status, shippingCity },
  });

  beforeEach(() => {
    prismaMock.orderItem.findMany.mockResolvedValue([
      // Asha: two lines of one completed order, then a newer confirmed (open) order.
      item('o1', 'asha', 'COMPLETED', day(1), 'Pune'),
      item('o1', 'asha', 'COMPLETED', day(1), 'Pune'),
      item('o2', 'asha', 'CONFIRMED', day(5), null),
      // Ravi: only a pending-payment order and a cancelled one: nothing open.
      item('o3', 'ravi', 'PENDING_PAYMENT', day(3), 'Mumbai'),
      item('o4', 'ravi', 'CANCELLED', day(4), 'Thane'),
    ] as never);
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'asha', name: 'Asha', phone: '+919800000001', email: 'asha@example.com' },
      { id: 'ravi', name: 'Ravi', phone: '+919800000002', email: 'ravi@example.com' },
    ] as never);
  });

  it('reads only this member order lines', async () => {
    await listMyCustomers('m1', { page: 1, pageSize: 20, contact: 'open-orders' });
    expect(prismaMock.orderItem.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { vendorId: 'm1' } }));
  });

  it('member view: contact only with a CONFIRMED order; city from the latest order that has one; distinct order count', async () => {
    const { items, total } = await listMyCustomers('m1', { page: 1, pageSize: 20, contact: 'open-orders' });
    expect(total).toBe(2);
    expect(items[0]).toEqual({
      id: 'asha', name: 'Asha', city: 'Pune', orderCount: 2, lastActivityAt: day(5), hasOpenOrder: true,
      phone: '+919800000001', email: 'asha@example.com',
    });
    expect(items[1]).toEqual({
      id: 'ravi', name: 'Ravi', city: 'Thane', orderCount: 2, lastActivityAt: day(4), hasOpenOrder: false,
      phone: null, email: null,
    });
  });

  it('staff view always returns contact details', async () => {
    const { items } = await listMyCustomers('m1', { page: 1, pageSize: 20, contact: 'full' });
    expect(items.find((c) => c.id === 'ravi')).toMatchObject({ phone: '+919800000002', email: 'ravi@example.com', hasOpenOrder: false });
  });

  it('pages after sorting by the latest order, newest first', async () => {
    const { items, total } = await listMyCustomers('m1', { page: 2, pageSize: 1, contact: 'open-orders' });
    expect(total).toBe(2);
    expect(items.map((c) => c.id)).toEqual(['ravi']);
  });
});
