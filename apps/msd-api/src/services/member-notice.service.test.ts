import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendEmail = vi.fn();
const sendTextSms = vi.fn();
vi.mock('../providers/email/smtp.provider', () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
vi.mock('../providers/sms/connectExpress.provider', () => ({ sendTextSms: (...a: unknown[]) => sendTextSms(...a) }));
vi.mock('../config/env', () => ({ env: { supportEmail: 'help@msd.test', supportPhone: '+911234567890' } }));

import { sendMemberNotice } from './member-notice.service';

beforeEach(() => {
  vi.clearAllMocks();
  sendEmail.mockResolvedValue(true);
  sendTextSms.mockResolvedValue(true);
});

describe('sendMemberNotice', () => {
  it('sends both channels for a suspension, with the reason in the text', async () => {
    const result = await sendMemberNotice('SUSPENDED', { name: 'Asha', email: 'a@x.com', phone: '+919876543210' }, 'Documents not completed');
    expect(result).toEqual({ email: true, sms: true });
    expect(sendEmail).toHaveBeenCalledWith('a@x.com', expect.stringMatching(/suspended/i), expect.stringContaining('Documents not completed'));
    expect(sendTextSms).toHaveBeenCalledWith('+919876543210', expect.stringContaining('Documents not completed'));
  });

  it('skips a channel that has no contact detail', async () => {
    const result = await sendMemberNotice('REACTIVATED', { email: null, phone: '+919876543210' });
    expect(result).toEqual({ email: null, sms: true });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('retries a failed send once and reports the final result', async () => {
    sendEmail.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const result = await sendMemberNotice('WELCOME', { name: 'Asha', email: 'a@x.com' });
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(result.email).toBe(true);
  });

  it('never throws when a provider throws', async () => {
    sendEmail.mockRejectedValue(new Error('smtp down'));
    await expect(sendMemberNotice('SUSPENDED', { email: 'a@x.com' }, 'x'.repeat(12))).resolves.toEqual({ email: false, sms: null });
  });
});
