import { env } from '../config/env';
import { contactLine } from './member-messages';

/** One order as a customer notice needs it (item 3). Amounts are plain numbers in rupees. */
export interface OrderNoticeOrder {
  id: string;
  number: string;
  total: number;
  items: { name: string; quantity: number; lineTotal: number; memberName: string }[];
}

export interface OrderNoticeInput {
  customerName: string | null;
  orders: OrderNoticeOrder[];
  /** RAZORPAY or COD, for the confirmation's "paid by" line. */
  provider: 'RAZORPAY' | 'COD' | null;
}

const inr = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** The storefront origin for links: PUBLIC_SITE_URL, else the first CORS origin. */
export function siteUrl(): string {
  return env.publicSiteUrl || (env.corsOrigin[0] ?? '').replace(/\/$/, '');
}

const orderUrl = (orderId: string) => `${siteUrl()}/orders/${orderId}`;
const greeting = (name: string | null) => `Hi ${name?.trim() || 'there'},`;
const numbers = (orders: OrderNoticeOrder[]) => orders.map((order) => order.number).join(', ');
const grandTotal = (orders: OrderNoticeOrder[]) => orders.reduce((sum, order) => sum + order.total, 0);

function itemLines(orders: OrderNoticeOrder[]): string {
  return orders
    .flatMap((order) => order.items.map((item) => `- ${item.name} × ${item.quantity} (${item.memberName}): ${inr(item.lineTotal)}`))
    .join('\n');
}

function links(orders: OrderNoticeOrder[]): string {
  return orders.map((order) => `${order.number}: ${orderUrl(order.id)}`).join('\n');
}

/** Email after payment (or a cash-on-delivery order) is confirmed. */
export function orderConfirmedEmail(input: OrderNoticeInput) {
  const paidBy = input.provider === 'COD' ? 'Pay on delivery or at the venue' : 'Paid online';
  return {
    subject: `Your MSD order ${numbers(input.orders)} is confirmed`,
    text: [
      greeting(input.customerName),
      '',
      `Thank you for your order. We have confirmed ${numbers(input.orders)}.`,
      '',
      itemLines(input.orders),
      '',
      `Total: ${inr(grandTotal(input.orders))} (${paidBy})`,
      '',
      'See your order, voucher and invoice:',
      links(input.orders),
      '',
      `Questions about this order? ${contactLine()}.`,
    ].join('\n'),
  };
}

/** Email after an online payment fails. The order stays open, so the customer can pay again. */
export function paymentFailedEmail(input: OrderNoticeInput) {
  return {
    subject: `Payment for your MSD order ${numbers(input.orders)} did not go through`,
    text: [
      greeting(input.customerName),
      '',
      `Your payment of ${inr(grandTotal(input.orders))} for ${numbers(input.orders)} did not go through, so the order is not confirmed yet.`,
      'Your order is saved. Open it to pay again:',
      links(input.orders),
      '',
      `If money left your account, your bank returns it. ${contactLine()} if you need help.`,
    ].join('\n'),
  };
}

/** SMS text (D38: sent only when the matching DLT template id is set). */
export function orderConfirmedSms(input: OrderNoticeInput): string {
  return `MSD: order ${numbers(input.orders)} is confirmed. Total ${inr(grandTotal(input.orders))}. Details: ${orderUrl(input.orders[0].id)}`;
}

export function paymentFailedSms(input: OrderNoticeInput): string {
  return `MSD: payment for order ${numbers(input.orders)} did not go through. Pay again: ${orderUrl(input.orders[0].id)}`;
}
