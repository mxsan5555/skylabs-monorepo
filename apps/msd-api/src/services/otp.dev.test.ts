import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});
vi.mock('../providers/sms/connectExpress.provider', () => ({ sendOtp: vi.fn().mockResolvedValue(true) }));
vi.mock('../providers/email/smtp.provider', () => ({ sendOtpEmail: vi.fn().mockResolvedValue(true) }));

import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { setLogSink } from '../lib/logger';
import { requestOtp } from './otp.service';
import { isDevOtpIdentifier } from '../lib/dev-otp';
import { sendOtp } from '../providers/sms/connectExpress.provider';
import { sendOtpEmail } from '../providers/email/smtp.provider';

const prismaMock = vi.mocked(prisma, true);
let lines: string[] = [];
const original = { nodeEnv: env.nodeEnv, list: env.devOtpIdentifiers };

beforeEach(() => {
  vi.clearAllMocks();
  lines = [];
  setLogSink((line) => lines.push(line));
  prismaMock.user.findFirst.mockResolvedValue(null);
  prismaMock.otpChallenge.create.mockResolvedValue({} as never);
  env.nodeEnv = 'development';
  env.devOtpIdentifiers = ['9112312391', 'Test@Test.com'];
});
afterEach(() => {
  setLogSink(null);
  env.nodeEnv = original.nodeEnv;
  env.devOtpIdentifiers = original.list;
});

const devLine = () => lines.map((l) => JSON.parse(l)).find((e) => e.event === 'otp.dev_console');

/** Local test accounts get their OTP in the API console instead of an SMS or email. */
describe('dev OTP identifiers', () => {
  it('matches a phone in either form and an email in any case', () => {
    expect(isDevOtpIdentifier('+919112312391')).toBe(true);
    expect(isDevOtpIdentifier('9112312391')).toBe(true);
    expect(isDevOtpIdentifier('test@test.com')).toBe(true);
    expect(isDevOtpIdentifier('someone@else.com')).toBe(false);
  });

  it('prints the OTP for a listed phone and sends no SMS', async () => {
    await requestOtp('+919112312391', 'login');
    expect(sendOtp).not.toHaveBeenCalled();
    const entry = devLine();
    expect(entry).toMatchObject({ level: 'warn', identifier: '+919112312391' });
    expect(entry.code).toMatch(/^\d{6}$/);
    expect(prismaMock.otpChallenge.create).toHaveBeenCalledOnce();
  });

  it('prints the OTP for a listed email and sends no email', async () => {
    await requestOtp('test@test.com', 'login');
    expect(sendOtpEmail).not.toHaveBeenCalled();
    expect(devLine()?.code).toMatch(/^\d{6}$/);
  });

  it('still sends a real OTP for an identifier that is not listed', async () => {
    await requestOtp('+919876543210', 'login');
    expect(sendOtp).toHaveBeenCalledOnce();
    expect(devLine()).toBeUndefined();
  });

  it('never applies in production, even with a list set', async () => {
    env.nodeEnv = 'production';
    expect(isDevOtpIdentifier('+919112312391')).toBe(false);
    await requestOtp('+919112312391', 'login');
    expect(sendOtp).toHaveBeenCalledOnce();
    expect(devLine()).toBeUndefined();
  });
});
