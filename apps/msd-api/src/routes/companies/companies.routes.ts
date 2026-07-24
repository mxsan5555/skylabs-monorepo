import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma-client';
import { slugify } from '../../lib/slugify';
import { notFound, conflict } from '../../lib/api-error';
import { requireAuth } from '../../middleware/require-auth';
import { requireRole } from '../../middleware/require-role';
import { offsetQuerySchema, offsetResult } from '../../lib/pagination';
import { registry } from '../../lib/openapi-registry';
import { BusinessType, CompanyStatus, UserRole } from '../../generated/prisma';

const companyCreateSchema = z.object({
  displayName: z.string().min(1).max(160),
  slug: z.string().min(1).max(160).optional(),
  legalName: z.string().min(1).max(200),
  businessType: z.nativeEnum(BusinessType).default(BusinessType.OTHER),
  gstin: z.string().optional(),
  pan: z.string().min(1).max(10),
  about: z.string().min(1).max(2000),
  tagline: z.string().optional(),
  website: z.string().url().optional(),
  logoUrl: z.string().url().optional(),
  coverUrl: z.string().url().optional(),
  contactEmail: z.string().email(),
  contactPhone: z.string().min(6),
  amenities: z.array(z.string()).default([]),
  status: z.nativeEnum(CompanyStatus).default(CompanyStatus.DRAFT),
});
const companyUpdateSchema = companyCreateSchema.partial().omit({ slug: true });

const locationCreateSchema = z.object({
  name: z.string().min(1).max(120),
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().default('India'),
  landmark: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
  phone: z.string().optional(),
  amenities: z.array(z.string()).default([]),
  capacityPerSlot: z.number().int().min(1).default(3),
  isActive: z.boolean().default(true),
});
const locationUpdateSchema = locationCreateSchema.partial();

const hoursRowSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  isClosed: z.boolean().default(false),
  opensAt: z.string().optional(),
  closesAt: z.string().optional(),
  breakStart: z.string().optional(),
  breakEnd: z.string().optional(),
});
const hoursPutSchema = z.object({ hours: z.array(hoursRowSchema).length(7) });

registry.registerPath({
  method: 'get',
  path: '/companies/{slug}',
  summary: 'Public company profile',
  responses: { 200: { description: 'Company' }, 404: { description: 'Not found' } },
});
registry.registerPath({
  method: 'get',
  path: '/admin/companies',
  summary: 'List companies (admin)',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'List' } },
});
registry.registerPath({
  method: 'post',
  path: '/admin/companies',
  summary: 'Create a company (admin)',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: companyCreateSchema } } } },
  responses: { 201: { description: 'Created' } },
});

const companyInclude = { locations: { include: { openingHours: { orderBy: { weekday: 'asc' as const } } } } };

function toPublicCompany(company: NonNullable<Awaited<ReturnType<typeof findPublicCompany>>>) {
  return {
    id: company.id,
    slug: company.slug,
    displayName: company.displayName,
    about: company.about,
    tagline: company.tagline,
    website: company.website,
    logoUrl: company.logoUrl,
    coverUrl: company.coverUrl,
    amenities: company.amenities,
    ratingAvg: company.ratingAvg,
    ratingCount: company.ratingCount,
    locations: company.locations.map((l) => ({
      id: l.id,
      name: l.name,
      line1: l.line1,
      line2: l.line2,
      city: l.city,
      state: l.state,
      postalCode: l.postalCode,
      lat: l.lat,
      lng: l.lng,
      openingHours: l.openingHours,
    })),
  };
}

function findPublicCompany(slug: string) {
  return prisma.company.findFirst({ where: { slug, status: 'VERIFIED' }, include: companyInclude });
}

export const companiesRouter = Router();

companiesRouter.get('/companies/:slug', async (req, res, next) => {
  try {
    const company = await findPublicCompany(req.params.slug);
    if (!company) throw notFound('company_not_found');
    res.json(toPublicCompany(company));
  } catch (err) {
    next(err);
  }
});

export const adminCompaniesRouter = Router();
const adminOnly = [UserRole.ADMIN];

adminCompaniesRouter.get('/admin/companies', requireAuth, requireRole(adminOnly), async (req, res, next) => {
  try {
    const query = offsetQuerySchema.parse(req.query);
    const status = typeof req.query.status === 'string' ? (req.query.status.toUpperCase() as CompanyStatus) : undefined;
    const where = status ? { status } : {};
    const [items, total] = await Promise.all([
      prisma.company.findMany({
        where,
        include: companyInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.company.count({ where }),
    ]);
    res.json(offsetResult(items, total, query));
  } catch (err) {
    next(err);
  }
});

adminCompaniesRouter.get('/admin/companies/:id', requireAuth, requireRole(adminOnly), async (req, res, next) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: req.params.id }, include: companyInclude });
    if (!company) throw notFound('company_not_found');
    res.json(company);
  } catch (err) {
    next(err);
  }
});

adminCompaniesRouter.post('/admin/companies', requireAuth, requireRole(adminOnly), async (req, res, next) => {
  try {
    const input = companyCreateSchema.parse(req.body);
    const slug = slugify(input.slug ?? input.displayName);
    const existing = await prisma.company.findUnique({ where: { slug } });
    if (existing) throw conflict('company_slug_taken');
    const company = await prisma.company.create({ data: { ...input, slug }, include: companyInclude });
    res.status(201).json(company);
  } catch (err) {
    next(err);
  }
});

adminCompaniesRouter.patch('/admin/companies/:id', requireAuth, requireRole(adminOnly), async (req, res, next) => {
  try {
    const input = companyUpdateSchema.parse(req.body);
    const existing = await prisma.company.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('company_not_found');
    const company = await prisma.company.update({ where: { id: req.params.id }, data: input, include: companyInclude });
    res.json(company);
  } catch (err) {
    next(err);
  }
});

adminCompaniesRouter.post(
  '/admin/companies/:id/locations',
  requireAuth,
  requireRole(adminOnly),
  async (req, res, next) => {
    try {
      const input = locationCreateSchema.parse(req.body);
      const company = await prisma.company.findUnique({ where: { id: req.params.id } });
      if (!company) throw notFound('company_not_found');
      const location = await prisma.location.create({
        data: { ...input, companyId: company.id },
        include: { openingHours: true },
      });
      res.status(201).json(location);
    } catch (err) {
      next(err);
    }
  },
);

adminCompaniesRouter.patch('/admin/locations/:id', requireAuth, requireRole(adminOnly), async (req, res, next) => {
  try {
    const input = locationUpdateSchema.parse(req.body);
    const existing = await prisma.location.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('location_not_found');
    const location = await prisma.location.update({
      where: { id: req.params.id },
      data: input,
      include: { openingHours: true },
    });
    res.json(location);
  } catch (err) {
    next(err);
  }
});

adminCompaniesRouter.put(
  '/admin/locations/:id/hours',
  requireAuth,
  requireRole(adminOnly),
  async (req, res, next) => {
    try {
      const input = hoursPutSchema.parse(req.body);
      const location = await prisma.location.findUnique({ where: { id: req.params.id } });
      if (!location) throw notFound('location_not_found');
      await prisma.$transaction([
        prisma.openingHours.deleteMany({ where: { locationId: location.id } }),
        prisma.openingHours.createMany({
          data: input.hours.map((h) => ({ ...h, locationId: location.id })),
        }),
      ]);
      const hours = await prisma.openingHours.findMany({
        where: { locationId: location.id },
        orderBy: { weekday: 'asc' },
      });
      res.json({ hours });
    } catch (err) {
      next(err);
    }
  },
);
