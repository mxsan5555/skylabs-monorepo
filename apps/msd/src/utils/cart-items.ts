import type { CartItem } from '../api/cart';
import type { OrderItem } from '../api/orders';
import { dealHref } from '../catalog/catalog-shell';
import { primaryImage, resolveDealMedia, resolveProductMedia } from './media';
import { productPath } from '../app/seo/public-urls';

export type LineKind = 'Deal' | 'Product' | 'Therapist';

/**
 * One purchasable line as the cart and checkout show it (item 2): what it is, which member sells
 * it, where its detail page is, and what it costs. Built from a cart item before checkout and
 * from an order item after, so both steps render the same card.
 */
export interface PurchaseLine {
  id: string;
  kind: LineKind;
  title: string;
  /** Duration for a deal or therapist package, e.g. "60 min"; null for a product. */
  duration: string | null;
  memberId: string;
  memberName: string;
  branchName: string | null;
  image: string | null;
  /** The item's public detail page; null only for a line that points at nothing. */
  href: string | null;
  quantity: number;
  total: number;
}

const minutes = (value: number | null | undefined) => (value ? `${value} min` : null);

export function lineFromCartItem(item: CartItem): PurchaseLine {
  const kind: LineKind = item.therapistId ? 'Therapist' : item.productId ? 'Product' : 'Deal';
  const owner = item.therapist ?? item.deal ?? item.product;
  return {
    id: item.id,
    kind,
    title: item.therapist
      ? `${item.therapist.therapistType} — ${item.therapist.personName}`
      : (item.product?.name ?? item.deal?.title ?? kind),
    duration: minutes(item.dealPackage?.durationMinutes ?? item.therapistPackage?.durationMinutes),
    memberId: owner?.vendorId ?? 'unknown',
    memberName: owner?.vendor?.businessName ?? 'Member',
    branchName: item.therapist?.branch?.name ?? item.deal?.branch?.name ?? null,
    image: item.deal
      ? (primaryImage(resolveDealMedia(item.deal)) ?? null)
      : item.product
        ? (primaryImage(resolveProductMedia(item.product)) ?? null)
        : (item.therapist?.photoUrl ?? null),
    href: item.deal
      ? dealHref(item.deal)
      : item.product
        ? productPath(item.product)
        : item.therapist
          ? `/therapist/${item.therapist.id}`
          : null,
    quantity: item.quantity,
    total: Number(item.unitPrice) * item.quantity,
  };
}

export function lineFromOrderItem(item: OrderItem): PurchaseLine {
  const kind: LineKind = item.therapistId ? 'Therapist' : item.itemType === 'PRODUCT' ? 'Product' : 'Deal';
  return {
    id: item.id,
    kind,
    title: item.itemName,
    duration: minutes(item.durationMinutes),
    memberId: item.vendorId,
    memberName: item.vendorNameSnapshot,
    branchName: item.branchNameSnapshot ?? null,
    image: item.image ?? null,
    // A deal page also opens from its id and moves to the slug URL (D34).
    href: item.dealId
      ? dealHref({ id: item.dealId })
      : item.productId
        ? productPath({ id: item.productId, slug: item.product?.slug })
        : item.therapistId
          ? `/therapist/${item.therapistId}`
          : null,
    quantity: item.quantity,
    total: Number(item.lineTotal),
  };
}
