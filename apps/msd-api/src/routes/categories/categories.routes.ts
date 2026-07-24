import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma-client';
import { slugify } from '../../lib/slugify';
import { notFound, conflict } from '../../lib/api-error';
import { requireAuth, type AuthedRequest } from '../../middleware/require-auth';
import { requireRole } from '../../middleware/require-role';
import { registry } from '../../lib/openapi-registry';
import { UserRole } from '../../generated/prisma';

export const categoryCreateSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120).optional(),
  description: z.string().min(1).max(2000),
  icon: z.string().min(1),
  imageUrl: z.string().url().optional(),
  imageAlt: z.string().optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const categoryUpdateSchema = categoryCreateSchema.partial().omit({ slug: true });

export const subcategoryCreateSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120).optional(),
  description: z.string().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const subcategoryUpdateSchema = subcategoryCreateSchema.partial();

registry.registerPath({
  method: 'get',
  path: '/categories',
  summary: 'Active categories + nested active subcategories',
  responses: { 200: { description: 'Category list' } },
});
registry.registerPath({
  method: 'get',
  path: '/categories/{slug}',
  summary: 'One category by slug',
  responses: { 200: { description: 'Category' }, 404: { description: 'Not found' } },
});
registry.registerPath({
  method: 'post',
  path: '/admin/categories',
  summary: 'Create a category (admin, marketing)',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: categoryCreateSchema } } } },
  responses: { 201: { description: 'Created' } },
});
registry.registerPath({
  method: 'patch',
  path: '/admin/categories/{id}',
  summary: 'Update a category (admin, marketing)',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: categoryUpdateSchema } } } },
  responses: { 200: { description: 'Updated' }, 404: { description: 'Not found' } },
});

async function dealCountFor(categoryId: string, subcategoryId?: string) {
  return prisma.dealCategory.count({
    where: {
      categoryId,
      ...(subcategoryId ? { subcategoryId } : {}),
      deal: { status: 'LIVE' },
    },
  });
}

function toCategoryResponse(cat: Awaited<ReturnType<typeof loadCategory>>) {
  return {
    id: cat!.id,
    slug: cat!.slug,
    name: cat!.name,
    description: cat!.description,
    icon: cat!.icon,
    imageUrl: cat!.imageUrl,
    imageAlt: cat!.imageAlt,
    metaTitle: cat!.metaTitle,
    metaDescription: cat!.metaDescription,
    sortOrder: cat!.sortOrder,
    isActive: cat!.isActive,
    subcategories: cat!.subcategories.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      description: s.description,
      sortOrder: s.sortOrder,
      isActive: s.isActive,
    })),
  };
}

function loadCategory(where: { id?: string; slug?: string }) {
  return prisma.category.findFirst({
    where,
    include: { subcategories: { orderBy: { sortOrder: 'asc' } } },
  });
}

export const categoriesRouter = Router();

categoriesRouter.get('/categories', async (req, res, next) => {
  try {
    const activeOnly = req.query.all !== 'true';
    const categories = await prisma.category.findMany({
      where: activeOnly ? { isActive: true } : {},
      include: { subcategories: { where: activeOnly ? { isActive: true } : {}, orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
    const items = await Promise.all(
      categories.map(async (cat) => ({
        ...toCategoryResponse(cat),
        dealCount: await dealCountFor(cat.id),
        subcategories: await Promise.all(
          cat.subcategories.map(async (s) => ({
            id: s.id,
            slug: s.slug,
            name: s.name,
            dealCount: await dealCountFor(cat.id, s.id),
          })),
        ),
      })),
    );
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

categoriesRouter.get('/categories/:slug', async (req, res, next) => {
  try {
    const cat = await loadCategory({ slug: req.params.slug });
    if (!cat) throw notFound('category_not_found');
    res.json(toCategoryResponse(cat));
  } catch (err) {
    next(err);
  }
});

export const adminCategoriesRouter = Router();
const staffRoles = [UserRole.ADMIN, UserRole.MARKETING];

adminCategoriesRouter.post('/admin/categories', requireAuth, requireRole(staffRoles), async (req, res, next) => {
  try {
    const input = categoryCreateSchema.parse(req.body);
    const slug = slugify(input.slug ?? input.name);
    const existing = await prisma.category.findUnique({ where: { slug } });
    if (existing) throw conflict('category_slug_taken');
    const cat = await prisma.category.create({ data: { ...input, slug }, include: { subcategories: true } });
    res.status(201).json(toCategoryResponse(cat));
  } catch (err) {
    next(err);
  }
});

adminCategoriesRouter.patch('/admin/categories/:id', requireAuth, requireRole(staffRoles), async (req, res, next) => {
  try {
    const input = categoryUpdateSchema.parse(req.body);
    const existing = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('category_not_found');
    const cat = await prisma.category.update({
      where: { id: req.params.id },
      data: input,
      include: { subcategories: { orderBy: { sortOrder: 'asc' } } },
    });
    res.json(toCategoryResponse(cat));
  } catch (err) {
    next(err);
  }
});

adminCategoriesRouter.post(
  '/admin/categories/:id/subcategories',
  requireAuth,
  requireRole(staffRoles),
  async (req: AuthedRequest, res, next) => {
    try {
      const input = subcategoryCreateSchema.parse(req.body);
      const category = await prisma.category.findUnique({ where: { id: req.params.id } });
      if (!category) throw notFound('category_not_found');
      const slug = slugify(input.slug ?? input.name);
      const existing = await prisma.subcategory.findUnique({
        where: { categoryId_slug: { categoryId: category.id, slug } },
      });
      if (existing) throw conflict('subcategory_slug_taken');
      const sub = await prisma.subcategory.create({
        data: { ...input, slug, categoryId: category.id },
      });
      res.status(201).json(sub);
    } catch (err) {
      next(err);
    }
  },
);

adminCategoriesRouter.patch(
  '/admin/subcategories/:id',
  requireAuth,
  requireRole(staffRoles),
  async (req, res, next) => {
    try {
      const input = subcategoryUpdateSchema.parse(req.body);
      const existing = await prisma.subcategory.findUnique({ where: { id: req.params.id } });
      if (!existing) throw notFound('subcategory_not_found');
      const sub = await prisma.subcategory.update({ where: { id: req.params.id }, data: input });
      res.json(sub);
    } catch (err) {
      next(err);
    }
  },
);
