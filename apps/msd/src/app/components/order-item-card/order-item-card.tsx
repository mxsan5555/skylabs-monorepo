import type { ReactNode } from 'react';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import type { Order, OrderItem } from '../../../api/orders';
import { lineFromOrderItem } from '../../../utils/cart-items';
import { formatINR, formatLongDate, formatStreetAddress } from '../../../utils/format';
import { StepIndicator } from '../step-indicator/step-indicator';
import content from '../../../content.json';
import './order-item-card.css';

const t = content.orderDetail;

/** The image/title/vendor/price shell both card kinds share — the same fields `PurchaseLineCard`
 *  shows, minus the cart-only quantity stepper/actions slots this page never needs. `extra` is
 *  the one part that actually differs: a redemption badge for a Deal/Therapist line, a delivery
 *  timeline + address for a Product line (see `DealOrderItemCard`/`ProductOrderItemCard` below). */
function OrderItemCardShell({ item, extra }: { item: OrderItem; extra: ReactNode }) {
  const line = lineFromOrderItem(item);
  const external = { target: '_blank', rel: 'noopener noreferrer' } as const;
  const media = line.image ? <img src={line.image} alt="" width={96} height={96} loading="lazy" decoding="async" /> : null;

  return (
    <li className="order-item-card">
      {media &&
        (line.href ? (
          <a className="order-item-card__media" href={line.href} {...external} tabIndex={-1} aria-hidden="true">
            {media}
          </a>
        ) : (
          <span className="order-item-card__media">{media}</span>
        ))}
      <div className="order-item-card__body">
        <div className="order-item-card__top">
          <div className="order-item-card__details">
            <span className="order-item-card__kind label-small">{line.kind}</span>
            <h3 className="order-item-card__title title-small">
              {line.href ? (
                <a href={line.href} {...external}>
                  {line.title}
                  <span className="sr-only"> {content.purchaseLine.opensInNewTab}</span>
                  <Icon aria-hidden="true" className="order-item-card__external">
                    open_in_new
                  </Icon>
                </a>
              ) : (
                line.title
              )}
            </h3>
            <p className="order-item-card__vendor body-small">
              <Icon aria-hidden="true">storefront</Icon>
              <span>
                {line.memberName}
                {line.branchName && ` · ${line.branchName}`}
              </span>
            </p>
            <p className="order-item-card__meta body-small">{[line.duration, `× ${line.quantity}`].filter(Boolean).join(' · ')}</p>
          </div>
          <p className="order-item-card__price title-medium">{formatINR(line.total)}</p>
        </div>
        <div className="order-item-card__extra">{extra}</div>
      </div>
    </li>
  );
}

const ITEM_STATUS_TONE: Record<'redeemed' | 'notRedeemed' | 'expired', 'success' | 'neutral' | 'error'> = {
  redeemed: 'success',
  notRedeemed: 'neutral',
  expired: 'error',
};

/** A deal/therapist line has no quantity-weighted partial state in this UI: redeemed only once
 *  every voucher on the line is; expired takes priority over "not redeemed" once any voucher on
 *  it has passed its validity window without being used. An item with no vouchers yet (payment
 *  not yet confirmed) reads as "not redeemed", the same as a freshly-issued one. */
export function dealStatusOf(item: OrderItem): 'redeemed' | 'notRedeemed' | 'expired' {
  const entitlements = item.entitlements ?? [];
  if (entitlements.length > 0 && entitlements.every((e) => e.entitlementStatus === 'COMPLETED')) return 'redeemed';
  if (entitlements.some((e) => e.isExpired)) return 'expired';
  return 'notRedeemed';
}

/** Deal and direct Therapist-booking lines share identical entitlement-based redemption
 *  semantics (both are `SERVICE_SESSION` vouchers) — one card kind covers both. No address: a
 *  service is redeemed at the vendor, never delivered. */
export function DealOrderItemCard({ item }: { item: OrderItem }) {
  const status = dealStatusOf(item);
  return (
    <OrderItemCardShell
      item={item}
      extra={<sky-badge status={ITEM_STATUS_TONE[status]}>{t.itemStatus[status]}</sky-badge>}
    />
  );
}

/** Ordered → Shipped → Delivered: the only three product-delivery stages with any real backing
 *  data anywhere in the system (see `entitlements[].shippedAt`/`completedAt`'s own doc comment
 *  on `OrderItem` — "Packed"/"Out for delivery" have no tracked event to show a date for). */
export function deliveryProgressOf(item: OrderItem, orderCreatedAt: string): { current: number; dates: (string | null)[] } {
  const entitlements = item.entitlements ?? [];
  const shippedAt = entitlements.find((e) => e.shippedAt)?.shippedAt ?? null;
  const completedAt = entitlements.find((e) => e.completedAt)?.completedAt ?? null;
  const current = completedAt ? 3 : shippedAt ? 1 : 0;
  return {
    current,
    dates: [formatLongDate(orderCreatedAt), shippedAt && formatLongDate(shippedAt), completedAt && formatLongDate(completedAt)],
  };
}

export function ProductOrderItemCard({ item, order }: { item: OrderItem; order: Order }) {
  const { current, dates } = deliveryProgressOf(item, order.createdAt);
  return (
    <OrderItemCardShell
      item={item}
      extra={
        <>
          <StepIndicator
            label={t.deliveryProgress.label}
            steps={[t.deliveryProgress.ordered, t.deliveryProgress.shipped, t.deliveryProgress.delivered]}
            current={current}
            doneLabel={content.checkout.stepDone}
            dates={dates}
          />
          {order.shippingAddress && (
            <div className="order-item-card__address">
              <h4 className="order-item-card__address-heading label-large">{t.deliveryHeading}</h4>
              <p className="body-small">
                {formatStreetAddress([order.shippingAddress, order.shippingCity, order.shippingState])} {order.shippingPincode}
              </p>
            </div>
          )}
        </>
      }
    />
  );
}

export interface OrderItemCardListProps {
  order: Order;
}

/** One card per order item, Deal/Therapist and Product routed to their own card kind — the
 *  per-item replacement for the flat `PurchaseLineCard` list (cart/checkout/order-list keep using
 *  that shared card unchanged; order detail is the one page needing type-specific content). */
export function OrderItemCardList({ order }: OrderItemCardListProps) {
  return (
    <ul className="order-item-cards">
      {order.items.map((item) =>
        item.productId ? (
          <ProductOrderItemCard key={item.id} item={item} order={order} />
        ) : (
          <DealOrderItemCard key={item.id} item={item} />
        ),
      )}
    </ul>
  );
}
