import { z } from 'zod';

export const pricingPlanSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(120),
  description: z.string().optional(),
  durationMinutes: z.number().int().positive().optional(),
  personCount: z.number().int().positive().default(1),
  priceAmount: z.number().int().positive(),
  originalPriceAmount: z.number().int().positive().optional(),
  inventory: z.number().int().positive().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const menuItemSchema = z.object({
  id: z.string().optional(),
  group: z.string().optional(),
  name: z.string().min(1).max(160),
  description: z.string().optional(),
  durationMinutes: z.number().int().positive().optional(),
  sortOrder: z.number().int().default(0),
});

export const packageItemSchema = z.object({
  name: z.string().min(1),
  durationMinutes: z.number().int().positive().optional(),
  note: z.string().optional(),
});

export const packageSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(160),
  description: z.string().optional(),
  pricingPlanId: z.string().min(1),
  items: z.array(packageItemSchema).min(2),
  sortOrder: z.number().int().default(0),
});

export const dealCategorySchema = z.object({
  categoryId: z.string().min(1),
  subcategoryId: z.string().optional(),
  isPrimary: z.boolean().default(false),
});

export const dealCreateSchema = z.object({
  slug: z.string().min(1).max(160).optional(),
  companyId: z.string().min(1),
  locationIds: z.array(z.string()).min(1),
  title: z.string().min(1).max(120),
  shortDescription: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  heroImageUrl: z.string().url(),
  heroImageAlt: z.string().min(1),
  gallery: z.array(z.object({ url: z.string().url(), alt: z.string() })).min(1),
  badge: z.string().optional(),
  features: z.array(z.string()).default([]),
  included: z.array(z.string()).default([]),
  notIncluded: z.array(z.string()).default([]),
  howToUse: z.array(z.string()).default([]),
  finePrint: z.string().min(1),
  cancellationPolicyId: z.string().min(1),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  redeemByDaysAfterPurchase: z.number().int().positive().optional(),
  maxPerCustomer: z.number().int().positive().optional(),
  totalInventory: z.number().int().nonnegative().optional(),
  isFeatured: z.boolean().default(false),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  categories: z.array(dealCategorySchema).min(1),
  pricingPlans: z.array(pricingPlanSchema).min(1),
  menuItems: z.array(menuItemSchema).default([]),
  packages: z.array(packageSchema).default([]),
});

export const dealUpdateSchema = dealCreateSchema.partial().omit({ slug: true });

export const dealListQuerySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  company: z.string().optional(),
  priceMin: z.coerce.number().int().optional(),
  priceMax: z.coerce.number().int().optional(),
  features: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v.split(',')))
    .optional(),
  sort: z.enum(['popular', 'rating', 'price-asc', 'price-desc', 'newest']).default('popular'),
  featured: z.coerce.boolean().optional(),
  hot: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

export const dealReviewActionSchema = z.object({
  action: z.enum(['publish', 'pause', 'resume', 'archive']),
});

export const availabilityQuerySchema = z.object({
  pricingPlanId: z.string().optional(),
  locationId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
