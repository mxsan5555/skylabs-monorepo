import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { Prisma } from '../generated/prisma-client';
import { VISIBLE_DEAL_WHERE, VISIBLE_PRODUCT_WHERE } from './catalog-visibility';

/**
 * "Items in a state" for the home slider and CTA banner consoles (docs/msd/PLANNING.md §6, §7).
 * A deal belongs to its branch's state; a product to every state where its member has an active
 * branch (D23). `state: null` means every state (the Global/Default slider or banner).
 */
export type StateItemType = 'deal' | 'product';

export interface StateItem {
  type: StateItemType;
  id: string;
  title: string;
  memberName: string;
  branchName: string | null;
  price: string;
  image: string | null;
  /** Visible to customers right now (same bar as the storefront). */
  eligible: boolean;
  /** Deals only — lets a picker that needs to judge a candidate itself (Home Tag Sections'
   *  Expire soon section) show status/discount/expiry without a second lookup. Always undefined
   *  for a product. */
  status?: string;
  discountPercent?: number | null;
  endDate?: string | null;
}

export function dealInStateWhere(state: string | null): Prisma.DealWhereInput {
  return state ? { branch: { is: { state } } } : {};
}

export function productInStateWhere(state: string | null): Prisma.ProductWhereInput {
  return state ? { vendor: { is: { branches: { some: { state, isActive: true } } } } } : {};
}

const PRIMARY_IMAGE = {
  orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
  take: 1,
  select: { storageKey: true },
};

export async function searchStateItems(opts: {
  state: string | null;
  q: string;
  type: StateItemType | 'all';
  pageSize: number;
  /** Only items customers can see right now (the storefront bar). */
  eligibleOnly?: boolean;
}): Promise<StateItem[]> {
  const q = opts.q.trim();
  const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

  const deals =
    opts.type === 'product'
      ? []
      : await prisma.deal.findMany({
          where: {
            ...dealInStateWhere(opts.state),
            ...(opts.eligibleOnly ? VISIBLE_DEAL_WHERE : {}),
            ...(q
              ? { OR: [{ title: contains(q) }, { vendor: { businessName: contains(q) } }, { branch: { name: contains(q) } }] }
              : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: opts.pageSize,
          select: {
            id: true,
            title: true,
            salePrice: true,
            status: true,
            approvalStatus: true,
            discountPercent: true,
            endDate: true,
            vendor: { select: { businessName: true, status: true } },
            branch: { select: { name: true, isActive: true } },
            mediaImages: PRIMARY_IMAGE,
          },
        });

  const products =
    opts.type === 'deal'
      ? []
      : await prisma.product.findMany({
          where: {
            ...productInStateWhere(opts.state),
            ...(opts.eligibleOnly ? VISIBLE_PRODUCT_WHERE : {}),
            ...(q ? { OR: [{ name: contains(q) }, { brand: contains(q) }, { vendor: { businessName: contains(q) } }] } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: opts.pageSize,
          select: {
            id: true,
            name: true,
            price: true,
            isActive: true,
            image: true,
            vendor: { select: { businessName: true, status: true } },
            mediaImages: PRIMARY_IMAGE,
          },
        });

  return [
    ...deals.map(
      (d): StateItem => ({
        type: 'deal',
        id: d.id,
        title: d.title,
        memberName: d.vendor.businessName,
        branchName: d.branch.name,
        price: String(d.salePrice),
        image: d.mediaImages[0]?.storageKey ?? null,
        eligible:
          d.status === 'ACTIVE' && d.approvalStatus === 'APPROVED' && d.vendor.status === 'ACTIVE' && d.branch.isActive,
        status: d.status,
        discountPercent: d.discountPercent,
        endDate: d.endDate?.toISOString() ?? null,
      }),
    ),
    ...products.map(
      (p): StateItem => ({
        type: 'product',
        id: p.id,
        title: p.name,
        memberName: p.vendor.businessName,
        branchName: null,
        price: String(p.price),
        image: p.mediaImages[0]?.storageKey ?? p.image ?? null,
        eligible: p.isActive && p.vendor.status === 'ACTIVE',
      }),
    ),
  ];
}

/** A slide or banner destination must be an item of the chosen state (any item for Global). */
export async function assertItemInState(type: StateItemType, id: string, state: string | null): Promise<void> {
  const found =
    type === 'deal'
      ? await prisma.deal.findFirst({ where: { id, ...dealInStateWhere(state) }, select: { id: true } })
      : await prisma.product.findFirst({ where: { id, ...productInStateWhere(state) }, select: { id: true } });
  if (!found) {
    throw new ApiError(
      'VALIDATION_ERROR',
      state ? `This ${type} is not available in ${state}.` : `This ${type} does not exist.`,
      { fields: { itemId: state ? `Pick a ${type} from ${state}.` : `Pick an existing ${type}.` } },
    );
  }
}
