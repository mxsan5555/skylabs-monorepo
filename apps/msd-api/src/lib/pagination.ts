import { z } from 'zod';

export const offsetQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type OffsetQuery = z.infer<typeof offsetQuerySchema>;

export function offsetResult<T>(items: T[], total: number, query: OffsetQuery) {
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export const cursorQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});
export type CursorQuery = z.infer<typeof cursorQuerySchema>;

/** Cursor is just the last item's id, base64-encoded — fine for a single sort key (createdAt/id). */
export function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, 'base64url').toString('utf8');
}
