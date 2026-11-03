import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});
vi.mock('../providers/sms/connectExpress.provider', () => ({
  sendOtp: vi.fn().mockResolvedValue(true),
  missingOtpConfiguration: vi.fn().mockReturnValue([]),
}));
vi.mock('../providers/email/smtp.provider', () => ({ sendOtpEmail: vi.fn().mockResolvedValue(true) }));

import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { requestOtp, verifyOtp } from './otp.service';
import { missingOtpConfiguration, sendOtp } from '../providers/sms/connectExpress.provider';
import { sendOtpEmail } from '../providers/email/smtp.provider';

const prismaMock = vi.mocked(prisma, true);
const smsMock = vi.mocked(sendOtp);
const otpVariables = [
  'adminLoginOtp',
  'memberLoginOtp',
  'salesLoginOtp',
  'marketingLoginOtp',
  'supportLoginOtp',
  'superAdminLoginMobile',
  'superAdminLoginOtp',
] as const;
const originalProvider = env.otpProvider;
const originalOtps = Object.fromEntries(otpVariables.map((key) => [key, env[key]])) as Record<(typeof otpVariables)[number], string>;

const staffRoles = [
  ['admin', 'adminLoginOtp', '222222'],
  ['member', 'memberLoginOtp', '333333'],
  ['sales', 'salesLoginOtp', '444444'],
  ['marketing', 'marketingLoginOtp', '555555'],
  ['support', 'supportLoginOtp', '666666'],
] as const;

function useAccount(role: string, overrides: { status?: string; deletedAt?: Date | null } = {}) {
  prismaMock.user.findFirst.mockResolvedValue({
    id: '2cbd17b8-213b-4b2b-a150-1b4cda050111',
    status: overrides.status ?? 'active',
    deletedAt: overrides.deletedAt ?? null,
    roles: [{ role: { key: role } }],
  } as never);
  prismaMock.member.findUnique.mockResolvedValue(null);
}

beforeEach(() => {
  vi.clearAllMocks();
  env.otpProvider = 'dummy';
  env.adminLoginOtp = '222222';
  env.memberLoginOtp = '333333';
  env.salesLoginOtp = '444444';
  env.marketingLoginOtp = '555555';
  env.supportLoginOtp = '666666';
  env.superAdminLoginMobile = '+919999999999';
  env.superAdminLoginOtp = '111111';
  prismaMock.otpChallenge.create.mockResolvedValue({} as never);
  prismaMock.otpChallenge.findFirst.mockResolvedValue(null);
  prismaMock.user.findFirst.mockResolvedValue(null);
  prismaMock.member.findUnique.mockResolvedValue(null);
});

afterEach(() => {
  env.otpProvider = originalProvider;
  for (const key of otpVariables) env[key] = originalOtps[key];
});

describe('environment dummy OTP provider', () => {
  it('authenticates a customer by their registered phone with the fixed customer OTP', async () => {
    useAccount('customer');
    await requestOtp('+919123456789', 'login');
    await expect(verifyOtp('+919123456789', '111111')).resolves.toBeUndefined();
    expect(prismaMock.otpChallenge.create).not.toHaveBeenCalled();
    expect(prismaMock.otpChallenge.findFirst).not.toHaveBeenCalled();
    expect(smsMock).not.toHaveBeenCalled();
  });

  it('does not allow an unregistered phone to use the customer OTP', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    await expect(verifyOtp('+919123456789', '111111')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(prismaMock.otpChallenge.findFirst).not.toHaveBeenCalled();
  });

  it.each(staffRoles)('uses only the configured %s OTP and stores no credential challenge', async (role, configKey, otp) => {
    useAccount(role);
    await requestOtp('+919123456789', 'login');
    await expect(verifyOtp('+919123456789', otp)).resolves.toBeUndefined();
    expect(prismaMock.otpChallenge.create).not.toHaveBeenCalled();
    expect(prismaMock.otpChallenge.findFirst).not.toHaveBeenCalled();
    expect(env[configKey]).toBe(otp);
    expect(smsMock).not.toHaveBeenCalled();
  });

  it.each(staffRoles)('rejects a different role OTP for %s', async (role, _configKey, otp) => {
    useAccount(role);
    const otherOtp = staffRoles.find(([otherRole]) => otherRole !== role)![2];
    await expect(verifyOtp('+919123456789', otherOtp)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(otp).not.toBe(otherOtp);
    expect(smsMock).not.toHaveBeenCalled();
  });

  it('keeps Super Admin on the separately configured number and OTP', async () => {
    useAccount('super_admin');
    await requestOtp('+919999999999', 'login');
    await expect(verifyOtp('+919999999999', '111111')).resolves.toBeUndefined();
    await expect(verifyOtp('+919999999999', '222222')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(prismaMock.otpChallenge.create).not.toHaveBeenCalled();
    expect(smsMock).not.toHaveBeenCalled();
  });

  it('keeps Super Admin on the fixed environment credential when the other roles use SMS', async () => {
    env.otpProvider = 'sms';
    useAccount('super_admin');
    await requestOtp('+919999999999', 'login');
    await expect(verifyOtp('+919999999999', '111111')).resolves.toBeUndefined();
    expect(prismaMock.otpChallenge.create).not.toHaveBeenCalled();
    expect(prismaMock.otpChallenge.findFirst).not.toHaveBeenCalled();
    expect(smsMock).not.toHaveBeenCalled();
  });

  it('does not allow a different phone to use the configured Super Admin OTP', async () => {
    useAccount('admin');
    await expect(verifyOtp('+919123456789', '111111')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('does not allow a non-Super-Admin account on the configured Super Admin mobile', async () => {
    useAccount('admin');
    await expect(requestOtp('+919999999999', 'login')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(smsMock).not.toHaveBeenCalled();
  });

  it('does not allow a staff or Super Admin email to bypass mobile-based login', async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      roles: [{ role: { key: 'sales' } }],
    } as never);
    await requestOtp('sales@example.test', 'login');
    await expect(verifyOtp('sales@example.test', '123456')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(prismaMock.otpChallenge.create).not.toHaveBeenCalled();
    expect(prismaMock.otpChallenge.findFirst).not.toHaveBeenCalled();
    expect(vi.mocked(sendOtpEmail)).not.toHaveBeenCalled();
  });

  it('fails safely when a role credential is missing or malformed', async () => {
    useAccount('sales');
    env.salesLoginOtp = '';
    await expect(requestOtp('+919123456789', 'login')).rejects.toThrow('SALES_LOGIN_OTP');
    env.salesLoginOtp = 'oops';
    await expect(requestOtp('+919123456789', 'login')).rejects.toThrow('SALES_LOGIN_OTP');
    expect(smsMock).not.toHaveBeenCalled();
  });

  it('fails safely when Super Admin configuration is missing', async () => {
    useAccount('super_admin');
    env.superAdminLoginMobile = '';
    await expect(requestOtp('+919123456789', 'login')).rejects.toThrow('SUPERADMIN_LOGIN_MOBILE');
    env.superAdminLoginMobile = '+919999999999';
    env.superAdminLoginOtp = '';
    await expect(requestOtp('+919999999999', 'login')).rejects.toThrow('SUPERADMIN_LOGIN_OTP');
  });

  it('requires an existing active account with the actual configured role', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    await expect(verifyOtp('+919123456789', '222222')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    useAccount('sales', { status: 'inactive' });
    await expect(verifyOtp('+919123456789', '444444')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    useAccount('sales', { deletedAt: new Date() });
    await expect(verifyOtp('+919123456789', '444444')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(prismaMock.otpChallenge.create).not.toHaveBeenCalled();
  });

  it('uses the existing SMS challenge flow and does not fall back when SMS fails', async () => {
    env.otpProvider = 'sms';
    vi.mocked(sendOtp).mockResolvedValueOnce(false);

    await expect(requestOtp('+919876543210', 'login')).rejects.toThrow('Failed to send OTP via SMS provider');
    expect(smsMock).toHaveBeenCalledOnce();
    expect(prismaMock.otpChallenge.create).toHaveBeenCalledOnce();
  });

  it('fails clearly when SMS provider configuration is missing', async () => {
    env.otpProvider = 'sms';
    vi.mocked(missingOtpConfiguration).mockReturnValueOnce(['SMS_API_KEY']);

    await expect(requestOtp('+919876543210', 'login')).rejects.toThrow('SMS_API_KEY');
    expect(prismaMock.otpChallenge.create).not.toHaveBeenCalled();
    expect(smsMock).not.toHaveBeenCalled();
  });
});
