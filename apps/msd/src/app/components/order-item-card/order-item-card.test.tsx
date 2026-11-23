import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Order, OrderItem } from '../../../api/orders';
import content from '../../../content.json';
import { DealOrderItemCard, ProductOrderItemCard, dealStatusOf, deliveryProgressOf, qrStatusOf, OrderItemCardList } from './order-item-card';

vi.mock('qrcode', () => ({ toDataURL: () => Promise.resolve('data:image/png;base64,stub') }));

const t = content.orderDetail;

const BASE_ITEM = {
  id: 'i1',
  dealId: null,
  dealPackageId: null,
  therapistId: null,
  therapistPackageId: null,
  productId: null,
  vendorId: 'v1',
  branchId: null,
  vendorNameSnapshot: 'Vitality Wellness',
  branchNameSnapshot: null,
  itemName: 'Steam & Sauna Session',
  itemType: 'SERVICE',
  unitPrice: '100.00',
  quantity: 1,
  lineTotal: '100.00',
  durationMinutes: 60,
  image: null,
  entitlements: [],
} as unknown as OrderItem;

const ORDER = {
  id: 'order-1',
  createdAt: '2026-10-29T10:00:00.000Z',
  shippingAddress: '1457, D Block, Pacchim Vihar',
  shippingCity: 'New Delhi',
  shippingState: 'Delhi',
  shippingPincode: '110063',
} as unknown as Order;

describe('dealStatusOf', () => {
  it('reads "not redeemed" with no vouchers yet (payment not yet confirmed)', () => {
    expect(dealStatusOf({ ...BASE_ITEM, entitlements: [] })).toBe('notRedeemed');
  });

  it('is "redeemed" only once every voucher on the line is COMPLETED', () => {
    expect(
      dealStatusOf({
        ...BASE_ITEM,
        entitlements: [
          { id: 'e1', voucherCode: 'A', fulfilmentKind: 'SERVICE_SESSION', entitlementStatus: 'COMPLETED', shippedAt: null, completedAt: null, isExpired: false },
          { id: 'e2', voucherCode: 'B', fulfilmentKind: 'SERVICE_SESSION', entitlementStatus: 'COMPLETED', shippedAt: null, completedAt: null, isExpired: false },
        ],
      }),
    ).toBe('redeemed');
  });

  it('is "not redeemed" when only some of several vouchers on the line are completed', () => {
    expect(
      dealStatusOf({
        ...BASE_ITEM,
        entitlements: [
          { id: 'e1', voucherCode: 'A', fulfilmentKind: 'SERVICE_SESSION', entitlementStatus: 'COMPLETED', shippedAt: null, completedAt: null, isExpired: false },
          { id: 'e2', voucherCode: 'B', fulfilmentKind: 'SERVICE_SESSION', entitlementStatus: 'ACTIVE', shippedAt: null, completedAt: null, isExpired: false },
        ],
      }),
    ).toBe('notRedeemed');
  });

  it('is "expired" once any unredeemed voucher on the line has passed its window', () => {
    expect(
      dealStatusOf({
        ...BASE_ITEM,
        entitlements: [{ id: 'e1', voucherCode: 'A', fulfilmentKind: 'SERVICE_SESSION', entitlementStatus: 'ACTIVE', shippedAt: null, completedAt: null, isExpired: true }],
      }),
    ).toBe('expired');
  });
});

describe('deliveryProgressOf', () => {
  it('is step 0 (Ordered) with no entitlement timestamps yet', () => {
    expect(deliveryProgressOf({ ...BASE_ITEM, entitlements: [] }, ORDER.createdAt).current).toBe(0);
  });

  it('is step 1 (Shipped) once shippedAt is set, before completedAt', () => {
    const { current, dates } = deliveryProgressOf(
      { ...BASE_ITEM, entitlements: [{ id: 'e1', voucherCode: 'A', fulfilmentKind: 'PRODUCT_SHIPPED', entitlementStatus: 'STARTED', shippedAt: '2026-10-30T00:00:00.000Z', completedAt: null, isExpired: false }] },
      ORDER.createdAt,
    );
    expect(current).toBe(1);
    expect(dates[1]).toBeTruthy();
    expect(dates[2]).toBeFalsy();
  });

  it('is past the last step (all done) once completedAt is set', () => {
    const { current } = deliveryProgressOf(
      {
        ...BASE_ITEM,
        entitlements: [
          { id: 'e1', voucherCode: 'A', fulfilmentKind: 'PRODUCT_SHIPPED', entitlementStatus: 'COMPLETED', shippedAt: '2026-10-30T00:00:00.000Z', completedAt: '2026-11-01T00:00:00.000Z', isExpired: false },
        ],
      },
      ORDER.createdAt,
    );
    expect(current).toBe(3);
  });
});

describe('DealOrderItemCard', () => {
  it('shows the Redeemed badge with a success tone and no address', () => {
    render(
      <ul>
        <DealOrderItemCard
          item={{
            ...BASE_ITEM,
            entitlements: [{ id: 'e1', voucherCode: 'A', fulfilmentKind: 'SERVICE_SESSION', entitlementStatus: 'COMPLETED', shippedAt: null, completedAt: null, isExpired: false, purchasedAt: '2026-10-29T10:00:00.000Z', qrExpiresAt: '2026-11-28T10:00:00.000Z' }],
          }}
          order={ORDER}
        />
      </ul>,
    );
    const badge = document.querySelector('sky-badge') as HTMLElement;
    expect(badge.getAttribute('status')).toBe('success');
    expect(badge.textContent).toBe(t.itemStatus.redeemed);
    expect(document.querySelector('.order-item-card__address')).toBeNull();
  });

  it('shows the Expired badge with an error tone', () => {
    render(
      <ul>
        <DealOrderItemCard
          item={{
            ...BASE_ITEM,
            entitlements: [{ id: 'e1', voucherCode: 'A', fulfilmentKind: 'SERVICE_SESSION', entitlementStatus: 'ACTIVE', shippedAt: null, completedAt: null, isExpired: true, purchasedAt: '2026-10-29T10:00:00.000Z', qrExpiresAt: '2020-01-01T00:00:00.000Z' }],
          }}
          order={ORDER}
        />
      </ul>,
    );
    const badge = document.querySelector('sky-badge') as HTMLElement;
    expect(badge.getAttribute('status')).toBe('error');
    expect(badge.textContent).toBe(t.itemStatus.expired);
  });
});

/**
 * Feature: D40 — per-unit redemption QR on the customer order page
 * Scenario: QR eligibility is derived purely from `entitlementStatus`/`qrExpiresAt`, independent
 * of the deal's own `isExpired` (validityDays-based) status.
 */
describe('qrStatusOf', () => {
  it('is "active" for an ACTIVE/STARTED entitlement whose qrExpiresAt is still in the future', () => {
    expect(qrStatusOf({ entitlementStatus: 'ACTIVE', qrExpiresAt: '2099-01-01T00:00:00.000Z' })).toBe('active');
    expect(qrStatusOf({ entitlementStatus: 'STARTED', qrExpiresAt: '2099-01-01T00:00:00.000Z' })).toBe('active');
  });

  it('is "redeemed" once COMPLETED, regardless of qrExpiresAt', () => {
    expect(qrStatusOf({ entitlementStatus: 'COMPLETED', qrExpiresAt: '2020-01-01T00:00:00.000Z' })).toBe('redeemed');
  });

  it('is "expired" once qrExpiresAt has passed, even though the entitlement is still ACTIVE (never redeemed the OTP way either)', () => {
    expect(qrStatusOf({ entitlementStatus: 'ACTIVE', qrExpiresAt: '2020-01-01T00:00:00.000Z' })).toBe('expired');
  });

  it('is null (no QR block) for CANCELLED or REFUNDED, even with a future qrExpiresAt', () => {
    expect(qrStatusOf({ entitlementStatus: 'CANCELLED', qrExpiresAt: '2099-01-01T00:00:00.000Z' })).toBeNull();
    expect(qrStatusOf({ entitlementStatus: 'REFUNDED', qrExpiresAt: '2099-01-01T00:00:00.000Z' })).toBeNull();
  });

  it('is null when there is no qrExpiresAt at all (defensive — a product line never reaches this path anyway)', () => {
    expect(qrStatusOf({ entitlementStatus: 'ACTIVE', qrExpiresAt: null })).toBeNull();
  });
});

describe('DealOrderItemCard — QR block', () => {
  it('renders one QR block per purchased unit, each with its own order reference, purchase date and expiry', () => {
    render(
      <ul>
        <DealOrderItemCard
          item={{
            ...BASE_ITEM,
            quantity: 2,
            entitlements: [
              { id: 'e1', voucherCode: 'MSD-DL-AAA111', fulfilmentKind: 'SERVICE_SESSION', entitlementStatus: 'ACTIVE', shippedAt: null, completedAt: null, isExpired: false, purchasedAt: '2026-10-29T10:00:00.000Z', qrExpiresAt: '2099-01-01T00:00:00.000Z' },
              { id: 'e2', voucherCode: 'MSD-DL-BBB222', fulfilmentKind: 'SERVICE_SESSION', entitlementStatus: 'ACTIVE', shippedAt: null, completedAt: null, isExpired: false, purchasedAt: '2026-10-29T10:00:00.000Z', qrExpiresAt: '2099-01-01T00:00:00.000Z' },
            ],
          }}
          order={ORDER}
        />
      </ul>,
    );
    const blocks = document.querySelectorAll('.entitlement-qr');
    expect(blocks).toHaveLength(2);
    expect(document.body.textContent).toContain('ORD-' + ORDER.id.slice(-8).toUpperCase());
  });

  it('shows the Active status and a QR image for a still-valid voucher', async () => {
    render(
      <ul>
        <DealOrderItemCard
          item={{
            ...BASE_ITEM,
            entitlements: [{ id: 'e1', voucherCode: 'MSD-DL-AAA111', fulfilmentKind: 'SERVICE_SESSION', entitlementStatus: 'ACTIVE', shippedAt: null, completedAt: null, isExpired: false, purchasedAt: '2026-10-29T10:00:00.000Z', qrExpiresAt: '2099-01-01T00:00:00.000Z' }],
          }}
          order={ORDER}
        />
      </ul>,
    );
    expect(await screen.findByText(t.qr.status.active)).toBeTruthy();
    const img = await screen.findByRole('img', { name: /MSD-DL-AAA111/ });
    expect(img.getAttribute('src')).toMatch(/^data:image\/png/);
  });

  it('shows the Redeemed status with no QR image for a COMPLETED voucher', () => {
    render(
      <ul>
        <DealOrderItemCard
          item={{
            ...BASE_ITEM,
            entitlements: [{ id: 'e1', voucherCode: 'MSD-DL-AAA111', fulfilmentKind: 'SERVICE_SESSION', entitlementStatus: 'COMPLETED', shippedAt: null, completedAt: null, isExpired: false, purchasedAt: '2026-10-29T10:00:00.000Z', qrExpiresAt: '2026-11-28T10:00:00.000Z' }],
          }}
          order={ORDER}
        />
      </ul>,
    );
    const qrBlock = document.querySelector('.entitlement-qr') as HTMLElement;
    expect(within(qrBlock).getByText(t.qr.status.redeemed)).toBeTruthy();
    expect(document.querySelector('.entitlement-qr__image')).toBeNull();
  });

  it('shows the Expired status with no QR image once qrExpiresAt has passed', () => {
    render(
      <ul>
        <DealOrderItemCard
          item={{
            ...BASE_ITEM,
            entitlements: [{ id: 'e1', voucherCode: 'MSD-DL-AAA111', fulfilmentKind: 'SERVICE_SESSION', entitlementStatus: 'ACTIVE', shippedAt: null, completedAt: null, isExpired: false, purchasedAt: '2026-10-29T10:00:00.000Z', qrExpiresAt: '2020-01-01T00:00:00.000Z' }],
          }}
          order={ORDER}
        />
      </ul>,
    );
    expect(screen.getByText(t.qr.status.expired)).toBeTruthy();
    expect(document.querySelector('.entitlement-qr__image')).toBeNull();
  });

  it('renders no QR block at all for a cancelled/refunded voucher', () => {
    render(
      <ul>
        <DealOrderItemCard
          item={{
            ...BASE_ITEM,
            entitlements: [{ id: 'e1', voucherCode: 'MSD-DL-AAA111', fulfilmentKind: 'SERVICE_SESSION', entitlementStatus: 'CANCELLED', shippedAt: null, completedAt: null, isExpired: false, purchasedAt: '2026-10-29T10:00:00.000Z', qrExpiresAt: '2099-01-01T00:00:00.000Z' }],
          }}
          order={ORDER}
        />
      </ul>,
    );
    expect(document.querySelector('.entitlement-qr')).toBeNull();
  });

  it('renders no QR block when the order has no entitlements yet (unpaid)', () => {
    render(
      <ul>
        <DealOrderItemCard item={{ ...BASE_ITEM, entitlements: [] }} order={ORDER} />
      </ul>,
    );
    expect(document.querySelector('.entitlement-qr')).toBeNull();
  });
});

describe('ProductOrderItemCard', () => {
  it('shows the delivery timeline and the order address, never a status badge', () => {
    render(
      <ul>
        <ProductOrderItemCard
          item={{
            ...BASE_ITEM,
            itemType: 'PRODUCT',
            productId: 'p1',
            entitlements: [{ id: 'e1', voucherCode: 'A', fulfilmentKind: 'PRODUCT_SHIPPED', entitlementStatus: 'STARTED', shippedAt: '2026-10-30T00:00:00.000Z', completedAt: null, isExpired: false }],
          }}
          order={ORDER}
        />
      </ul>,
    );
    const timeline = screen.getByRole('list', { name: t.deliveryProgress.label });
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(3);
    expect(document.body.textContent).toContain('1457, D Block, Pacchim Vihar');
    expect(document.querySelector('sky-badge')).toBeNull();
  });

  it('omits the address block when the order has none', () => {
    render(
      <ul>
        <ProductOrderItemCard item={{ ...BASE_ITEM, itemType: 'PRODUCT', productId: 'p1' }} order={{ ...ORDER, shippingAddress: null } as unknown as Order} />
      </ul>,
    );
    expect(document.querySelector('.order-item-card__address')).toBeNull();
  });
});

describe('OrderItemCardList', () => {
  it('routes a product item to the Product card and a deal item to the Deal card, in order', () => {
    render(
      <OrderItemCardList
        order={{
          ...ORDER,
          items: [
            { ...BASE_ITEM, id: 'i1', itemName: 'Deal line' },
            { ...BASE_ITEM, id: 'i2', itemName: 'Product line', itemType: 'PRODUCT', productId: 'p1' },
          ],
        }}
      />,
    );
    const cards = Array.from(document.querySelectorAll('li.order-item-card'));
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector('sky-badge')).not.toBeNull();
    expect(cards[1].querySelector('.step-indicator')).not.toBeNull();
  });
});
