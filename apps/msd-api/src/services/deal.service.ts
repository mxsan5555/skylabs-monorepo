import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { slugify } from '../lib/slug';
import { Prisma, type DealStatus } from '../generated/prisma-client';
import { assertCategoryChildOf, assertCategoryOfType } from './category.service';
import { assertTherapistsBelongToBranch } from './vendor.service';
import * as mediaService from './media.service';
import type { MediaFile } from './media.service';
import { paidUnitsByDeal, stockLeft } from './deal-limits';
import { discountOf } from './deal-pricing';

export { discountOf };
import type {
  DealCreateSchema,
  DealUpdateSchema,
  DealPackageCreateSchema,
  DealPackageUpdateSchema,
} from '../schemas/vendor.schema';

/**
 * Deals in the console (docs/msd/PLANNING.md §2.7, API.md §2.1 and §2.2): one service for the
 * member's own routes (`/vendors/me/...`) and staff working for a member
 * (`/vendors/:vendorId/...`). Rules:
 * - A deal needs an existing branch of the same member; a foreign branch or deal is a 404.
 * - Prices, discount and duration on the deal are derived from the cheapest active package.
 * - Every deal starts as Draft; Active needs an image, an active package and an active branch and
 *   member. There is no approval step (D6).
 * - The slug is generated as `{title}-{member}-{city}`; once the deal was Active only staff change
 *   it, and old slugs keep opening the deal.
 */

type DealCreateInput = z.infer<typeof DealCreateSchema>;
type DealUpdateInput = z.infer<typeof DealUpdateSchema>;
type DealPackageCreateInput = z.infer<typeof DealPackageCreateSchema>;
type DealPackageUpdateInput = z.infer<typeof DealPackageUpdateSchema>;

const MAX_PACKAGES = 10;
const MAX_IMAGES = 10;
const SLUG_MAX = 90;

const DEAL_PACKAGE_ORDER_BY: Prisma.DealPackageOrderByWithRelationInput[] = [{ sortOrder: 'asc' }, { durationMinutes: 'asc' }];
const DEAL_IMAGE_ORDER_BY: Prisma.DealImageOrderByWithRelationInput[] = [{ isPrimary: 'desc' }, { sortOrder: 'asc' }];
const DEAL_FAQ_ORDER_BY: Prisma.DealFaqOrderByWithRelationInput[] = [{ sortOrder: 'asc' }, { createdAt: 'asc' }];

const THERAPIST_LINK_SELECT = { id: true, personName: true, therapistType: true, isActive: true } as const;

const DEAL_INCLUDE = {
  category: { select: { id: true, name: true } },
  subcategory: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true, city: true, state: true, isActive: true } },
  packages: { orderBy: DEAL_PACKAGE_ORDER_BY },
  mediaImages: { orderBy: DEAL_IMAGE_ORDER_BY },
  mediaVideo: true,
  faqs: { orderBy: DEAL_FAQ_ORDER_BY, select: { id: true, question: true, answer: true, sortOrder: true } },
  therapistLinks: { include: { therapist: { select: THERAPIST_LINK_SELECT } } },
} as const;

type DealWithIncludes = Prisma.DealGetPayload<{ include: typeof DEAL_INCLUDE }>;

/** API shape: `therapists` instead of the join rows, `tagline` for `shortDescription`, the
 *  computed `discountPercent` per package and the stock left. */
function serializeDeal(deal: DealWithIncludes, sold = 0) {
  const { therapistLinks, ...rest } = deal;
  return {
    ...rest,
    tagline: deal.shortDescription,
    stockLeft: stockLeft(deal.maxBookings, sold),
    packages: deal.packages.map((p) => ({ ...p, discountPercent: discountOf(p.sellingPrice, p.originalPrice) })),
    therapists: therapistLinks.map((link) => link.therapist),
  };
}

async function serializeMany(deals: DealWithIncludes[]) {
  const sold = await paidUnitsByDeal(deals.map((d) => d.id));
  return deals.map((d) => serializeDeal(d, sold.get(d.id) ?? 0));
}


// ─── Ownership ─────────────────────────────────────────────────────────────

/** The member's own branch, else 404 (a foreign branch is never confirmed to exist). */
export async function getOwnBranchOrThrow(vendorId: string, branchId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const branch = await db.branch.findUnique({ where: { id: branchId } });
  if (!branch || branch.vendorId !== vendorId) throw new ApiError('NOT_FOUND', 'Branch not found');
  return branch;
}

/** The deal at this member's branch, else 404. */
export async function getDealScopedOrThrow(vendorId: string, branchId: string, dealId: string) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal || deal.vendorId !== vendorId || deal.branchId !== branchId) throw new ApiError('NOT_FOUND', 'Deal not found');
  return deal;
}

async function loadDeal(dealId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const deal = await db.deal.findUniqueOrThrow({ where: { id: dealId }, include: DEAL_INCLUDE });
  const [serialized] = await serializeMany([deal]);
  return serialized;
}

// ─── Slugs ─────────────────────────────────────────────────────────────────

/** `{title}-{member}-{city}`, cut back to a whole word at 90 characters. */
export function buildDealSlug(title: string, memberName: string | null, city: string | null): string {
  const full = [title, memberName, city].filter(Boolean).map((part) => slugify(part as string)).join('-');
  if (full.length <= SLUG_MAX) return full;
  const cut = full.slice(0, SLUG_MAX);
  return cut.includes('-') ? cut.slice(0, cut.lastIndexOf('-')) : cut;
}

async function slugTaken(slug: string, exceptDealId?: string): Promise<boolean> {
  const hit = await prisma.deal.findFirst({
    where: { OR: [{ slug }, { previousSlugs: { has: slug } }], ...(exceptDealId ? { id: { not: exceptDealId } } : {}) },
    select: { id: true },
  });
  return Boolean(hit);
}

/** `base`, else `base-2`, `base-3`, ... (C-04). */
async function uniqueSlug(base: string, exceptDealId?: string): Promise<string> {
  if (!(await slugTaken(base, exceptDealId))) return base;
  for (let n = 2; n < 1000; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, SLUG_MAX - suffix.length)}${suffix}`;
    if (!(await slugTaken(candidate, exceptDealId))) return candidate;
  }
  throw new ApiError('CONFLICT', 'Could not find a free slug for this deal; enter one');
}

async function resolveNewSlug(input: { slug?: string; title: string }, vendorId: string, city: string | null) {
  if (input.slug) {
    if (await slugTaken(input.slug)) throw new ApiError('CONFLICT', `The URL "${input.slug}" is already used by another deal`);
    return input.slug;
  }
  const member = await prisma.member.findUnique({ where: { id: vendorId }, select: { businessName: true } });
  return uniqueSlug(buildDealSlug(input.title, member?.businessName ?? null, city));
}

// ─── Prices ────────────────────────────────────────────────────────────────

/** The cheapest active package becomes the deal's "from" price, original price, discount and
 *  duration (the cache that listing sorts, filters and tags read). */
async function syncDealPriceFromPackages(tx: Prisma.TransactionClient, dealId: string) {
  const cheapest = await tx.dealPackage.findFirst({
    where: { dealId, isActive: true },
    orderBy: [{ sellingPrice: 'asc' }, { sortOrder: 'asc' }],
  });
  if (!cheapest) return;
  const original = cheapest.originalPrice ?? cheapest.sellingPrice;
  await tx.deal.update({
    where: { id: dealId },
    data: {
      salePrice: cheapest.sellingPrice,
      originalPrice: original,
      discountPercent: discountOf(cheapest.sellingPrice, original),
      durationMinutes: cheapest.durationMinutes,
    },
  });
}

// ─── Reads ─────────────────────────────────────────────────────────────────

export async function listDeals(vendorId: string, branchId: string) {
  await getOwnBranchOrThrow(vendorId, branchId);
  const deals = await prisma.deal.findMany({ where: { branchId }, orderBy: { createdAt: 'desc' }, include: DEAL_INCLUDE });
  return serializeMany(deals);
}

/** Every deal of a member across branches (console Deals tab). */
export async function listMemberDeals(vendorId: string) {
  const deals = await prisma.deal.findMany({ where: { vendorId }, orderBy: { createdAt: 'desc' }, include: DEAL_INCLUDE });
  return serializeMany(deals);
}

export async function getDeal(vendorId: string, branchId: string, dealId: string) {
  await getDealScopedOrThrow(vendorId, branchId, dealId);
  return loadDeal(dealId);
}

// ─── Create, update, copy ──────────────────────────────────────────────────

/** Maps API field names onto columns (`tagline` lives in `shortDescription`). */
function dealColumns(input: Omit<DealUpdateInput, 'faqs' | 'therapistIds' | 'slug'>) {
  const { tagline, startDate, endDate, ...rest } = input;
  return {
    ...rest,
    ...(tagline !== undefined ? { shortDescription: tagline } : {}),
    ...(startDate !== undefined ? { startDate: startDate === null ? null : new Date(startDate) } : {}),
    ...(endDate !== undefined ? { endDate: endDate === null ? null : new Date(endDate) } : {}),
  };
}

function packageRows(dealId: string, packages: DealPackageCreateInput[]) {
  return packages.map((p, index) => ({
    dealId,
    name: p.name || null,
    durationMinutes: p.durationMinutes,
    persons: p.persons,
    sellingPrice: p.sellingPrice,
    originalPrice: p.originalPrice ?? null,
    inclusions: p.inclusions,
    isActive: p.isActive,
    sortOrder: index,
  }));
}

function faqRows(dealId: string, faqs: { question: string; answer: string }[]) {
  return faqs.map((f, index) => ({ dealId, question: f.question, answer: f.answer, sortOrder: index }));
}

async function assertServiceCategory(categoryId: string, subcategoryId: string | null | undefined) {
  // D10: categories are open to every member; only the SERVICE type and parentage are checked.
  await assertCategoryOfType(categoryId, 'SERVICE');
  await assertCategoryChildOf(categoryId, subcategoryId ?? undefined);
}

function translateUniqueError(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const target = String((err.meta as { target?: unknown } | undefined)?.target ?? '');
    if (target.includes('slug')) throw new ApiError('CONFLICT', 'That URL is already used by another deal');
    throw new ApiError('CONFLICT', 'Another package of this deal has the same duration and people');
  }
  throw err;
}

export async function createDeal(vendorId: string, branchId: string, input: DealCreateInput) {
  const branch = await getOwnBranchOrThrow(vendorId, branchId);
  await assertServiceCategory(input.categoryId, input.subcategoryId);
  await assertTherapistsBelongToBranch(vendorId, branchId, input.therapistIds ?? []);
  const slug = await resolveNewSlug(input, vendorId, branch.city);
  const { packages, faqs, therapistIds, slug: _slug, ...fields } = input;
  const first = packages[0];

  try {
    return await prisma.$transaction(async (tx) => {
      const deal = await tx.deal.create({
        data: {
          ...dealColumns(fields),
          categoryId: input.categoryId,
          title: input.title,
          slug,
          vendorId, // always from the server, never the client
          branchId,
          status: 'DRAFT',
          approvalStatus: 'APPROVED',
          // Replaced by syncDealPriceFromPackages below; the columns are required.
          salePrice: first.sellingPrice,
          originalPrice: first.originalPrice ?? first.sellingPrice,
        },
      });
      await tx.dealPackage.createMany({ data: packageRows(deal.id, packages) });
      if (faqs?.length) await tx.dealFaq.createMany({ data: faqRows(deal.id, faqs) });
      if (therapistIds?.length) {
        await tx.dealTherapist.createMany({ data: [...new Set(therapistIds)].map((therapistId) => ({ dealId: deal.id, therapistId })) });
      }
      await syncDealPriceFromPackages(tx, deal.id);
      return loadDeal(deal.id, tx);
    });
  } catch (err) {
    translateUniqueError(err);
  }
}

export async function updateDeal(
  vendorId: string,
  branchId: string,
  dealId: string,
  input: DealUpdateInput,
  opts: { actorIsStaff: boolean },
) {
  const deal = await getDealScopedOrThrow(vendorId, branchId, dealId);
  if (input.categoryId !== undefined || input.subcategoryId !== undefined) {
    await assertServiceCategory(input.categoryId ?? deal.categoryId, input.subcategoryId === undefined ? deal.subcategoryId : input.subcategoryId);
  }
  if (input.therapistIds) await assertTherapistsBelongToBranch(vendorId, branchId, input.therapistIds);

  const { faqs, therapistIds, slug, ...fields } = input;
  let slugChange: { slug: string; previousSlugs: string[] } | undefined;
  if (slug !== undefined && slug !== deal.slug) {
    if (deal.publishedAt && !opts.actorIsStaff) {
      throw new ApiError('VALIDATION_ERROR', 'The URL is fixed once the deal has been live; ask MSD support to change it', {
        fieldErrors: { slug: ['Fixed once the deal has been live'] },
      });
    }
    if (await slugTaken(slug, dealId)) throw new ApiError('CONFLICT', `The URL "${slug}" is already used by another deal`);
    const previous = deal.publishedAt ? [...new Set([...deal.previousSlugs, deal.slug])] : deal.previousSlugs;
    slugChange = { slug, previousSlugs: previous.filter((s) => s !== slug) };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.deal.update({ where: { id: dealId }, data: { ...dealColumns(fields), ...slugChange } });
      if (faqs) {
        await tx.dealFaq.deleteMany({ where: { dealId } });
        if (faqs.length) await tx.dealFaq.createMany({ data: faqRows(dealId, faqs) });
      }
      if (therapistIds) {
        await tx.dealTherapist.deleteMany({ where: { dealId } });
        if (therapistIds.length) {
          await tx.dealTherapist.createMany({ data: [...new Set(therapistIds)].map((therapistId) => ({ dealId, therapistId })) });
        }
      }
      return loadDeal(dealId, tx);
    });
  } catch (err) {
    translateUniqueError(err);
  }
}

/** A Draft copy at another branch of the same member: fields, packages and FAQs; no media,
 *  therapists or stock (therapists belong to the source branch). */
export async function copyDeal(vendorId: string, branchId: string, dealId: string, targetBranchId: string) {
  await getDealScopedOrThrow(vendorId, branchId, dealId);
  const target = await getOwnBranchOrThrow(vendorId, targetBranchId);
  const source = await prisma.deal.findUniqueOrThrow({ where: { id: dealId }, include: { packages: true, faqs: { orderBy: DEAL_FAQ_ORDER_BY } } });
  const slug = await resolveNewSlug({ title: source.title }, vendorId, target.city);

  return prisma.$transaction(async (tx) => {
    const copy = await tx.deal.create({
      data: {
        vendorId,
        branchId: target.id,
        categoryId: source.categoryId,
        subcategoryId: source.subcategoryId,
        title: source.title,
        slug,
        shortDescription: source.shortDescription,
        description: source.description,
        highlights: source.highlights,
        termsAndConditions: source.termsAndConditions,
        bookingRequired: source.bookingRequired,
        bookingInstructions: source.bookingInstructions,
        cancellationPolicy: source.cancellationPolicy,
        cancellationNote: source.cancellationNote,
        eligibility: source.eligibility,
        validityDays: source.validityDays,
        limitPerCustomer: source.limitPerCustomer,
        startDate: source.startDate,
        endDate: source.endDate,
        salePrice: source.salePrice,
        originalPrice: source.originalPrice,
        discountPercent: source.discountPercent,
        durationMinutes: source.durationMinutes,
        status: 'DRAFT',
        approvalStatus: 'APPROVED',
      },
    });
    await tx.dealPackage.createMany({
      data: source.packages.map(({ id: _id, dealId: _dealId, createdAt: _c, updatedAt: _u, ...p }) => ({ ...p, dealId: copy.id })),
    });
    if (source.faqs.length) await tx.dealFaq.createMany({ data: faqRows(copy.id, source.faqs) });
    return loadDeal(copy.id, tx);
  });
}

// ─── Status and delete ─────────────────────────────────────────────────────

/** What stops a deal going Active (empty when ready). */
export async function readinessGaps(dealId: string): Promise<string[]> {
  const deal = await prisma.deal.findUniqueOrThrow({
    where: { id: dealId },
    select: {
      branch: { select: { isActive: true } },
      vendor: { select: { status: true } },
      _count: { select: { mediaImages: true, packages: { where: { isActive: true } } } },
    },
  });
  return [
    ...(deal._count.mediaImages === 0 ? ['image'] : []),
    ...(deal._count.packages === 0 ? ['package'] : []),
    ...(!deal.branch.isActive ? ['branch'] : []),
    ...(deal.vendor.status !== 'ACTIVE' ? ['member'] : []),
  ];
}

const MISSING_LABELS: Record<string, string> = {
  image: 'add at least one image',
  package: 'add an active package',
  branch: 'activate the branch',
  member: 'the member must be active',
};

export async function setDealStatus(vendorId: string, branchId: string, dealId: string, status: Exclude<DealStatus, 'EXPIRED'>) {
  const deal = await getDealScopedOrThrow(vendorId, branchId, dealId);
  if (status === 'ACTIVE') {
    const missing = await readinessGaps(dealId);
    if (missing.length) {
      throw new ApiError('DEAL_NOT_READY', `Before going live: ${missing.map((m) => MISSING_LABELS[m]).join(', ')}`, { missing });
    }
  }
  await prisma.deal.update({
    where: { id: dealId },
    data: { status, ...(status === 'ACTIVE' && !deal.publishedAt ? { publishedAt: new Date() } : {}) },
  });
  return loadDeal(dealId);
}

/** Super Admin only (checked by the route). A deal with orders or cart lines can't go. */
export async function deleteDeal(vendorId: string, branchId: string, dealId: string) {
  await getDealScopedOrThrow(vendorId, branchId, dealId);
  try {
    await prisma.deal.delete({ where: { id: dealId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      throw new ApiError('CONFLICT', 'This deal has orders or cart lines. Deactivate it instead.');
    }
    throw err;
  }
}

// ─── Packages (cards) ──────────────────────────────────────────────────────

async function getPackageScopedOrThrow(vendorId: string, branchId: string, dealId: string, packageId: string) {
  await getDealScopedOrThrow(vendorId, branchId, dealId);
  const pkg = await prisma.dealPackage.findUnique({ where: { id: packageId } });
  if (!pkg || pkg.dealId !== dealId) throw new ApiError('NOT_FOUND', 'Package not found');
  return pkg;
}

async function assertNotLastActive(dealId: string, packageId: string) {
  const others = await prisma.dealPackage.count({ where: { dealId, isActive: true, id: { not: packageId } } });
  if (others === 0) throw new ApiError('LAST_PACKAGE', 'A deal needs at least one active package');
}

export async function createPackage(vendorId: string, branchId: string, dealId: string, input: DealPackageCreateInput) {
  await getDealScopedOrThrow(vendorId, branchId, dealId);
  const count = await prisma.dealPackage.count({ where: { dealId } });
  if (count >= MAX_PACKAGES) throw new ApiError('VALIDATION_ERROR', `A deal can have up to ${MAX_PACKAGES} packages`);
  try {
    return await prisma.$transaction(async (tx) => {
      const [row] = packageRows(dealId, [input]);
      await tx.dealPackage.create({ data: { ...row, sortOrder: count } });
      await syncDealPriceFromPackages(tx, dealId);
      return loadDeal(dealId, tx);
    });
  } catch (err) {
    translateUniqueError(err);
  }
}

export async function updatePackage(
  vendorId: string,
  branchId: string,
  dealId: string,
  packageId: string,
  input: DealPackageUpdateInput,
) {
  const pkg = await getPackageScopedOrThrow(vendorId, branchId, dealId, packageId);
  if (input.isActive === false && pkg.isActive) await assertNotLastActive(dealId, packageId);
  const selling = input.sellingPrice ?? Number(pkg.sellingPrice);
  const original = input.originalPrice === undefined ? (pkg.originalPrice === null ? null : Number(pkg.originalPrice)) : input.originalPrice;
  if (original !== null && original < selling) {
    throw new ApiError('VALIDATION_ERROR', 'Original price must not be below the price', { fieldErrors: { originalPrice: ['Below the price'] } });
  }
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.dealPackage.update({ where: { id: packageId }, data: { ...input, ...(input.name !== undefined ? { name: input.name || null } : {}) } });
      await syncDealPriceFromPackages(tx, dealId);
      return loadDeal(dealId, tx);
    });
  } catch (err) {
    translateUniqueError(err);
  }
}

/** Packages in a cart or an order are never deleted (the lines would lose their package). */
export async function deletePackage(vendorId: string, branchId: string, dealId: string, packageId: string) {
  const pkg = await getPackageScopedOrThrow(vendorId, branchId, dealId, packageId);
  if (pkg.isActive) await assertNotLastActive(dealId, packageId);
  const [inCarts, inOrders] = await Promise.all([
    prisma.cartItem.count({ where: { dealPackageId: packageId } }),
    prisma.orderItem.count({ where: { dealPackageId: packageId } }),
  ]);
  if (inCarts || inOrders) throw new ApiError('CONFLICT', 'This package is in a cart or an order. Deactivate it instead.');
  return prisma.$transaction(async (tx) => {
    await tx.dealPackage.delete({ where: { id: packageId } });
    await syncDealPriceFromPackages(tx, dealId);
    return loadDeal(dealId, tx);
  });
}

export async function reorderPackages(vendorId: string, branchId: string, dealId: string, packageIds: string[]) {
  await getDealScopedOrThrow(vendorId, branchId, dealId);
  const existing = await prisma.dealPackage.findMany({ where: { dealId }, select: { id: true } });
  const sameSet = existing.length === packageIds.length && existing.every((p) => packageIds.includes(p.id));
  if (!sameSet) throw new ApiError('VALIDATION_ERROR', 'Send every package of this deal exactly once');
  return prisma.$transaction(async (tx) => {
    for (const [index, id] of packageIds.entries()) {
      await tx.dealPackage.update({ where: { id }, data: { sortOrder: index } });
    }
    return loadDeal(dealId, tx);
  });
}

// ─── Media (mechanics in media.service.ts) ─────────────────────────────────

export async function addDealImage(vendorId: string, branchId: string, dealId: string, file: MediaFile) {
  await getDealScopedOrThrow(vendorId, branchId, dealId);
  if ((await prisma.dealImage.count({ where: { dealId } })) >= MAX_IMAGES) {
    throw new ApiError('VALIDATION_ERROR', `A deal can have up to ${MAX_IMAGES} images`);
  }
  return mediaService.addImage('deal', dealId, file);
}

export async function updateDealImage(vendorId: string, branchId: string, dealId: string, imageId: string, altText: string) {
  await getDealScopedOrThrow(vendorId, branchId, dealId);
  const image = await prisma.dealImage.findUnique({ where: { id: imageId } });
  if (!image || image.dealId !== dealId) throw new ApiError('NOT_FOUND', 'Image not found');
  return prisma.dealImage.update({ where: { id: imageId }, data: { altText: altText || null } });
}

export async function deleteDealImage(vendorId: string, branchId: string, dealId: string, imageId: string) {
  await getDealScopedOrThrow(vendorId, branchId, dealId);
  return mediaService.deleteImage('deal', dealId, imageId);
}

export async function reorderDealImages(vendorId: string, branchId: string, dealId: string, orderedImageIds: string[]) {
  await getDealScopedOrThrow(vendorId, branchId, dealId);
  return mediaService.reorderImages('deal', dealId, orderedImageIds);
}

export async function setDealPrimaryImage(vendorId: string, branchId: string, dealId: string, imageId: string) {
  await getDealScopedOrThrow(vendorId, branchId, dealId);
  return mediaService.setPrimaryImage('deal', dealId, imageId);
}

export async function replaceDealVideo(vendorId: string, branchId: string, dealId: string, file: MediaFile) {
  await getDealScopedOrThrow(vendorId, branchId, dealId);
  return mediaService.replaceVideo('deal', dealId, file);
}

export async function deleteDealVideo(vendorId: string, branchId: string, dealId: string) {
  await getDealScopedOrThrow(vendorId, branchId, dealId);
  return mediaService.deleteVideo('deal', dealId);
}
