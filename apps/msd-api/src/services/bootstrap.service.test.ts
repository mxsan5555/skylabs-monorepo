import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});
vi.mock('./permission-resolver.service', () => ({
  resolveGrantedPermissionKeys: vi.fn().mockResolvedValue([]),
}));

import { prisma } from '../lib/prisma';
import { getBootstrap } from './bootstrap.service';

const prismaMock = vi.mocked(prisma, true);
const payload = { sub: 'u1', roles: ['vendor'], app: 'msd' } as never;

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.findFirst.mockResolvedValue({ id: 'u1', name: 'Owner', email: 'o@x.in', phone: null, status: 'ACTIVE' } as never);
  prismaMock.role.findMany.mockResolvedValue([] as never);
  prismaMock.roleDashboardWidget.findMany.mockResolvedValue([] as never);
});

describe('getBootstrap member info', () => {
  it('exposes an INACTIVE member status to its owner', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ id: 'm1', status: 'INACTIVE' } as never);
    const res = await getBootstrap(payload);
    expect(res.member).toEqual({ id: 'm1', status: 'INACTIVE' });
    expect(prismaMock.member.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerUserId: 'u1' } }));
  });

  it('returns member null for a user who owns no member', async () => {
    prismaMock.member.findUnique.mockResolvedValue(null as never);
    const res = await getBootstrap(payload);
    expect(res.member).toBeNull();
  });
});
