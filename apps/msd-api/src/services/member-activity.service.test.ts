import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import { getStatusHistory, getMemberActivity, reminderSummary } from './member-activity.service';
import { REVIEW_FLAG_SUMMARY } from '../lib/member-messages';
import { REMINDER_COUNT } from './member-reminder-policy';

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
  prismaMock.memberDocumentReminder.findMany.mockResolvedValue([] as never);
  prismaMock.member.findUnique.mockResolvedValue({ reviewFlaggedAt: null } as never);
});

const REMINDER = {
  sequence: 2,
  missingTypes: ['AADHAAR', 'GST'],
  emailStatus: 'SENT',
  smsStatus: 'FAILED',
  sentAt: new Date('2026-10-12T04:30:00Z'),
  sentByUserId: null,
  updatedAt: new Date('2026-10-12T04:30:00Z'),
};

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

  it('lists reminders with what reached the member and the documents asked for', async () => {
    prismaMock.memberDocumentReminder.findMany.mockResolvedValue([REMINDER] as never);
    const items = await getMemberActivity('m1');
    const reminder = items.find((i) => i.kind === 'reminder');
    expect(reminder).toMatchObject({ summary: `Reminder 2 of ${REMINDER_COUNT} sent by email`, detail: 'Aadhaar card, GST number' });
  });

  it('names the admin who sent a manual reminder', async () => {
    prismaMock.memberDocumentReminder.findMany.mockResolvedValue([{ ...REMINDER, sequence: null, smsStatus: 'SENT', sentByUserId: 'a1' }] as never);
    const items = await getMemberActivity('m1');
    expect(items.find((i) => i.kind === 'reminder')?.summary).toBe('Manual reminder by Admin One sent by email and SMS');
  });

  it('shows the review flag when it is set', async () => {
    const flaggedAt = new Date('2026-11-05T04:30:00Z');
    prismaMock.member.findUnique.mockResolvedValue({ reviewFlaggedAt: flaggedAt } as never);
    const [first] = await getMemberActivity('m1');
    expect(first).toEqual({ kind: 'review', at: flaggedAt, summary: REVIEW_FLAG_SUMMARY, detail: null });
  });
});

describe('reminderSummary', () => {
  it('says so when no channel delivered', () => {
    expect(reminderSummary({ sequence: 1, emailStatus: 'FAILED', smsStatus: null })).toBe(`Reminder 1 of ${REMINDER_COUNT} could not be delivered`);
  });
});
