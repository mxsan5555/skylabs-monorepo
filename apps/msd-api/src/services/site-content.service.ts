import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { Prisma } from '../generated/prisma-client';
import type { AboutUsUpdateSchema, ContactUsUpdateSchema } from '../schemas/site-content.schema';
import * as mediaService from './media.service';
import type { MediaFile } from './media.service';

type AboutUsUpdateInput = z.infer<typeof AboutUsUpdateSchema>;
type ContactUsUpdateInput = z.infer<typeof ContactUsUpdateSchema>;

/** Both `AboutUsContent` and `ContactUsContent` are singleton tables (schema.prisma's own doc
 *  comment on each model) — every read/write always targets this one literal id, never a
 *  generated uuid. */
const SINGLETON_ID = 'singleton';

/** Declared outside any `as const` object — see `category.service.ts`'s identical
 *  `CATEGORY_IMAGE_ORDER_BY` doc comment for why. */
const ABOUT_US_IMAGE_ORDER_BY: Prisma.AboutUsImageOrderByWithRelationInput[] = [
  { isPrimary: 'desc' },
  { sortOrder: 'asc' },
];

/** Find-or-create-if-missing (same discipline as seed.ts's own "find-or-create: admin-editable
 *  fields are never overwritten" convention) rather than an unconditional `upsert` — a plain GET
 *  must never perform a write against an already-existing row (which an empty-`update` upsert
 *  would still do, needlessly bumping `updatedAt` on every read). */
export async function getAboutUs() {
  const existing = await prisma.aboutUsContent.findUnique({
    where: { id: SINGLETON_ID },
    include: { mediaImages: { orderBy: ABOUT_US_IMAGE_ORDER_BY } },
  });
  if (existing) return existing;
  return prisma.aboutUsContent.create({
    data: { id: SINGLETON_ID },
    include: { mediaImages: { orderBy: ABOUT_US_IMAGE_ORDER_BY } },
  });
}

/** A genuine write — always an upsert, so the very first admin save transparently creates the
 *  row with no separate "create" step/route (per this module's schema doc comment). */
export async function updateAboutUs(input: AboutUsUpdateInput) {
  const data = { ...input, ...(input.body ? { body: input.body as Prisma.InputJsonValue } : {}) };
  return prisma.aboutUsContent.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...data },
    update: data,
    include: { mediaImages: { orderBy: ABOUT_US_IMAGE_ORDER_BY } },
  });
}

export async function getContactUs() {
  const existing = await prisma.contactUsContent.findUnique({ where: { id: SINGLETON_ID } });
  if (existing) return existing;
  return prisma.contactUsContent.create({ data: { id: SINGLETON_ID } });
}

export async function updateContactUs(input: ContactUsUpdateInput) {
  const data = { ...input, ...(input.socialLinks ? { socialLinks: input.socialLinks as Prisma.InputJsonValue } : {}) };
  return prisma.contactUsContent.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...data },
    update: data,
  });
}

// ─── AboutUs media (shared upload system — see media.service.ts's doc comment). No video, and
// no ContactUs media — a contact page has no gallery need (see ContactUsContent's schema doc
// comment). ───────────────────────────────────────────────────────────────────────────────────

export async function addAboutUsImage(file: MediaFile) {
  // Ensures the singleton row exists first — media.service.ts#addImage inserts a row with an FK
  // to AboutUsContent.id, which would otherwise violate the foreign key on a brand-new instance
  // that has never been saved via updateAboutUs yet.
  const aboutUs = await getAboutUs();
  return mediaService.addImage('about-us', aboutUs.id, file);
}

export async function deleteAboutUsImage(imageId: string) {
  return mediaService.deleteImage('about-us', SINGLETON_ID, imageId);
}

export async function reorderAboutUsImages(orderedImageIds: string[]) {
  return mediaService.reorderImages('about-us', SINGLETON_ID, orderedImageIds);
}

export async function setAboutUsPrimaryImage(imageId: string) {
  return mediaService.setPrimaryImage('about-us', SINGLETON_ID, imageId);
}

// ─── Public passthroughs (GET /catalog/about-us, GET /catalog/contact-us, no auth) — no draft/
// published concept exists for a singleton row, so these simply return the current saved row,
// same as the admin read above. ─────────────────────────────────────────────────────────────

export async function getPublicAboutUs() {
  return getAboutUs();
}

export async function getPublicContactUs() {
  return getContactUs();
}
