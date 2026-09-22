import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import type {
  CareersPageContentUpdateSchema,
  CareersJobListingCreateSchema,
  CareersJobListingUpdateSchema,
} from '../schemas/careers.schema';

type CareersPageContentUpdateInput = z.infer<typeof CareersPageContentUpdateSchema>;
type CareersJobListingCreateInput = z.infer<typeof CareersJobListingCreateSchema>;
type CareersJobListingUpdateInput = z.infer<typeof CareersJobListingUpdateSchema>;

/** Singleton row (same "id is always the literal string 'singleton'" convention as
 *  AboutUsContent/ContactUsContent — see site-content.service.ts's identical doc comment). */
const SINGLETON_ID = 'singleton';

const CAREERS_JOB_ORDER_BY = [{ sortOrder: 'asc' as const }, { createdAt: 'desc' as const }];

/** Find-or-create-if-missing (not an unconditional upsert) — a plain GET must never perform a
 *  write against an already-existing row, same discipline as site-content.service.ts#getAboutUs. */
export async function getCareersPageContent() {
  const existing = await prisma.careersPageContent.findUnique({ where: { id: SINGLETON_ID } });
  if (existing) return existing;
  return prisma.careersPageContent.create({ data: { id: SINGLETON_ID } });
}

/** A genuine write — always an upsert, so the very first admin save transparently creates the
 *  row with no separate "create" step/route (per this module's schema doc comment). */
export async function updateCareersPageContent(input: CareersPageContentUpdateInput) {
  return prisma.careersPageContent.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...input },
    update: input,
  });
}

// ─── Job listings (full admin CRUD — mirrors blog-posts.routes.ts's DRAFT/PUBLISHED status flow) ──

export async function listCareersJobListings(opts: { page: number; pageSize: number; search?: string; status?: 'DRAFT' | 'PUBLISHED' }) {
  const where = {
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.search ? { jobTitle: { contains: opts.search, mode: 'insensitive' as const } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.careersJobListing.findMany({
      where,
      orderBy: CAREERS_JOB_ORDER_BY,
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    }),
    prisma.careersJobListing.count({ where }),
  ]);
  return { items, total };
}

export async function getCareersJobListingOrThrow(id: string) {
  const job = await prisma.careersJobListing.findUnique({ where: { id } });
  if (!job) throw new ApiError('NOT_FOUND', 'Job listing not found');
  return job;
}

export async function createCareersJobListing(input: CareersJobListingCreateInput) {
  return prisma.careersJobListing.create({ data: input });
}

export async function updateCareersJobListing(id: string, input: CareersJobListingUpdateInput) {
  await getCareersJobListingOrThrow(id);
  return prisma.careersJobListing.update({ where: { id }, data: input });
}

export async function setCareersJobListingStatus(id: string, status: 'DRAFT' | 'PUBLISHED') {
  await getCareersJobListingOrThrow(id);
  return prisma.careersJobListing.update({ where: { id }, data: { status } });
}

export async function deleteCareersJobListing(id: string) {
  await getCareersJobListingOrThrow(id);
  await prisma.careersJobListing.delete({ where: { id } });
}

// ─── Public read (GET /catalog/careers, no auth) — published jobs only, ordered. ───────────

export async function getPublicCareers() {
  const [content, jobs] = await Promise.all([
    getCareersPageContent(),
    prisma.careersJobListing.findMany({ where: { status: 'PUBLISHED' }, orderBy: CAREERS_JOB_ORDER_BY }),
  ]);
  return { content, jobs };
}
