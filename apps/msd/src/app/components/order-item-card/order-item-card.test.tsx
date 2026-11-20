import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Order, OrderItem } from '../../../api/orders';
import content from '../../../content.json';
import { DealOrderItemCard, ProductOrderItemCard, dealStatusOf, deliveryProgressOf, OrderItemCardList } from './order-item-card';

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
            entitlements: [{ id: 'e1', voucherCode: 'A', fulfilmentKind: 'SERVICE_SESSION', entitlementStatus: 'COMPLETED', shippedAt: null, completedAt: null, isExpired: false }],
          }}
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
            entitlements: [{ id: 'e1', voucherCode: 'A', fulfilmentKind: 'SERVICE_SESSION', entitlementStatus: 'ACTIVE', shippedAt: null, completedAt: null, isExpired: true }],
          }}
        />
      </ul>,
    );
    const badge = document.querySelector('sky-badge') as HTMLElement;
    expect(badge.getAttribute('status')).toBe('error');
    expect(badge.textContent).toBe(t.itemStatus.expired);
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
