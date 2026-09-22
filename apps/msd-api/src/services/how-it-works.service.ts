import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import type {
  HowItWorksContentUpdateSchema,
  HowItWorksStepCreateSchema,
  HowItWorksStepUpdateSchema,
} from '../schemas/how-it-works.schema';

type HowItWorksContentUpdateInput = z.infer<typeof HowItWorksContentUpdateSchema>;
type HowItWorksStepCreateInput = z.infer<typeof HowItWorksStepCreateSchema>;
type HowItWorksStepUpdateInput = z.infer<typeof HowItWorksStepUpdateSchema>;

/** Singleton row (same "id is always the literal string 'singleton'" convention as
 *  AboutUsContent/ContactUsContent — see site-content.service.ts's identical doc comment). */
const SINGLETON_ID = 'singleton';

const HOW_IT_WORKS_STEP_ORDER_BY = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];

/** Find-or-create-if-missing (not an unconditional upsert) — a plain GET must never perform a
 *  write against an already-existing row, same discipline as site-content.service.ts#getAboutUs. */
export async function getHowItWorksContent() {
  const existing = await prisma.howItWorksContent.findUnique({ where: { id: SINGLETON_ID } });
  if (existing) return existing;
  return prisma.howItWorksContent.create({ data: { id: SINGLETON_ID } });
}

/** A genuine write — always an upsert, so the very first admin save transparently creates the
 *  row with no separate "create" step/route (per this module's schema doc comment). */
export async function updateHowItWorksContent(input: HowItWorksContentUpdateInput) {
  return prisma.howItWorksContent.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...input },
    update: input,
  });
}

// ─── Steps (flat list, same "Active/Inactive + manual sortOrder" convention as Faq) ────────

export async function listHowItWorksSteps() {
  return prisma.howItWorksStep.findMany({ orderBy: HOW_IT_WORKS_STEP_ORDER_BY });
}

export async function getHowItWorksStepOrThrow(id: string) {
  const step = await prisma.howItWorksStep.findUnique({ where: { id } });
  if (!step) throw new ApiError('NOT_FOUND', 'How It Works step not found');
  return step;
}

export async function createHowItWorksStep(input: HowItWorksStepCreateInput) {
  return prisma.howItWorksStep.create({ data: input });
}

export async function updateHowItWorksStep(id: string, input: HowItWorksStepUpdateInput) {
  await getHowItWorksStepOrThrow(id);
  return prisma.howItWorksStep.update({ where: { id }, data: input });
}

export async function deleteHowItWorksStep(id: string) {
  await getHowItWorksStepOrThrow(id);
  await prisma.howItWorksStep.delete({ where: { id } });
}

/** Same shape/validation as media.service.ts's `reorderImages` — `orderedStepIds` must contain
 *  exactly the current set of step ids, then each row's `sortOrder` is set to its index in one
 *  transaction. */
export async function reorderHowItWorksSteps(orderedStepIds: string[]) {
  const existing = await prisma.howItWorksStep.findMany({ select: { id: true } });
  const existingIds = new Set(existing.map((s) => s.id));
  if (orderedStepIds.length !== existing.length || !orderedStepIds.every((id) => existingIds.has(id))) {
    throw new ApiError('VALIDATION_ERROR', 'Reorder list must contain exactly the current set of steps.');
  }
  await prisma.$transaction(
    orderedStepIds.map((id, index) => prisma.howItWorksStep.update({ where: { id }, data: { sortOrder: index } })),
  );
}

// ─── Public read (GET /catalog/how-it-works, no auth) — active steps only, ordered. ────────

export async function getPublicHowItWorks() {
  const [content, steps] = await Promise.all([
    getHowItWorksContent(),
    prisma.howItWorksStep.findMany({ where: { isActive: true }, orderBy: HOW_IT_WORKS_STEP_ORDER_BY }),
  ]);
  return { content, steps };
}
