import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { assertCategoryChildOf } from './category.service';
import type { ServiceCreateSchema, ServiceUpdateSchema } from '../schemas/service.schema';

type ServiceCreateInput = z.infer<typeof ServiceCreateSchema>;
type ServiceUpdateInput = z.infer<typeof ServiceUpdateSchema>;

const CATEGORY_INCLUDE = {
  category: { select: { id: true, name: true } },
  subcategory: { select: { id: true, name: true } },
} as const;

export async function listServices(opts: {
  page: number; pageSize: number; search?: string; categoryId?: string; subcategoryId?: string; status?: 'active' | 'inactive';
}) {
  const where = {
    ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
    ...(opts.subcategoryId ? { subcategoryId: opts.subcategoryId } : {}),
    ...(opts.status ? { isActive: opts.status === 'active' } : {}),
    ...(opts.search ? { OR: [
      { name: { contains: opts.search, mode: 'insensitive' as const } },
      { slug: { contains: opts.search, mode: 'insensitive' as const } },
    ] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.service.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (opts.page - 1) * opts.pageSize, take: opts.pageSize, include: CATEGORY_INCLUDE }),
    prisma.service.count({ where }),
  ]);
  return { items, total };
}

export async function getServiceOrThrow(id: string) {
  const service = await prisma.service.findUnique({ where: { id }, include: CATEGORY_INCLUDE });
  if (!service) throw new ApiError('NOT_FOUND', 'Service not found');
  return service;
}

async function assertSlugAvailable(slug: string, excludeId?: string) {
  const existing = await prisma.service.findUnique({ where: { slug } });
  if (existing && existing.id !== excludeId) throw new ApiError('CONFLICT', `Service slug "${slug}" already exists`);
}

export async function createService(input: ServiceCreateInput) {
  await assertSlugAvailable(input.slug);
  await assertCategoryChildOf(input.categoryId, input.subcategoryId);
  return prisma.service.create({ data: input, include: CATEGORY_INCLUDE });
}

export async function updateService(id: string, input: ServiceUpdateInput) {
  const service = await getServiceOrThrow(id);
  if (input.slug) await assertSlugAvailable(input.slug, id);
  if (input.categoryId || input.subcategoryId) {
    await assertCategoryChildOf(input.categoryId ?? service.categoryId, input.subcategoryId ?? service.subcategoryId ?? undefined);
  }
  return prisma.service.update({ where: { id }, data: input, include: CATEGORY_INCLUDE });
}

export async function setServiceStatus(id: string, isActive: boolean) {
  await getServiceOrThrow(id);
  return prisma.service.update({ where: { id }, data: { isActive }, include: CATEGORY_INCLUDE });
}

export async function deleteService(id: string) {
  await getServiceOrThrow(id);
  await prisma.service.delete({ where: { id } });
}
