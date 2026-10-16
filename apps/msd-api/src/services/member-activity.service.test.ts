import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import { getStatusHistory, getMemberActivity } from './member-activity.service';

const prismaMock = vi.mocked(prisma, true);

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.memberStatusHistory.findMany.mockResolvedValue([
    { id: 'h1', fromStatus: 'ACTIVE', toStatus: 'SUSPENDED', reason: 'Documents not completed', actorUserId: 'a1', createdAt: new Date('2026-10-10T00:00:00Z') },
  ] as never);
  prismaMock.user.findMany.mockResolvedValue([{ id: 'a1', name: 'Admin One' }] as never);
  prismaMock.memberDocument.findMany.mockResolvedValue([
    { documentType: 'PAN', status: 'REJECTED', createdAt: new Date('2026-10-02T00:00:00Z'), reviewedAt: new Date('2026-10-05T00:00:00Z'), rejectionReason: 'Blurry scan', uploadedOnBehalf: true },
  ] as never);
});

describe('member activity', () => {
  it('status history carries the actor name', async () => {
    const [row] = await getStatusHistory('m1');
    expect(row).toMatchObject({ fromStatus: 'ACTIVE', toStatus: 'SUSPENDED', actorName: 'Admin One' });
  });

  it('resolves actor names in one batched query', async () => {
    await getStatusHistory('m1');
    expect(prismaMock.user.findMany).toHaveBeenCalledTimes(1);
  });

  it('activity merges status changes and document events, newest first', async () => {
    const items = await getMemberActivity('m1');
    expect(items.map((i) => i.kind)).toEqual(['status', 'document', 'document']);
    expect(items[0].at.getTime()).toBeGreaterThan(items[1].at.getTime());
  });
});
