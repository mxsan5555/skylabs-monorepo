import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { listActiveCategories, getActiveCategoryBySlugOrThrow } from './category.service';

/**
 * Public, unauthenticated customer catalogue — the read-only "discovery" surface described in
 * the marketplace architecture plan's Phase 6. Everything here is deliberately separate from
 * the admin-only `product.service.ts`/`service.service.ts`/`vendor.service.ts` reads: those use
 * bare Prisma `include` (safe only because every caller is already permission-gated staff), so
 * reusing them here would risk leaking KYC/bank/owner/audit fields to anonymous customers. Every
 * query below uses an explicit `select` allow-list instead — nothing is exposed by default.
 */

/** Only what a public storefront card/hero ever needs — never KYC, bank, owner, or audit fields. */
const PUBLIC_VENDOR_SELECT = { id: true, businessName: true, city: true, logoUrl: true } as const;
const PUBLIC_BRANCH_SELECT = { id: true, name: true, city: true, address: true } as const;
const PUBLIC_CATEGORY_SELECT = { id: true, name: true, slug: true } as const;
const PUBLIC_SERVICE_SELECT = { id: true, name: true, slug: true, description: true, image: true, imageAlt: true } as const;
const PUBLIC_PRODUCT_SELECT = { id: true, name: true, slug: true, brand: true, description: true, image: true, imageAlt: true } as const;

const PUBLIC_DEAL_SELECT = {
  id: true,
  title: true,
  slug: true,
  shortDescription: true,
  description: true,
  originalPrice: true,
  salePrice: true,
  discountPercent: true,
  durationMinutes: true,
  images: true,
  category: { select: PUBLIC_CATEGORY_SELECT },
  subcategory: { select: PUBLIC_CATEGORY_SELECT },
  service: { select: PUBLIC_SERVICE_SELECT },
  product: { select: PUBLIC_PRODUCT_SELECT },
  vendor: { select: PUBLIC_VENDOR_SELECT },
  branch: { select: PUBLIC_BRANCH_SELECT },
} as const;

/**
 * The one definition of "is this deal visible to a customer / still purchasable": active +
 * approved, its vendor active, its branch active, and — if it links a Service/Product — that
 * catalog item must also still be active. Reused by both the list and single-deal lookup below
 * (so a customer can never reach an otherwise-hidden deal just by guessing its id) and by
 * `order.service.ts`'s checkout revalidation (a Deal must still pass this same bar to be
 * order-able, not just a looser "does it exist" check).
 */
export const VISIBLE_DEAL_WHERE = {
  status: 'ACTIVE' as const,
  approvalStatus: 'APPROVED' as const,
  vendor: { status: 'ACTIVE' as const },
  branch: { isActive: true },
  AND: [
    { OR: [{ serviceId: null }, { service: { is: { isActive: true } } }] },
    { OR: [{ productId: null }, { product: { is: { isActive: true } } }] },
  ],
};

export async function getPublicCategoryTree() {
  const categories = await listActiveCategories();
  const topLevel = categories.filter((c) => !c.parentId);
  return topLevel.map((parent) => ({
    id: parent.id,
    name: parent.name,
    slug: parent.slug,
    description: parent.description,
    children: categories
      .filter((c) => c.parentId === parent.id)
      .map((child) => ({ id: child.id, name: child.name, slug: child.slug, description: child.description })),
  }));
}

export async function getPublicCategoryBySlug(slug: string) {
  const category = await getActiveCategoryBySlugOrThrow(slug);
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    children: category.children.map((child) => ({ id: child.id, name: child.name, slug: child.slug, description: child.description })),
  };
}

export async function listPublicDeals(opts: {
  page: number;
  pageSize: number;
  categoryId?: string;
  subcategoryId?: string;
  type?: 'service' | 'product';
  search?: string;
}) {
  const where = {
    ...VISIBLE_DEAL_WHERE,
    ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
    ...(opts.subcategoryId ? { subcategoryId: opts.subcategoryId } : {}),
    ...(opts.type === 'service' ? { serviceId: { not: null } } : {}),
    ...(opts.type === 'product' ? { productId: { not: null } } : {}),
    ...(opts.search
      ? {
          OR: [
            { title: { contains: opts.search, mode: 'insensitive' as const } },
            { service: { is: { name: { contains: opts.search, mode: 'insensitive' as const } } } },
            { product: { is: { name: { contains: opts.search, mode: 'insensitive' as const } } } },
            { vendor: { is: { businessName: { contains: opts.search, mode: 'insensitive' as const } } } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.deal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      select: PUBLIC_DEAL_SELECT,
    }),
    prisma.deal.count({ where }),
  ]);
  return { items, total };
}

export async function getPublicDealOrThrow(id: string) {
  const deal = await prisma.deal.findFirst({ where: { id, ...VISIBLE_DEAL_WHERE }, select: PUBLIC_DEAL_SELECT });
  if (!deal) throw new ApiError('NOT_FOUND', 'Deal not found');
  return deal;
}
