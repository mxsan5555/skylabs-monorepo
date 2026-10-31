import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});
vi.mock('../config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/env')>();
  return {
    env: {
      ...actual.env,
      otpProvider: 'sms',
      supportEmail: '',
      supportPhone: '',
      otpExpiryMinutes: 10,
      otpMaxAttempts: 5,
    },
  };
});
vi.mock('../providers/sms/connectExpress.provider', () => ({
  sendOtp: vi.fn().mockResolvedValue(true),
  missingOtpConfiguration: vi.fn().mockReturnValue([]),
}));
vi.mock('../providers/email/smtp.provider', () => ({ sendOtpEmail: vi.fn().mockResolvedValue(true) }));
vi.mock('./token.service', () => ({ issueRefreshSession: vi.fn().mockResolvedValue('refresh-token') }));

import { prisma } from '../lib/prisma';
import { loginWithIdentifier, loginWithGoogle } from './auth.service';
import { requestOtp } from './otp.service';
import { sendOtp } from '../providers/sms/connectExpress.provider';
import { sendOtpEmail } from '../providers/email/smtp.provider';

const prismaMock = vi.mocked(prisma, true);
const PHONE = '+919876543210';

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.member.findUnique.mockReset();
  prismaMock.user.findFirst.mockReset();
});

function arrangeSuccessfulLogin() {
  prismaMock.user.upsert.mockResolvedValue({ id: 'u1', name: 'A', email: null, phone: PHONE, roles: [{}] } as never);
  prismaMock.userRole.findMany.mockResolvedValue([{ role: { key: 'member' } }] as never);
  prismaMock.loginHistory.create.mockResolvedValue({} as never);
}

describe('suspended member cannot log in or receive an OTP', () => {
  it('refuses login with MEMBER_SUSPENDED and records a failed attempt', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u1', status: 'active' } as never);
    prismaMock.member.findUnique.mockResolvedValue({ status: 'SUSPENDED', statusReason: 'Rule break reported' } as never);
    await expect(loginWithIdentifier(PHONE)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      (async () => {
        prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u1', status: 'active' } as never);
        return loginWithIdentifier(PHONE);
      })(),
    ).rejects.toThrow('Your member account is suspended. Please contact support.');
    expect(prismaMock.loginHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'u1', success: false }) }),
    );
    expect(prismaMock.user.upsert).not.toHaveBeenCalled();
  });

  it('refuses login for an archived member', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u1', status: 'active' } as never);
    prismaMock.member.findUnique.mockResolvedValue({ status: 'ARCHIVED', statusReason: null } as never);
    await expect(loginWithIdentifier(PHONE)).rejects.toMatchObject({ code: 'MEMBER_SUSPENDED' });
    expect(prismaMock.user.upsert).not.toHaveBeenCalled();
  });

  it('refuses Google login for a suspended member', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u1', status: 'active', name: 'A' } as never);
    prismaMock.member.findUnique.mockResolvedValue({ status: 'SUSPENDED', statusReason: null } as never);
    await expect(loginWithGoogle('g1', 'a@example.com', 'A')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('refuses the phone OTP request, creates no challenge and sends no SMS', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'u1' } as never);
    prismaMock.member.findUnique.mockResolvedValue({ status: 'SUSPENDED', statusReason: 'Rule break reported' } as never);
    await expect(requestOtp(PHONE, 'login')).rejects.toMatchObject({ code: 'MEMBER_SUSPENDED' });
    expect(prismaMock.otpChallenge.create).not.toHaveBeenCalled();
    expect(sendOtp).not.toHaveBeenCalled();
  });

  it('refuses the email OTP request and sends no email', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'u1' } as never);
    prismaMock.member.findUnique.mockResolvedValue({ status: 'ARCHIVED', statusReason: null } as never);
    await expect(requestOtp('a@example.com', 'login')).rejects.toMatchObject({ code: 'MEMBER_SUSPENDED' });
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'a@example.com', deletedAt: null } }),
    );
    expect(prismaMock.otpChallenge.create).not.toHaveBeenCalled();
    expect(sendOtpEmail).not.toHaveBeenCalled();
  });

  it('lets an inactive member log in', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u1', status: 'active' } as never);
    prismaMock.member.findUnique.mockResolvedValue({ status: 'INACTIVE', statusReason: null } as never);
    arrangeSuccessfulLogin();
    await expect(loginWithIdentifier(PHONE)).resolves.toHaveProperty('accessToken');
  });

  it('lets an inactive member request an OTP', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'u1' } as never);
    prismaMock.member.findUnique.mockResolvedValue({ status: 'INACTIVE', statusReason: null } as never);
    prismaMock.otpChallenge.create.mockResolvedValue({} as never);
    await expect(requestOtp(PHONE, 'login')).resolves.toBeUndefined();
    expect(prismaMock.otpChallenge.create).toHaveBeenCalledTimes(1);
    expect(sendOtp).toHaveBeenCalledTimes(1);
  });

  it('leaves a non-member user unaffected at login and OTP request', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u1', status: 'active' } as never);
    arrangeSuccessfulLogin();
    await expect(loginWithIdentifier(PHONE)).resolves.toHaveProperty('accessToken');

    prismaMock.user.findFirst.mockResolvedValue({ id: 'u1' } as never);
    prismaMock.otpChallenge.create.mockResolvedValue({} as never);
    await expect(requestOtp(PHONE, 'login')).resolves.toBeUndefined();
    expect(prismaMock.otpChallenge.create).toHaveBeenCalledTimes(1);
  });

  it('lets a brand-new identifier request an OTP without a member lookup', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null as never);
    prismaMock.otpChallenge.create.mockResolvedValue({} as never);
    await expect(requestOtp(PHONE, 'login')).resolves.toBeUndefined();
    expect(prismaMock.member.findUnique).not.toHaveBeenCalled();
  });
});
