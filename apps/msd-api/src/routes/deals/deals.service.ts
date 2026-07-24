import { prisma } from '../../lib/prisma-client';
import { money } from '../../lib/money';
import { Prisma } from '../../generated/prisma';

export const dealDetailInclude = Prisma.validator<Prisma.DealInclude>()({
  company: true,
  cancellationPolicy: true,
  pricingPlans: { orderBy: { sortOrder: 'asc' } },
  menuItems: { orderBy: { sortOrder: 'asc' } },
  packages: { include: { items: true }, orderBy: { sortOrder: 'asc' } },
  categoryLinks: { include: { category: true, subcategory: true } },
  locationLinks: { include: { location: true } },
});

type DealWithRelations = Prisma.DealGetPayload<{ include: typeof dealDetailInclude }>;

function cheapestPlan(deal: DealWithRelations) {
  const active = deal.pricingPlans.filter((p) => p.isActive);
  return active.sort((a, b) => a.priceAmount - b.priceAmount)[0] ?? deal.pricingPlans[0];
}

function priceLevelFor(paise: number): '$' | '$$' | '$$$' {
  const rupees = paise / 100;
  if (rupees < 1000) return '$';
  if (rupees < 3000) return '$$';
  return '$$$';
}

export function toDealCard(deal: DealWithRelations) {
  const plan = cheapestPlan(deal);
  const primary = deal.categoryLinks.find((c) => c.isPrimary) ?? deal.categoryLinks[0];
  return {
    id: deal.id,
    slug: deal.slug,
    title: deal.title,
    shortDescription: deal.shortDescription,
    heroImageUrl: deal.heroImageUrl,
    heroImageAlt: deal.heroImageAlt,
    badge: deal.badge,
    company: { id: deal.company.id, slug: deal.company.slug, displayName: deal.company.displayName },
    category: primary ? { id: primary.category.id, slug: primary.category.slug, name: primary.category.name } : null,
    plan: plan
      ? {
          id: plan.id,
          name: plan.name,
          durationMinutes: plan.durationMinutes,
          price: money(plan.priceAmount),
          originalPrice: plan.originalPriceAmount ? money(plan.originalPriceAmount) : null,
          discountPct: plan.originalPriceAmount
            ? Math.round(((plan.originalPriceAmount - plan.priceAmount) / plan.originalPriceAmount) * 100)
            : null,
        }
      : null,
    priceLevel: plan ? priceLevelFor(plan.priceAmount) : null,
    ratingAvg: deal.ratingAvg,
    ratingCount: deal.ratingCount,
    isFeatured: deal.isFeatured,
    status: deal.status,
    features: deal.features,
  };
}

export function toDealDetail(deal: DealWithRelations) {
  return {
    ...toDealCard(deal),
    description: deal.description,
    gallery: deal.gallery,
    included: deal.included,
    notIncluded: deal.notIncluded,
    howToUse: deal.howToUse,
    finePrint: deal.finePrint,
    cancellationPolicy: {
      id: deal.cancellationPolicy.id,
      name: deal.cancellationPolicy.name,
      description: deal.cancellationPolicy.description,
      freeCancelHoursBefore: deal.cancellationPolicy.freeCancelHoursBefore,
      partialRefundPct: deal.cancellationPolicy.partialRefundPct,
    },
    pricingPlans: deal.pricingPlans.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      durationMinutes: p.durationMinutes,
      personCount: p.personCount,
      price: money(p.priceAmount),
      originalPrice: p.originalPriceAmount ? money(p.originalPriceAmount) : null,
      inventory: p.inventory,
      isActive: p.isActive,
      sortOrder: p.sortOrder,
    })),
    menuItems: deal.menuItems,
    packages: deal.packages.map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      description: pkg.description,
      pricingPlanId: pkg.pricingPlanId,
      items: pkg.items,
    })),
    categories: deal.categoryLinks.map((c) => ({
      categoryId: c.categoryId,
      categorySlug: c.category.slug,
      subcategoryId: c.subcategoryId,
      subcategorySlug: c.subcategory?.slug ?? null,
      isPrimary: c.isPrimary,
    })),
    locations: deal.locationLinks.map((l) => ({
      id: l.location.id,
      name: l.location.name,
      city: l.location.city,
      lat: l.location.lat,
      lng: l.location.lng,
    })),
    validFrom: deal.validFrom,
    validUntil: deal.validUntil,
    maxPerCustomer: deal.maxPerCustomer,
    totalInventory: deal.totalInventory,
    redeemByDaysAfterPurchase: deal.redeemByDaysAfterPurchase,
  };
}

/** 30-min grid within the location's opening hours for `date`, minus already-booked slots
 *  (confirmed/pending order items) up to the location's capacityPerSlot. */
export async function computeAvailability(locationId: string, durationMinutes: number, date: string) {
  const location = await prisma.location.findUniqueOrThrow({
    where: { id: locationId },
    include: { openingHours: true },
  });
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const hours = location.openingHours.find((h) => h.weekday === weekday);
  if (!hours || hours.isClosed || !hours.opensAt || !hours.closesAt) {
    return { date, slots: [] as { time: string; available: boolean; reason?: string }[] };
  }

  const booked = await prisma.orderItem.groupBy({
    by: ['bookingTime'],
    where: {
      locationId,
      bookingDate: date,
      itemStatus: { in: ['PENDING', 'CONFIRMED'] },
    },
    _count: { _all: true },
  });
  const bookedCount = new Map(booked.map((b) => [b.bookingTime, b._count._all]));

  const [openH, openM] = hours.opensAt.split(':').map(Number);
  const [closeH, closeM] = hours.closesAt.split(':').map(Number);
  const openMin = openH * 60 + openM;
  const closeMin = closeH * 60 + closeM;

  const slots: { time: string; available: boolean; reason?: string }[] = [];
  for (let t = openMin; t + durationMinutes <= closeMin; t += 30) {
    const time = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    const count = bookedCount.get(time) ?? 0;
    const available = count < location.capacityPerSlot;
    slots.push(available ? { time, available } : { time, available, reason: 'full' });
  }
  return { date, slots };
}
