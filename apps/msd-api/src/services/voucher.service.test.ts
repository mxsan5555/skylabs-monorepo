import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

const sendSmsOtpMock = vi.fn();
const sendOtpEmailMock = vi.fn();
vi.mock('../providers/sms/connectExpress.provider', () => ({ sendOtp: (...args: unknown[]) => sendSmsOtpMock(...args) }));
vi.mock('../providers/email/smtp.provider', () => ({ sendOtpEmail: (...args: unknown[]) => sendOtpEmailMock(...args) }));

const bcryptCompareMock = vi.fn();
const bcryptHashMock = vi.fn().mockResolvedValue('hashed-otp');
vi.mock('bcrypt', () => {
  const impl = { compare: (...args: unknown[]) => bcryptCompareMock(...args), hash: (...args: unknown[]) => bcryptHashMock(...args) };
  return { default: impl, ...impl };
});

import { prisma } from '../lib/prisma';
import { Prisma } from '../generated/prisma-client';
import { verifyVoucher, startService, requestCompletionOtp, completeVoucher, listMyVoucherQueue } from './voucher.service';

const prismaMock = vi.mocked(prisma, true);

const VENDOR_ID = 'b0000000-0000-4000-8000-000000000001';
const OTHER_VENDOR_ID = 'b0000000-0000-4000-8000-000000000002';
const CALLER_ID = 'b0000000-0000-4000-8000-000000000003';
const ENTITLEMENT_ID = 'b0000000-0000-4000-8000-000000000004';
const CHALLENGE_ID = 'b0000000-0000-4000-8000-000000000005';
const ORDER_ID = 'b0000000-0000-4000-8000-000000000006';
const CODE = 'MSD-DL-ABC123';

const financeSettingsFixture = {
  id: 'singleton',
  defaultCommissionRatePercent: new Prisma.Decimal('10'),
  serviceHoldHours: 24,
  productReturnHoldHours: 168,
  completionOtpExpiryMinutes: 10,
  completionOtpMaxAttempts: 5,
  completionOtpResendCooldownSeconds: 60,
};

function entitlementFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTITLEMENT_ID,
    voucherCode: CODE,
    vendorId: VENDOR_ID,
    entitlementStatus: 'ACTIVE',
    settlementStatus: 'PENDING_FULFILMENT',
    fulfilmentKind: 'SERVICE_SESSION',
    orderItem: { order: { id: ORDER_ID, status: 'CONFIRMED' }, itemName: '60-min Massage' },
    customer: { id: 'customer-1', name: 'Priya', phone: '+919876543210', email: 'priya@example.com' },
    branch: { name: 'MG Road' },
    grossAmount: '1000.00',
    memberShareAmount: '800.00',
    adjustments: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  bcryptHashMock.mockResolvedValue('hashed-otp');
});

/**
 * Feature: Voucher verification — member/branch isolation, state-mapping, read-only guarantee
 * Scenario: `verifyVoucher` maps every known combination of order/entitlement/settlement state
 * to exactly one of the spec's result codes and NEVER mutates anything (no update/updateMany
 * call), regardless of which path it takes.
 */
describe('verifyVoucher', () => {
  it('returns WRONG_MEMBER_BRANCH when the caller is not this voucher\'s own vendor', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture() as never);
    prismaMock.vendor.findUnique.mockResolvedValue({ id: OTHER_VENDOR_ID } as never);

    const { result } = await verifyVoucher(CALLER_ID, CODE);

    expect(result).toBe('WRONG_MEMBER_BRANCH');
  });

  it('returns WRONG_MEMBER_BRANCH when the caller owns no vendor at all', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture() as never);
    prismaMock.vendor.findUnique.mockResolvedValue(null);

    const { result } = await verifyVoucher(CALLER_ID, CODE);
    expect(result).toBe('WRONG_MEMBER_BRANCH');
  });

  it('returns ADMIN_REVIEW_REQUIRED when the underlying order is not CONFIRMED/COMPLETED', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(
      entitlementFixture({ orderItem: { order: { id: ORDER_ID, status: 'PENDING_PAYMENT' }, itemName: 'x' } }) as never,
    );
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);

    const { result } = await verifyVoucher(CALLER_ID, CODE);
    expect(result).toBe('ADMIN_REVIEW_REQUIRED');
  });

  it('returns ADMIN_REVIEW_REQUIRED when a dispute currently blocks this entitlement', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ settlementStatus: 'DISPUTED_BLOCKED' }) as never);
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);

    const { result } = await verifyVoucher(CALLER_ID, CODE);
    expect(result).toBe('ADMIN_REVIEW_REQUIRED');
  });

  it('returns CANCELLED_REFUNDED for a CANCELLED entitlement', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ entitlementStatus: 'CANCELLED' }) as never);
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    expect((await verifyVoucher(CALLER_ID, CODE)).result).toBe('CANCELLED_REFUNDED');
  });

  it('returns CANCELLED_REFUNDED for a VOID settlement (fully refunded pre-payout)', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ settlementStatus: 'VOID' }) as never);
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    expect((await verifyVoucher(CALLER_ID, CODE)).result).toBe('CANCELLED_REFUNDED');
  });

  it('returns ALREADY_USED for a COMPLETED entitlement', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ entitlementStatus: 'COMPLETED' }) as never);
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    expect((await verifyVoucher(CALLER_ID, CODE)).result).toBe('ALREADY_USED');
  });

  it('returns VALID for a fresh, confirmed, undisputed voucher belonging to the caller\'s own vendor', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture() as never);
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    expect((await verifyVoucher(CALLER_ID, CODE)).result).toBe('VALID');
  });

  it('never mutates the entitlement under any result', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ entitlementStatus: 'COMPLETED' }) as never);
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);

    await verifyVoucher(CALLER_ID, CODE);

    expect(prismaMock.purchaseEntitlement.update).not.toHaveBeenCalled();
    expect(prismaMock.purchaseEntitlement.updateMany).not.toHaveBeenCalled();
  });

  it('404s outright for a voucher code that does not exist', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(null);
    await expect(verifyVoucher(CALLER_ID, CODE)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  /**
   * Feature: resumable verification page backbone — masked destination + OTP challenge metadata
   * Scenario: every result carries the masked phone/email (`••••<last4>`, same convention as
   * `settlement.service.ts#maskBankAccountNumber`); the `otpChallenge` block appears ONLY when
   * `entitlementStatus === 'OTP_REQUESTED'`, is built from the latest unverified
   * `CompletionOtpChallenge` the same way `requestCompletionOtp`/`completeVoucher` find it, and
   * never carries `hashedOtp` or any plaintext. The function stays provably read-only throughout.
   */
  it('always includes customerPhoneMasked/customerEmailMasked using the ••••<last4> convention', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture() as never);
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);

    const { entitlement } = await verifyVoucher(CALLER_ID, CODE);

    expect(entitlement.customerPhoneMasked).toBe('••••3210');
    expect(entitlement.customerEmailMasked).toBe('••••.com');
  });

  it('returns null masked fields when the customer has no phone/email on file', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(
      entitlementFixture({ customer: { id: 'c1', name: 'Priya', phone: null, email: null } }) as never,
    );
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);

    const { entitlement } = await verifyVoucher(CALLER_ID, CODE);

    expect(entitlement.customerPhoneMasked).toBeNull();
    expect(entitlement.customerEmailMasked).toBeNull();
  });

  it('omits otpChallenge entirely when entitlementStatus is not OTP_REQUESTED', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ entitlementStatus: 'ACTIVE' }) as never);
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);

    const { entitlement } = await verifyVoucher(CALLER_ID, CODE);

    expect(entitlement).not.toHaveProperty('otpChallenge');
    expect(prismaMock.completionOtpChallenge.findFirst).not.toHaveBeenCalled();
  });

  it('includes a safe otpChallenge projection — requestedAt/expiresAt/attempts/maxAttempts/resendAvailableAt, never hashedOtp or plaintext — when entitlementStatus is OTP_REQUESTED', async () => {
    const lastSentAt = new Date('2026-10-10T10:00:00.000Z');
    const expiresAt = new Date('2026-10-10T10:10:00.000Z');
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ entitlementStatus: 'OTP_REQUESTED' }) as never);
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    prismaMock.financeSettings.upsert.mockResolvedValue(financeSettingsFixture as never);
    prismaMock.completionOtpChallenge.findFirst.mockResolvedValue({
      id: CHALLENGE_ID,
      lastSentAt,
      expiresAt,
      attempts: 2,
      hashedOtp: 'super-secret-hash',
      verifiedAt: null,
    } as never);

    const { entitlement } = await verifyVoucher(CALLER_ID, CODE);

    expect(entitlement.otpChallenge).toEqual({
      requestedAt: lastSentAt,
      expiresAt,
      attempts: 2,
      maxAttempts: financeSettingsFixture.completionOtpMaxAttempts,
      resendAvailableAt: new Date(lastSentAt.getTime() + financeSettingsFixture.completionOtpResendCooldownSeconds * 1000),
    });
    expect(JSON.stringify(entitlement)).not.toContain('super-secret-hash');
    expect(prismaMock.completionOtpChallenge.findFirst).toHaveBeenCalledWith({
      where: { entitlementId: ENTITLEMENT_ID, verifiedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('omits otpChallenge (rather than erroring) when status is OTP_REQUESTED but no unverified challenge row exists', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ entitlementStatus: 'OTP_REQUESTED' }) as never);
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    prismaMock.financeSettings.upsert.mockResolvedValue(financeSettingsFixture as never);
    prismaMock.completionOtpChallenge.findFirst.mockResolvedValue(null);

    const { entitlement } = await verifyVoucher(CALLER_ID, CODE);

    expect(entitlement).not.toHaveProperty('otpChallenge');
  });

  it('remains 100% read-only even on the OTP_REQUESTED path that now does an extra lookup', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ entitlementStatus: 'OTP_REQUESTED' }) as never);
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    prismaMock.financeSettings.upsert.mockResolvedValue(financeSettingsFixture as never);
    prismaMock.completionOtpChallenge.findFirst.mockResolvedValue({
      id: CHALLENGE_ID, lastSentAt: new Date(), expiresAt: new Date(), attempts: 0, verifiedAt: null,
    } as never);

    await verifyVoucher(CALLER_ID, CODE);

    expect(prismaMock.purchaseEntitlement.update).not.toHaveBeenCalled();
    expect(prismaMock.purchaseEntitlement.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.completionOtpChallenge.update).not.toHaveBeenCalled();
    expect(prismaMock.completionOtpChallenge.create).not.toHaveBeenCalled();
  });
});

describe('startService', () => {
  it('flips ACTIVE -> STARTED on success', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture() as never);
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    prismaMock.purchaseEntitlement.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.purchaseEntitlement.findUniqueOrThrow.mockResolvedValue(entitlementFixture({ entitlementStatus: 'STARTED' }) as never);

    const result = await startService(CALLER_ID, CODE);

    expect(prismaMock.purchaseEntitlement.updateMany).toHaveBeenCalledWith({
      where: { id: ENTITLEMENT_ID, entitlementStatus: 'ACTIVE' },
      data: { entitlementStatus: 'STARTED', serviceStartedAt: expect.any(Date) },
    });
    expect((result as { entitlementStatus: string }).entitlementStatus).toBe('STARTED');
  });

  it('rejects with CONFLICT when the voucher was already started/completed (conditional updateMany guard)', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ entitlementStatus: 'STARTED' }) as never);
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    prismaMock.purchaseEntitlement.updateMany.mockResolvedValue({ count: 0 } as never);

    await expect(startService(CALLER_ID, CODE)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects with FORBIDDEN when the voucher belongs to a different vendor', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture() as never);
    prismaMock.vendor.findUnique.mockResolvedValue({ id: OTHER_VENDOR_ID } as never);

    await expect(startService(CALLER_ID, CODE)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(prismaMock.purchaseEntitlement.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a PRODUCT voucher with VALIDATION_ERROR — only a service voucher can be "started"', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ fulfilmentKind: 'PRODUCT_PICKUP' }) as never);
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);

    await expect(startService(CALLER_ID, CODE)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prismaMock.purchaseEntitlement.updateMany).not.toHaveBeenCalled();
  });
});

/**
 * Feature: Completion OTP request — resend cooldown + delivery
 */
describe('requestCompletionOtp', () => {
  function arm(entitlementOverrides: Record<string, unknown> = {}) {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture(entitlementOverrides) as never);
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    prismaMock.financeSettings.upsert.mockResolvedValue(financeSettingsFixture as never);
  }

  it('enforces the resend cooldown — a too-recent prior challenge is rejected with RATE_LIMITED', async () => {
    arm();
    prismaMock.completionOtpChallenge.findFirst.mockResolvedValue({
      id: CHALLENGE_ID,
      lastSentAt: new Date(Date.now() - 5000), // 5s ago, cooldown is 60s
      resendCount: 0,
      verifiedAt: null,
    } as never);

    await expect(requestCompletionOtp(CALLER_ID, CODE)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(prismaMock.completionOtpChallenge.create).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('sends by SMS when the customer has a phone on file', async () => {
    arm();
    prismaMock.completionOtpChallenge.findFirst.mockResolvedValue(null);
    sendSmsOtpMock.mockResolvedValue(true);

    await requestCompletionOtp(CALLER_ID, CODE);

    expect(sendSmsOtpMock).toHaveBeenCalledWith('+919876543210', expect.stringMatching(/^\d{6}$/));
    expect(sendOtpEmailMock).not.toHaveBeenCalled();
  });

  it('falls back to email when the customer has no phone on file', async () => {
    arm({ customer: { id: 'c1', name: 'Priya', phone: null, email: 'priya@example.com' } });
    prismaMock.completionOtpChallenge.findFirst.mockResolvedValue(null);
    sendOtpEmailMock.mockResolvedValue(true);

    await requestCompletionOtp(CALLER_ID, CODE);

    expect(sendOtpEmailMock).toHaveBeenCalledWith('priya@example.com', expect.stringMatching(/^\d{6}$/));
    expect(sendSmsOtpMock).not.toHaveBeenCalled();
  });

  it('rejects with SERVER_ERROR and sends nothing when the customer has neither phone nor email', async () => {
    arm({ customer: { id: 'c1', name: 'Priya', phone: null, email: null } });
    prismaMock.completionOtpChallenge.findFirst.mockResolvedValue(null);

    await expect(requestCompletionOtp(CALLER_ID, CODE)).rejects.toMatchObject({ code: 'SERVER_ERROR' });
    expect(prismaMock.completionOtpChallenge.create).not.toHaveBeenCalled();
    expect(sendSmsOtpMock).not.toHaveBeenCalled();
    expect(sendOtpEmailMock).not.toHaveBeenCalled();
  });

  it('rejects with SERVER_ERROR when the provider fails to deliver', async () => {
    arm();
    prismaMock.completionOtpChallenge.findFirst.mockResolvedValue(null);
    sendSmsOtpMock.mockResolvedValue(false);

    await expect(requestCompletionOtp(CALLER_ID, CODE)).rejects.toMatchObject({ code: 'SERVER_ERROR' });
  });

  it('rejects a shipped-product voucher with VALIDATION_ERROR — completion-OTP does not apply to a shipment', async () => {
    arm({ fulfilmentKind: 'PRODUCT_SHIPPED', entitlementStatus: 'STARTED' });
    await expect(requestCompletionOtp(CALLER_ID, CODE)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects CONFLICT when the entitlement is already COMPLETED', async () => {
    arm({ entitlementStatus: 'COMPLETED' });
    await expect(requestCompletionOtp(CALLER_ID, CODE)).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

/**
 * Feature: Voucher completion — OTP expiry/attempts + the concurrent-completion guard
 * Scenario: the conditional `updateMany` (guarded by current entitlementStatus) is what actually
 * prevents two near-simultaneous `complete` calls from both succeeding — simulated here as two
 * sequential calls sharing the same still-valid, already-verified-match OTP, where the SECOND
 * call's `updateMany` reports `count: 0` (exactly what a real DB would report once the first call
 * already flipped the row out of STARTED/OTP_REQUESTED).
 */
describe('completeVoucher', () => {
  function arm(entitlementOverrides: Record<string, unknown> = {}) {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ entitlementStatus: 'OTP_REQUESTED', ...entitlementOverrides }) as never);
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    prismaMock.financeSettings.upsert.mockResolvedValue(financeSettingsFixture as never);
  }

  it('rejects UNAUTHORIZED when there is no pending OTP challenge', async () => {
    arm();
    prismaMock.completionOtpChallenge.findFirst.mockResolvedValue(null);
    await expect(completeVoucher(CALLER_ID, CODE, '123456')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects UNAUTHORIZED when the OTP has expired', async () => {
    arm();
    prismaMock.completionOtpChallenge.findFirst.mockResolvedValue({
      id: CHALLENGE_ID, hashedOtp: 'hashed-otp', attempts: 0, expiresAt: new Date(Date.now() - 1000),
    } as never);
    await expect(completeVoucher(CALLER_ID, CODE, '123456')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects RATE_LIMITED once attempts reach the configured max', async () => {
    arm();
    prismaMock.completionOtpChallenge.findFirst.mockResolvedValue({
      id: CHALLENGE_ID, hashedOtp: 'hashed-otp', attempts: 5, expiresAt: new Date(Date.now() + 60_000),
    } as never);
    await expect(completeVoucher(CALLER_ID, CODE, '123456')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('rejects UNAUTHORIZED and increments attempts on a wrong OTP', async () => {
    arm();
    prismaMock.completionOtpChallenge.findFirst.mockResolvedValue({
      id: CHALLENGE_ID, hashedOtp: 'hashed-otp', attempts: 1, expiresAt: new Date(Date.now() + 60_000),
    } as never);
    bcryptCompareMock.mockResolvedValue(false);

    await expect(completeVoucher(CALLER_ID, CODE, '000000')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(prismaMock.completionOtpChallenge.update).toHaveBeenCalledWith({ where: { id: CHALLENGE_ID }, data: { attempts: { increment: 1 } } });
  });

  it('exactly one of two near-simultaneous complete calls succeeds — the second gets a clean CONFLICT, never a duplicate transition', async () => {
    const challenge = { id: CHALLENGE_ID, hashedOtp: 'hashed-otp', attempts: 0, expiresAt: new Date(Date.now() + 60_000) };
    arm();
    prismaMock.completionOtpChallenge.findFirst.mockResolvedValue(challenge as never);
    bcryptCompareMock.mockResolvedValue(true);
    prismaMock.purchaseEntitlement.updateMany
      .mockResolvedValueOnce({ count: 1 } as never) // first caller wins the race
      .mockResolvedValueOnce({ count: 0 } as never); // second caller's conditional update matches nothing
    prismaMock.purchaseEntitlement.findUniqueOrThrow.mockResolvedValue(entitlementFixture({ entitlementStatus: 'COMPLETED', settlementStatus: 'ON_HOLD' }) as never);

    const [first, second] = await Promise.allSettled([
      completeVoucher(CALLER_ID, CODE, '123456'),
      completeVoucher(CALLER_ID, CODE, '123456'),
    ]);

    expect(first.status).toBe('fulfilled');
    expect(second.status).toBe('rejected');
    if (second.status === 'rejected') {
      expect(second.reason).toMatchObject({ code: 'CONFLICT' });
    }
    // Only the winner ever marks the OTP challenge as verified.
    expect(prismaMock.completionOtpChallenge.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.completionOtpChallenge.update).toHaveBeenCalledWith({ where: { id: CHALLENGE_ID }, data: { verifiedAt: expect.any(Date) } });
  });
});

/**
 * Feature: Service Queue — ownership scoping + actionable-before-closed ordering, no duplicates
 */
describe('listMyVoucherQueue', () => {
  function queueRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'q-1',
      voucherCode: CODE,
      entitlementStatus: 'ACTIVE',
      fulfilmentKind: 'SERVICE_SESSION',
      settlementStatus: 'PENDING_FULFILMENT',
      orderItem: { itemName: '60-min Massage' },
      customer: { name: 'Priya' },
      ...overrides,
    };
  }

  it('throws NOT_FOUND when the caller has no vendor profile yet — never a bare empty page', async () => {
    prismaMock.vendor.findUnique.mockResolvedValue(null);
    await expect(listMyVoucherQueue(CALLER_ID, { page: 1, pageSize: 20 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(prismaMock.purchaseEntitlement.count).not.toHaveBeenCalled();
  });

  it('scopes every query to the caller\'s own vendorId — never another vendor\'s rows', async () => {
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    prismaMock.purchaseEntitlement.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    prismaMock.purchaseEntitlement.findMany.mockResolvedValue([]);

    await listMyVoucherQueue(CALLER_ID, { page: 1, pageSize: 20 });

    expect(prismaMock.purchaseEntitlement.count).toHaveBeenNthCalledWith(1, {
      where: { vendorId: VENDOR_ID, entitlementStatus: { in: ['ACTIVE', 'STARTED', 'OTP_REQUESTED'] } },
    });
    expect(prismaMock.purchaseEntitlement.count).toHaveBeenNthCalledWith(2, {
      where: { vendorId: VENDOR_ID, entitlementStatus: { in: ['COMPLETED', 'CANCELLED', 'REFUNDED'] } },
    });
  });

  it('maps a queue row to voucherCode/itemName/customerName/entitlementStatus/fulfilmentKind/settlementStatus — one DB row, one queue row', async () => {
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    prismaMock.purchaseEntitlement.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    prismaMock.purchaseEntitlement.findMany.mockResolvedValue([queueRow()] as never);

    const { items, total } = await listMyVoucherQueue(CALLER_ID, { page: 1, pageSize: 20 });

    expect(total).toBe(1);
    expect(items).toEqual([
      {
        id: 'q-1',
        voucherCode: CODE,
        itemName: '60-min Massage',
        customerName: 'Priya',
        entitlementStatus: 'ACTIVE',
        fulfilmentKind: 'SERVICE_SESSION',
        settlementStatus: 'PENDING_FULFILMENT',
      },
    ]);
  });

  it('fills the rest of a page from the closed group once the actionable group runs out — actionable rows always come first', async () => {
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    // 1 actionable row total, page size 2 -> 1 from actionable + 1 from closed.
    prismaMock.purchaseEntitlement.count.mockResolvedValueOnce(1).mockResolvedValueOnce(5);
    prismaMock.purchaseEntitlement.findMany
      .mockResolvedValueOnce([queueRow({ id: 'actionable-1' })] as never)
      .mockResolvedValueOnce([queueRow({ id: 'closed-1', entitlementStatus: 'COMPLETED' })] as never);

    const { items, total } = await listMyVoucherQueue(CALLER_ID, { page: 1, pageSize: 2 });

    expect(total).toBe(6);
    expect(items.map((i) => i.id)).toEqual(['actionable-1', 'closed-1']);
    expect(prismaMock.purchaseEntitlement.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ skip: 0, take: 2 }));
    expect(prismaMock.purchaseEntitlement.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ take: 1 }));
  });

  it('pages purely within the closed group once past every actionable row', async () => {
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    prismaMock.purchaseEntitlement.count.mockResolvedValueOnce(2).mockResolvedValueOnce(10);
    prismaMock.purchaseEntitlement.findMany.mockResolvedValue([queueRow({ id: 'closed-page-2', entitlementStatus: 'COMPLETED' })] as never);

    const { total } = await listMyVoucherQueue(CALLER_ID, { page: 2, pageSize: 2 });

    expect(total).toBe(12);
    // page 2, pageSize 2 => skip 2, which is >= actionableTotal(2) => pure closed-group query, skip 0 within that group
    expect(prismaMock.purchaseEntitlement.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.purchaseEntitlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ entitlementStatus: { in: ['COMPLETED', 'CANCELLED', 'REFUNDED'] } }), skip: 0, take: 2 }),
    );
  });

  it('passes the search term into both groups\' where clauses', async () => {
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    prismaMock.purchaseEntitlement.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    prismaMock.purchaseEntitlement.findMany.mockResolvedValue([]);

    await listMyVoucherQueue(CALLER_ID, { page: 1, pageSize: 20, search: 'Priya' });

    expect(prismaMock.purchaseEntitlement.count).toHaveBeenNthCalledWith(1, {
      where: expect.objectContaining({
        OR: expect.arrayContaining([{ voucherCode: { contains: 'Priya', mode: 'insensitive' } }]),
      }),
    });
  });
});
