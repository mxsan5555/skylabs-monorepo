import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  findMany: vi.fn(),
  sendEmail: vi.fn(),
  sendTextSms: vi.fn(),
  warn: vi.fn(),
  env: {
    nodeEnv: 'development',
    devOtpIdentifiers: [] as string[],
    supportEmail: 'help@msd.test',
    supportPhone: '',
    publicSiteUrl: '',
    corsOrigin: ['http://localhost:4200'],
    smsDltTemplateOrderConfirmed: '',
    smsDltTemplatePaymentFailed: '',
  },
}));

vi.mock('../config/env', () => ({ env: m.env }));
vi.mock('../lib/prisma', () => ({ prisma: { order: { findMany: (...a: unknown[]) => m.findMany(...a) } } }));
vi.mock('../lib/logger', () => ({ logger: { warn: (...a: unknown[]) => m.warn(...a), error: vi.fn(), info: vi.fn() } }));
vi.mock('../providers/email/smtp.provider', () => ({ sendEmail: (...a: unknown[]) => m.sendEmail(...a) }));
vi.mock('../providers/sms/connectExpress.provider', () => ({ sendTextSms: (...a: unknown[]) => m.sendTextSms(...a) }));

import { sendOrderNotice } from './order-notice.service';

const ORDER = {
  id: '11111111-2222-3333-4444-5555abcd1234',
  total: '4478.00',
  contactName: 'Neeraj Singh',
  contactEmail: 'neeraj@test.com',
  contactPhone: '+919177889991',
  customer: { name: 'Neeraj', email: 'account@test.com', phone: '+919000000000' },
  payments: [{ provider: 'RAZORPAY' }],
  items: [
    { itemName: 'Repair Hair Treatment', quantity: 1, lineTotal: '3080.00', vendorNameSnapshot: 'Alok Kumar Wellness' },
    { itemName: 'Daily Hair Care Shampoo', quantity: 2, lineTotal: '1398.00', vendorNameSnapshot: 'Ravi Singh Spa' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  m.env.devOtpIdentifiers = [];
  m.env.smsDltTemplateOrderConfirmed = '';
  m.env.smsDltTemplatePaymentFailed = '';
  m.env.publicSiteUrl = '';
  m.findMany.mockResolvedValue([ORDER]);
  m.sendEmail.mockResolvedValue(true);
  m.sendTextSms.mockResolvedValue(true);
});

/** Item 3: the customer hears about their order on the email (and phone, D38) they gave. */
describe('sendOrderNotice', () => {
  it('emails the checkout contact a confirmation with every line, the total and the order link', async () => {
    const result = await sendOrderNotice('CONFIRMED', [ORDER.id]);
    expect(result).toEqual({ email: true, sms: null });
    const [to, subject, text] = m.sendEmail.mock.calls[0];
    expect(to).toBe('neeraj@test.com');
    expect(subject).toContain('ORD-ABCD1234');
    expect(subject).toContain('confirmed');
    expect(text).toContain('Hi Neeraj Singh,');
    expect(text).toContain('Repair Hair Treatment × 1 (Alok Kumar Wellness): ₹3,080');
    expect(text).toContain('Daily Hair Care Shampoo × 2 (Ravi Singh Spa): ₹1,398');
    expect(text).toContain('Total: ₹4,478 (Paid online)');
    expect(text).toContain(`http://localhost:4200/orders/${ORDER.id}`);
    expect(text).toContain('help@msd.test');
  });

  it('falls back to the account email when the order has no contact email, and uses PUBLIC_SITE_URL', async () => {
    m.env.publicSiteUrl = 'https://msd.example';
    m.findMany.mockResolvedValue([{ ...ORDER, contactEmail: null }]);
    await sendOrderNotice('CONFIRMED', [ORDER.id]);
    expect(m.sendEmail.mock.calls[0][0]).toBe('account@test.com');
    expect(m.sendEmail.mock.calls[0][2]).toContain(`https://msd.example/orders/${ORDER.id}`);
  });

  it('sends the payment-failed notice with a link to pay again', async () => {
    await sendOrderNotice('PAYMENT_FAILED', [ORDER.id]);
    const [, subject, text] = m.sendEmail.mock.calls[0];
    expect(subject).toContain('did not go through');
    expect(text).toContain('Open it to pay again');
    expect(text).toContain(`/orders/${ORDER.id}`);
  });

  it('sends an SMS only when the DLT template id for that notice is set (D38)', async () => {
    await sendOrderNotice('CONFIRMED', [ORDER.id]);
    expect(m.sendTextSms).not.toHaveBeenCalled();
    m.env.smsDltTemplateOrderConfirmed = '1107000000000000001';
    const result = await sendOrderNotice('CONFIRMED', [ORDER.id]);
    expect(m.sendTextSms).toHaveBeenCalledWith('+919177889991', expect.stringContaining('ORD-ABCD1234'));
    expect(result.sms).toBe(true);
    m.sendTextSms.mockClear();
    await sendOrderNotice('PAYMENT_FAILED', [ORDER.id]);
    expect(m.sendTextSms).not.toHaveBeenCalled();
  });

  it('prints the notice in the API console for local test accounts instead of sending', async () => {
    m.env.devOtpIdentifiers = ['neeraj@test.com'];
    const result = await sendOrderNotice('CONFIRMED', [ORDER.id]);
    expect(m.sendEmail).not.toHaveBeenCalled();
    expect(m.warn).toHaveBeenCalledWith('order.notice_dev_console', expect.objectContaining({ to: 'neeraj@test.com', channel: 'email' }));
    expect(result.email).toBe(true);
  });

  it('lists every order of a combined checkout in one email', async () => {
    const second = { ...ORDER, id: '99999999-2222-3333-4444-5555ffff0001', total: '500.00' };
    m.findMany.mockResolvedValue([ORDER, second]);
    await sendOrderNotice('CONFIRMED', [ORDER.id, second.id]);
    expect(m.sendEmail).toHaveBeenCalledTimes(1);
    expect(m.sendEmail.mock.calls[0][1]).toContain('ORD-ABCD1234, ORD-FFFF0001');
    expect(m.sendEmail.mock.calls[0][2]).toContain('Total: ₹4,978');
  });

  it('never throws: a database or provider error returns a result instead', async () => {
    m.sendEmail.mockRejectedValue(new Error('smtp down'));
    await expect(sendOrderNotice('CONFIRMED', [ORDER.id])).resolves.toEqual({ email: false, sms: null });
    m.findMany.mockRejectedValue(new Error('db down'));
    await expect(sendOrderNotice('CONFIRMED', [ORDER.id])).resolves.toEqual({ email: null, sms: null });
  });

  it('does nothing for an unknown order', async () => {
    m.findMany.mockResolvedValue([]);
    await expect(sendOrderNotice('CONFIRMED', ['nope'])).resolves.toEqual({ email: null, sms: null });
    expect(m.sendEmail).not.toHaveBeenCalled();
  });
});
