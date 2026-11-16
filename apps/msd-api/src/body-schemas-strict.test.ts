import { describe, expect, it, vi } from 'vitest';
import type { BodyValidator } from './middleware/validate';
import { isStrictObject } from './schemas/common.schema';

vi.mock('./lib/prisma', async () => {
  const { createPrismaMock } = await import('./test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import app from './app';
import LOOSE_ALLOWLIST from './body-schemas-loose.json';

interface Layer {
  route?: { path: string; methods: Record<string, boolean>; stack: { handle: unknown }[] };
  name?: string;
  handle?: { stack?: Layer[] };
  regexp?: RegExp;
}

/** Turns an Express 4 mount regexp (`/^\/api\/v1\/rbac\/?(?=\/|$)/i`) back into its path. */
const mountPath = (regexp?: RegExp) =>
  (regexp?.source ?? '')
    .replace(/^\^/, '')
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
    .replace(/\\\//g, '/');

const isBodyValidator = (handle: unknown): handle is BodyValidator =>
  typeof handle === 'function' && 'bodySchema' in handle;

/** `METHOD /full/path` of every route whose `validateBody` schema is not `.strict()`. */
function looseBodyRoutes(stack: Layer[], prefix = ''): string[] {
  return stack.flatMap((layer) => {
    if (layer.route) {
      const loose = layer.route.stack.some((s) => isBodyValidator(s.handle) && !isStrictObject(s.handle.bodySchema));
      if (!loose) return [];
      return Object.keys(layer.route.methods).map((m) => `${m.toUpperCase()} ${prefix}${layer.route?.path}`);
    }
    if (layer.name === 'router' && layer.handle?.stack) return looseBodyRoutes(layer.handle.stack, prefix + mountPath(layer.regexp));
    return [];
  });
}

/**
 * P2-14: every request body schema is `.strict()`, so an unknown key gets 422 instead of reaching
 * a service (mass assignment). The routes in `body-schemas-loose.json` predate the rule; making
 * them strict can 422 a console form that sends extra fields, so each one moves with its own
 * review (P11-02). The list only shrinks: a new loose route fails, and so does a listed route that
 * became strict until it is removed from the file.
 */
describe('body schemas are strict (P2-14)', () => {
  const stack = (app as unknown as { _router: { stack: Layer[] } })._router.stack;
  const loose = looseBodyRoutes(stack);
  const allowed = new Set<string>(LOOSE_ALLOWLIST);

  it('adds no new route with a loose body schema', () => {
    expect(loose.filter((route) => !allowed.has(route))).toEqual([]);
  });

  it('drops a route from the allowlist once its schema is strict', () => {
    const stillLoose = new Set(loose);
    expect(LOOSE_ALLOWLIST.filter((route) => !stillLoose.has(route))).toEqual([]);
  });

  it('finds the strict deal routes, so the walk reaches nested routers', () => {
    expect(loose.some((r) => r.includes('/deals/:dealId/images/reorder'))).toBe(true);
    expect(loose).not.toContain('POST /api/v1/vendors/me/branches/:branchId/deals');
  });
});
