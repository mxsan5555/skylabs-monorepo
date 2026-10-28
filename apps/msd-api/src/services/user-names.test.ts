import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import { userNamesById } from './user-names';

const prismaMock = vi.mocked(prisma, true);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('userNamesById', () => {
  it('looks up each id once, ignores empty ids, and maps id to name', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'a1', name: 'Priya' }] as never);
    const names = await userNamesById(['a1', null, 'a1', undefined, 'gone']);
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({ where: { id: { in: ['a1', 'gone'] } }, select: { id: true, name: true } });
    expect(names.get('a1')).toBe('Priya');
    expect(names.has('gone')).toBe(false);
  });

  it('makes no query when there are no ids', async () => {
    const names = await userNamesById([null, undefined]);
    expect(names.size).toBe(0);
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });
});
