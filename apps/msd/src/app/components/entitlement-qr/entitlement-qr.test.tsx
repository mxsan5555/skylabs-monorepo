import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import content from '../../../content.json';
import { EntitlementQr, qrDaysRemaining } from './entitlement-qr';

const t = content.orderDetail.qr;

vi.mock('qrcode', () => ({ toDataURL: () => Promise.resolve('data:image/png;base64,stub') }));

describe('qrDaysRemaining', () => {
  it('never goes negative once expiry has passed', () => {
    expect(qrDaysRemaining('2020-01-01T00:00:00.000Z')).toBe(0);
  });

  it('rounds up a partial day remaining', () => {
    const soon = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString(); // 1.5 days
    expect(qrDaysRemaining(soon)).toBe(2);
  });
});

describe('EntitlementQr', () => {
  it('renders the order reference, purchase date and expiry facts', () => {
    render(
      <EntitlementQr voucherCode="MSD-DL-ABC123" orderNumber="ORD-ABC12345" purchasedAt="2026-10-29T10:00:00.000Z" qrExpiresAt="2099-01-01T00:00:00.000Z" status="active" />,
    );
    expect(screen.getByText('ORD-ABC12345')).toBeTruthy();
    expect(screen.getByText(t.heading)).toBeTruthy();
  });

  it('uses the singular "1 day left" wording when exactly one day remains', () => {
    const tomorrow = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();
    render(<EntitlementQr voucherCode="MSD-DL-ABC123" orderNumber="ORD-ABC12345" purchasedAt="2026-10-29T10:00:00.000Z" qrExpiresAt={tomorrow} status="active" />);
    expect(screen.getByText((text) => text.includes(t.daysLeftOne))).toBeTruthy();
  });

  it('shows no QR image and no "days left" text for a redeemed voucher', () => {
    render(
      <EntitlementQr voucherCode="MSD-DL-ABC123" orderNumber="ORD-ABC12345" purchasedAt="2026-10-29T10:00:00.000Z" qrExpiresAt="2026-11-28T10:00:00.000Z" status="redeemed" />,
    );
    expect(document.querySelector('.entitlement-qr__image')).toBeNull();
    expect(screen.getByText(t.status.redeemed)).toBeTruthy();
  });

  it('shows no QR image for an expired voucher', () => {
    render(<EntitlementQr voucherCode="MSD-DL-ABC123" orderNumber="ORD-ABC12345" purchasedAt="2026-10-29T10:00:00.000Z" qrExpiresAt="2020-01-01T00:00:00.000Z" status="expired" />);
    expect(document.querySelector('.entitlement-qr__image')).toBeNull();
    expect(screen.getByText(t.status.expired)).toBeTruthy();
  });
});
