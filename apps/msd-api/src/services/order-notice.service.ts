import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { isDevOtpIdentifier } from '../lib/dev-otp';
import {
  orderConfirmedEmail,
  orderConfirmedSms,
  paymentFailedEmail,
  paymentFailedSms,
  type OrderNoticeInput,
} from '../lib/order-messages';
import { sendEmail } from '../providers/email/smtp.provider';
import { sendTextSms } from '../providers/sms/connectExpress.provider';
import { shortOrderNumber } from './notification.service';

export type OrderNoticeKind = 'CONFIRMED' | 'PAYMENT_FAILED';

export interface OrderNoticeResult {
  /** null when there is no email to send to. */
  email: boolean | null;
  /** null when there is no phone, or (D38) no DLT template id for this notice. */
  sms: boolean | null;
}

const NONE: OrderNoticeResult = { email: null, sms: null };

/** D38: the DLT template id per notice; an empty one means no SMS. */
function smsTemplateFor(kind: OrderNoticeKind): string {
  return kind === 'CONFIRMED' ? env.smsDltTemplateOrderConfirmed : env.smsDltTemplatePaymentFailed;
}

/** Local test accounts (DEV_OTP_IDENTIFIERS) get the notice in the API console, like their OTP. */
async function deliver(to: string, channel: 'email' | 'sms', send: () => Promise<boolean>, preview: Record<string, string>) {
  if (isDevOtpIdentifier(to)) {
    logger.warn('order.notice_dev_console', { to, channel, ...preview });
    return true;
  }
  try {
    return await send();
  } catch (err) {
    logger.error('order.notice_send_failed', { channel, error: (err as Error).message });
    return false;
  }
}

/**
 * Tells the customer about their order (item 3): a confirmation once payment (or cash on
 * delivery) is confirmed, or a payment-failed notice with a link to pay again. One message for a
 * combined checkout's orders. Goes to the order's checkout contact, else the account's own email
 * and phone. Call it after the transaction commits; it never throws, so a failed send never undoes
 * a payment.
 */
export async function sendOrderNotice(kind: OrderNoticeKind, orderIds: string[]): Promise<OrderNoticeResult> {
  try {
    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      orderBy: { createdAt: 'asc' },
      include: {
        items: { select: { itemName: true, quantity: true, lineTotal: true, vendorNameSnapshot: true } },
        customer: { select: { name: true, email: true, phone: true } },
        payments: { select: { provider: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (orders.length === 0) return NONE;
    const [first] = orders;
    const input: OrderNoticeInput = {
      customerName: first.contactName ?? first.customer.name,
      provider: first.payments[0]?.provider ?? null,
      orders: orders.map((order) => ({
        id: order.id,
        number: shortOrderNumber(order.id),
        total: Number(order.total),
        items: order.items.map((item) => ({
          name: item.itemName,
          quantity: item.quantity,
          lineTotal: Number(item.lineTotal),
          memberName: item.vendorNameSnapshot,
        })),
      })),
    };
    const email = first.contactEmail || first.customer.email;
    const phone = first.contactPhone || first.customer.phone;
    const { subject, text } = kind === 'CONFIRMED' ? orderConfirmedEmail(input) : paymentFailedEmail(input);
    const smsText = kind === 'CONFIRMED' ? orderConfirmedSms(input) : paymentFailedSms(input);

    const emailSent = email ? await deliver(email, 'email', () => sendEmail(email, subject, text), { subject, text }) : null;
    const smsSent =
      phone && smsTemplateFor(kind) ? await deliver(phone, 'sms', () => sendTextSms(phone, smsText), { text: smsText }) : null;
    return { email: emailSent, sms: smsSent };
  } catch (err) {
    logger.error('order.notice_failed', { kind, error: (err as Error).message });
    return NONE;
  }
}
