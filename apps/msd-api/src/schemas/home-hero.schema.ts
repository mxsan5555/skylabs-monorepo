import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema } from './common.schema';

extendZodWithOpenApi(z);

/** `state: null` (omitted) means the Global/Default slider slot — see `HomeHeroSlide`'s schema
 *  doc comment and `home-hero.service.ts`'s publish-eligibility gate. */
export const HomeHeroSlideListQuerySchema = PaginationQuerySchema.extend({
  state: z.string().max(100).optional(),
});

/** Choose the state first (null = Global/Default), then one deal or product of that state. */
export const HomeHeroSlideCreateSchema = z
  .object({
    itemType: z.enum(['deal', 'product']),
    itemId: z.string().uuid(),
    state: z.string().trim().min(1).max(100).nullable().optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
  })
  .strict()
  .openapi('HomeHeroSlideCreate');

/** Only the order changes; to show another item, remove the slide and add a new one. */
export const HomeHeroSlideUpdateSchema = z
  .object({ sortOrder: z.number().int().min(0).max(999) })
  .strict()
  .openapi('HomeHeroSlideUpdate');

export const HomeHeroSlideStatusUpdateSchema = z.object({ isActive: z.boolean() }).openapi('HomeHeroSlideStatusUpdate');

/** Shared by `/home-hero/search-items` and `/promotions/search-items`. Empty `state` = every state. */
export const StateItemSearchQuerySchema = z
  .object({
    state: z.string().max(100).optional(),
    q: z.string().max(200).optional(),
    type: z.enum(['deal', 'product', 'all']).default('all'),
    pageSize: z.coerce.number().int().min(1).max(48).default(12),
    eligibleOnly: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  })
  .strict();

/** Save a slider's order: `state` null = Global / Default; every slide id exactly once. */
export const HomeHeroReorderSchema = z
  .object({
    state: z.string().trim().min(1).max(100).nullable(),
    slideIds: z.array(z.string().uuid()).min(1).max(100),
  })
  .strict()
  .openapi('HomeHeroReorder');

export const PublicHomeHeroQuerySchema = z.object({
  state: z.string().max(100).optional(),
});
