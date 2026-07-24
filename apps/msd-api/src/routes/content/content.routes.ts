import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma-client';
import { notFound } from '../../lib/api-error';
import { requireAuth } from '../../middleware/require-auth';
import { requireRole } from '../../middleware/require-role';
import { optionalAuth } from '../../middleware/optional-auth';
import type { AuthedRequest } from '../../middleware/require-auth';
import { dealDetailInclude, toDealCard } from '../deals/deals.service';
import { UserRole } from '../../generated/prisma';

const navLinkCreateSchema = z.object({
  menu: z.enum(['HEADER_PRIMARY', 'FOOTER_QUICK_LINKS', 'FOOTER_SUPPORT', 'FOOTER_LEGAL', 'FOOTER_SOCIAL']),
  label: z.string().min(1),
  url: z.string().min(1),
  icon: z.string().optional(),
  isExternal: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});
const navLinkUpdateSchema = navLinkCreateSchema.partial();

const homeSectionCreateSchema = z.object({
  kind: z.enum(['HERO', 'DEAL_RAIL', 'CATEGORY_GRID', 'PROMO_BANNER']),
  heading: z.string().optional(),
  subheading: z.string().optional(),
  seeAllUrl: z.string().optional(),
  dealSource: z.object({ filter: z.enum(['featured', 'hot', 'category']), categorySlug: z.string().optional() }).optional(),
  promo: z.object({ chip: z.string().optional(), heading: z.string(), body: z.string(), ctaLabel: z.string(), ctaUrl: z.string(), mediaUrl: z.string().optional() }).optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});
const homeSectionUpdateSchema = homeSectionCreateSchema.partial();

const siteSettingsUpdateSchema = z.object({
  siteName: z.string().optional(),
  tagline: z.string().optional(),
  siteDescription: z.string().optional(),
  copyrightText: z.string().optional(),
  trustBadges: z.array(z.object({ icon: z.string(), text: z.string() })).optional(),
  newsletterHeading: z.string().optional(),
  newsletterBody: z.string().optional(),
  supportEmail: z.string().email().optional(),
  supportPhone: z.string().optional(),
  priceLevels: z.array(z.object({ value: z.string(), label: z.string(), min: z.number(), max: z.number().nullable() })).optional(),
});

const newsletterSubscribeSchema = z.object({ email: z.string().email() });

async function resolveDealSource(source: { filter: 'featured' | 'hot' | 'category'; categorySlug?: string } | null) {
  if (!source) return [];
  const where =
    source.filter === 'featured'
      ? { status: 'LIVE' as const, isFeatured: true }
      : source.filter === 'category' && source.categorySlug
        ? { status: 'LIVE' as const, categoryLinks: { some: { category: { slug: source.categorySlug } } } }
        : { status: 'LIVE' as const }; // 'hot' — no dedicated flag yet, falls back to newest live
  const deals = await prisma.deal.findMany({
    where,
    include: dealDetailInclude,
    orderBy: source.filter === 'hot' ? { soldCount: 'desc' } : { publishedAt: 'desc' },
    take: 10,
  });
  return deals.map(toDealCard);
}

export const contentRouter = Router();

contentRouter.get('/content/site', async (_req, res, next) => {
  try {
    const settings = await prisma.siteSetting.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });
    const navLinks = await prisma.navLink.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    const nav: Record<string, typeof navLinks> = {};
    for (const link of navLinks) nav[link.menu] = [...(nav[link.menu] ?? []), link];

    res.json({
      site: { name: settings.siteName, tagline: settings.tagline, description: settings.siteDescription },
      nav,
      trustBadges: settings.trustBadges,
      priceLevels: settings.priceLevels,
      copyright: settings.copyrightText,
      support: { email: settings.supportEmail, phone: settings.supportPhone },
      newsletter: { heading: settings.newsletterHeading, body: settings.newsletterBody },
    });
  } catch (err) {
    next(err);
  }
});

contentRouter.get('/content/home', async (_req, res, next) => {
  try {
    const sections = await prisma.homeSection.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] },
        ],
      },
      orderBy: { sortOrder: 'asc' },
    });
    const resolved = await Promise.all(
      sections.map(async (s) => ({
        id: s.id,
        kind: s.kind,
        heading: s.heading,
        subheading: s.subheading,
        seeAllUrl: s.seeAllUrl,
        promo: s.promo,
        deals: s.kind === 'DEAL_RAIL' ? await resolveDealSource(s.dealSource as never) : undefined,
      })),
    );
    res.json({ sections: resolved });
  } catch (err) {
    next(err);
  }
});

contentRouter.post('/newsletter/subscribe', optionalAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { email } = newsletterSubscribeSchema.parse(req.body);
    const sub = await prisma.newsletterSubscription.upsert({
      where: { email },
      update: { status: 'SUBSCRIBED', unsubscribedAt: null },
      create: { email, userId: req.auth?.id, status: 'SUBSCRIBED', source: 'footer' },
    });
    res.status(201).json({ id: sub.id, status: sub.status });
  } catch (err) {
    next(err);
  }
});

// Docs call for a signed token from the unsubscribe email link — deferred (no email
// templates for newsletter yet); accepts the email directly for now.
contentRouter.post('/newsletter/unsubscribe', async (req, res, next) => {
  try {
    const { email } = newsletterSubscribeSchema.parse(req.body);
    await prisma.newsletterSubscription.updateMany({
      where: { email },
      data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export const adminContentRouter = Router();
const staffRoles = [UserRole.ADMIN, UserRole.MARKETING];

adminContentRouter.get('/admin/nav-links', requireAuth, requireRole(staffRoles), async (_req, res, next) => {
  try {
    const items = await prisma.navLink.findMany({ orderBy: [{ menu: 'asc' }, { sortOrder: 'asc' }] });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

adminContentRouter.post('/admin/nav-links', requireAuth, requireRole(staffRoles), async (req, res, next) => {
  try {
    const input = navLinkCreateSchema.parse(req.body);
    const link = await prisma.navLink.create({ data: input });
    res.status(201).json(link);
  } catch (err) {
    next(err);
  }
});

adminContentRouter.patch('/admin/nav-links/:id', requireAuth, requireRole(staffRoles), async (req, res, next) => {
  try {
    const input = navLinkUpdateSchema.parse(req.body);
    const existing = await prisma.navLink.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('nav_link_not_found');
    const link = await prisma.navLink.update({ where: { id: existing.id }, data: input });
    res.json(link);
  } catch (err) {
    next(err);
  }
});

adminContentRouter.delete('/admin/nav-links/:id', requireAuth, requireRole(staffRoles), async (req, res, next) => {
  try {
    const existing = await prisma.navLink.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('nav_link_not_found');
    await prisma.navLink.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

adminContentRouter.get('/admin/home-sections', requireAuth, requireRole(staffRoles), async (_req, res, next) => {
  try {
    const items = await prisma.homeSection.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

adminContentRouter.post('/admin/home-sections', requireAuth, requireRole(staffRoles), async (req, res, next) => {
  try {
    const input = homeSectionCreateSchema.parse(req.body);
    const section = await prisma.homeSection.create({
      data: {
        ...input,
        startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
        endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
      },
    });
    res.status(201).json(section);
  } catch (err) {
    next(err);
  }
});

adminContentRouter.patch('/admin/home-sections/:id', requireAuth, requireRole(staffRoles), async (req, res, next) => {
  try {
    const input = homeSectionUpdateSchema.parse(req.body);
    const existing = await prisma.homeSection.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('home_section_not_found');
    const section = await prisma.homeSection.update({
      where: { id: existing.id },
      data: {
        ...input,
        startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
        endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
      },
    });
    res.json(section);
  } catch (err) {
    next(err);
  }
});

adminContentRouter.delete('/admin/home-sections/:id', requireAuth, requireRole(staffRoles), async (req, res, next) => {
  try {
    const existing = await prisma.homeSection.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('home_section_not_found');
    await prisma.homeSection.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

adminContentRouter.patch('/admin/site-settings', requireAuth, requireRole(staffRoles), async (req, res, next) => {
  try {
    const input = siteSettingsUpdateSchema.parse(req.body);
    const settings = await prisma.siteSetting.upsert({
      where: { id: 'default' },
      update: input,
      create: { id: 'default', ...input },
    });
    res.json(settings);
  } catch (err) {
    next(err);
  }
});
