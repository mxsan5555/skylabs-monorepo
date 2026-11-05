import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});
vi.mock('../config/env', () => ({ env: { supportEmail: 'help@msd.test', supportPhone: '' } }));
const sendOnChannel = vi.fn();
vi.mock('./member-notice.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./member-notice.service')>()),
  sendOnChannel: (...a: unknown[]) => sendOnChannel(...a),
}));
const notifyPermissionHolders = vi.fn();
vi.mock('./notification.service', () => ({ notifyPermissionHolders: (...a: unknown[]) => notifyPermissionHolders(...a) }));
const writeAuditLog = vi.fn();
vi.mock('./audit.service', () => ({ writeAuditLog: (...a: unknown[]) => writeAuditLog(...a) }));

import { prisma } from '../lib/prisma';
import { Prisma } from '../generated/prisma-client';
import { runDocumentReminders, sendManualReminder } from './member-reminder.service';
import { MAX_SEND_ATTEMPTS, REMINDER_COUNT, documentsDueAt } from './member-reminder-policy';

const prismaMock = vi.mocked(prisma, true);
const DAY = 24 * 60 * 60 * 1000;
const CREATED = new Date('2026-10-01T04:30:00Z');
const DUE = documentsDueAt(CREATED);
const day = (n: number) => new Date(CREATED.getTime() + n * DAY);
const ACTOR = { userId: 'admin-1', ip: '1.1.1.1', userAgent: 'test' };
const ALL_TYPES = ['AADHAAR', 'PAN', 'GST'];

type Row = {
  id: string;
  memberId: string;
  sequence: number | null;
  missingTypes: string[];
  emailStatus: string | null;
  smsStatus: string | null;
  attempts: number;
  sentAt: Date | null;
  sentByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function row(over: Partial<Row>): Row {
  return {
    id: `r${over.sequence ?? 'm'}`,
    memberId: 'm1',
    sequence: 1,
    missingTypes: ALL_TYPES,
    emailStatus: 'SENT',
    smsStatus: 'SENT',
    attempts: 1,
    sentAt: day(14),
    sentByUserId: null,
    createdAt: day(14),
    updatedAt: day(14),
    ...over,
  };
}

/** Warnings 1 to n delivered on schedule (day 14, 21, 28). */
const deliveredWarnings = (n: number) => Array.from({ length: n }, (_, i) => row({ sequence: i + 1, sentAt: day(14 + i * 7) }));

function member(over: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    status: 'ACTIVE',
    businessName: 'Glow',
    documentsDueAt: DUE,
    reviewFlaggedAt: null,
    owner: { name: 'Asha', email: 'a@x.com', phone: '+919876543210' },
    documents: [],
    documentReminders: [],
    ...over,
  };
}

const COMPLETE_DOCUMENTS = ALL_TYPES.map((documentType) => ({ documentType, status: 'APPROVED' }));

function membersOnce(...members: ReturnType<typeof member>[]) {
  prismaMock.member.findMany.mockResolvedValueOnce(members as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  sendOnChannel.mockResolvedValue(true);
  prismaMock.member.findMany.mockResolvedValue([] as never);
  prismaMock.member.updateMany.mockResolvedValue({ count: 1 } as never);
  prismaMock.memberDocumentReminder.updateMany.mockResolvedValue({ count: 1 } as never);
  prismaMock.memberDocumentReminder.findFirst.mockResolvedValue(null as never);
  prismaMock.memberDocumentReminder.create.mockImplementation((async ({ data }: { data: Partial<Row> }) =>
    row({ attempts: 0, sentAt: null, emailStatus: null, smsStatus: null, ...data })) as never);
  prismaMock.memberDocumentReminder.update.mockImplementation((async ({ data }: { data: Partial<Row> }) =>
    row({ ...data })) as never);
});

describe('runDocumentReminders', () => {
  it('only looks at active or inactive members whose documents are due', async () => {
    await runDocumentReminders(day(14));
    expect(prismaMock.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: { in: ['ACTIVE', 'INACTIVE'] }, documentsDueAt: { lte: day(14) } } }),
    );
  });

  it('sends warning 1 on the due date by email and SMS, listing every missing document', async () => {
    membersOnce(member());
    const summary = await runDocumentReminders(day(14));
    expect(prismaMock.memberDocumentReminder.create).toHaveBeenCalledWith({
      data: { memberId: 'm1', sequence: 1, missingTypes: ALL_TYPES, emailStatus: 'PENDING', smsStatus: 'PENDING' },
    });
    expect(sendOnChannel.mock.calls.map((c) => c[0])).toEqual(['email', 'sms']);
    expect(sendOnChannel.mock.calls[0][3]).toContain(`Reminder 1 of ${REMINDER_COUNT}`);
    expect(prismaMock.memberDocumentReminder.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { emailStatus: 'SENT', smsStatus: 'SENT', sentAt: day(14) },
    });
    expect(summary).toEqual({ checked: 1, sent: 1, failed: 0, flagged: 0, cleared: 0 });
  });

  it('a second run on the same day sends nothing again', async () => {
    membersOnce(member({ documentReminders: deliveredWarnings(1) }));
    const summary = await runDocumentReminders(day(14));
    expect(prismaMock.memberDocumentReminder.create).not.toHaveBeenCalled();
    expect(sendOnChannel).not.toHaveBeenCalled();
    expect(summary.sent).toBe(0);
  });

  it('a run that loses the claim to a parallel run sends nothing', async () => {
    membersOnce(member());
    prismaMock.memberDocumentReminder.updateMany.mockResolvedValueOnce({ count: 0 } as never);
    await runDocumentReminders(day(14));
    expect(sendOnChannel).not.toHaveBeenCalled();
  });

  it('a warning a parallel run already created is skipped, not duplicated', async () => {
    membersOnce(member());
    prismaMock.memberDocumentReminder.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test' }),
    );
    const summary = await runDocumentReminders(day(14));
    expect(sendOnChannel).not.toHaveBeenCalled();
    expect(summary.failed).toBe(0);
  });

  it('retries only the channel that failed', async () => {
    membersOnce(member({ documentReminders: [row({ sequence: 1, smsStatus: 'FAILED' })] }));
    await runDocumentReminders(day(15));
    expect(sendOnChannel.mock.calls.map((c) => c[0])).toEqual(['sms']);
  });

  it('gives up on a channel after the attempt limit', async () => {
    const stuck = row({ sequence: 1, emailStatus: 'FAILED', smsStatus: 'FAILED', sentAt: null, attempts: MAX_SEND_ATTEMPTS });
    membersOnce(member({ documentReminders: [stuck] }));
    prismaMock.memberDocumentReminder.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test' }),
    );
    await runDocumentReminders(day(20));
    expect(sendOnChannel).not.toHaveBeenCalled();
  });

  it('counts a warning that reached no channel as failed', async () => {
    membersOnce(member());
    sendOnChannel.mockResolvedValue(false);
    const summary = await runDocumentReminders(day(14));
    expect(prismaMock.memberDocumentReminder.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { emailStatus: 'FAILED', smsStatus: 'FAILED', sentAt: null },
    });
    expect(summary).toMatchObject({ sent: 0, failed: 1 });
  });

  it('sends warning 3 as the final reminder a week after warning 2', async () => {
    membersOnce(member({ documentReminders: deliveredWarnings(2) }));
    await runDocumentReminders(day(28));
    expect(prismaMock.memberDocumentReminder.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sequence: 3 }) }));
    expect(sendOnChannel.mock.calls[0][3]).toContain('may suspend your account');
  });

  it('asks only for the documents still needed, including a rejected one', async () => {
    membersOnce(member({ documents: [{ documentType: 'AADHAAR', status: 'APPROVED' }, { documentType: 'PAN', status: 'REJECTED' }] }));
    await runDocumentReminders(day(14));
    expect(prismaMock.memberDocumentReminder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ missingTypes: ['GST', 'PAN'] }) }),
    );
  });

  it('flags the member on day 35 and tells everyone who may change member status', async () => {
    membersOnce(member({ documentReminders: deliveredWarnings(3) }));
    const summary = await runDocumentReminders(day(35));
    expect(prismaMock.member.updateMany).toHaveBeenCalledWith({ where: { id: 'm1', reviewFlaggedAt: null }, data: { reviewFlaggedAt: day(35) } });
    expect(notifyPermissionHolders).toHaveBeenCalledWith(
      expect.anything(),
      { menuKey: 'members', action: 'status_change' },
      expect.objectContaining({ type: 'MEMBER_REVIEW_FLAGGED', entityType: 'MEMBER', entityId: 'm1' }),
    );
    expect(summary.flagged).toBe(1);
  });

  it('never changes the member status when flagging', async () => {
    membersOnce(member({ documentReminders: deliveredWarnings(3) }));
    await runDocumentReminders(day(35));
    for (const [args] of prismaMock.member.updateMany.mock.calls) {
      expect((args as { data: Record<string, unknown> }).data).not.toHaveProperty('status');
    }
  });

  it('does not flag before day 35', async () => {
    membersOnce(member({ documentReminders: deliveredWarnings(3) }));
    await runDocumentReminders(day(34));
    expect(prismaMock.member.updateMany).not.toHaveBeenCalled();
  });

  it('does not notify again when the flag is already set', async () => {
    membersOnce(member({ documentReminders: deliveredWarnings(3), reviewFlaggedAt: day(35) }));
    await runDocumentReminders(day(40));
    expect(notifyPermissionHolders).not.toHaveBeenCalled();
  });

  it('does not notify when a parallel run set the flag first', async () => {
    membersOnce(member({ documentReminders: deliveredWarnings(3) }));
    prismaMock.member.updateMany.mockResolvedValueOnce({ count: 0 } as never);
    const summary = await runDocumentReminders(day(35));
    expect(notifyPermissionHolders).not.toHaveBeenCalled();
    expect(summary.flagged).toBe(0);
  });

  it('clears the flag once documents are complete and sends nothing', async () => {
    membersOnce(member({ documents: COMPLETE_DOCUMENTS, reviewFlaggedAt: day(35), documentReminders: deliveredWarnings(3) }));
    const summary = await runDocumentReminders(day(36));
    expect(prismaMock.member.updateMany).toHaveBeenCalledWith({ where: { id: 'm1', reviewFlaggedAt: { not: null } }, data: { reviewFlaggedAt: null } });
    expect(sendOnChannel).not.toHaveBeenCalled();
    expect(summary.cleared).toBe(1);
  });

  it('sends nothing to a member whose documents are complete', async () => {
    membersOnce(member({ documents: COMPLETE_DOCUMENTS }));
    await runDocumentReminders(day(14));
    expect(prismaMock.memberDocumentReminder.create).not.toHaveBeenCalled();
    expect(prismaMock.member.updateMany).not.toHaveBeenCalled();
  });

  it('keeps going when one member fails', async () => {
    membersOnce(member({ id: 'm-bad' }), member({ id: 'm2' }));
    prismaMock.memberDocumentReminder.create.mockRejectedValueOnce(new Error('db hiccup'));
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    const summary = await runDocumentReminders(day(14));
    expect(summary).toMatchObject({ checked: 2, failed: 1, sent: 1 });
  });

  it('pages through members in batches', async () => {
    const full = Array.from({ length: 200 }, (_, i) => member({ id: `m${i}`, documents: COMPLETE_DOCUMENTS }));
    membersOnce(...full);
    membersOnce(member({ id: 'm-last', documents: COMPLETE_DOCUMENTS }));
    const summary = await runDocumentReminders(day(14));
    expect(prismaMock.member.findMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.member.findMany.mock.calls[1][0]).toMatchObject({ cursor: { id: 'm199' }, skip: 1 });
    expect(summary.checked).toBe(201);
  });
});

describe('sendManualReminder', () => {
  beforeEach(() => {
    prismaMock.member.findUnique.mockResolvedValue(member() as never);
  });

  it('sends a reminder outside the schedule, records who sent it and audits it', async () => {
    const result = await sendManualReminder('m1', ACTOR, day(16));
    expect(prismaMock.memberDocumentReminder.create).toHaveBeenCalledWith({
      data: {
        memberId: 'm1',
        sequence: null,
        missingTypes: ALL_TYPES,
        sentByUserId: 'admin-1',
        attempts: 1,
        emailStatus: 'PENDING',
        smsStatus: 'PENDING',
      },
    });
    expect(sendOnChannel.mock.calls[0][3]).toMatch(/^Reminder: /);
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'member.reminder.sent', targetId: 'm1', actorUserId: 'admin-1' }));
    expect(result).toEqual({ emailStatus: 'SENT', smsStatus: 'SENT', sentAt: day(16) });
  });

  it('reports a channel that failed', async () => {
    sendOnChannel.mockImplementation(async (channel: string) => channel === 'sms');
    const result = await sendManualReminder('m1', ACTOR, day(16));
    expect(result).toMatchObject({ emailStatus: 'FAILED', smsStatus: 'SENT' });
  });

  it('skips the email channel when the member has no email', async () => {
    prismaMock.member.findUnique.mockResolvedValue(member({ owner: { name: 'Asha', email: null, phone: '+919876543210' } }) as never);
    const result = await sendManualReminder('m1', ACTOR, day(16));
    expect(sendOnChannel.mock.calls.map((c) => c[0])).toEqual(['sms']);
    expect(result.emailStatus).toBeNull();
  });

  it.each([
    ['an unknown member', null, 'NOT_FOUND'],
    ['a suspended member', member({ status: 'SUSPENDED' }), 'CONFLICT'],
    ['a member with complete documents', member({ documents: COMPLETE_DOCUMENTS }), 'CONFLICT'],
    ['a member with no email or phone', member({ owner: { name: 'Asha', email: null, phone: null } }), 'CONFLICT'],
  ])('refuses %s', async (_label, found, code) => {
    prismaMock.member.findUnique.mockResolvedValue(found as never);
    await expect(sendManualReminder('m1', ACTOR, day(16))).rejects.toMatchObject({ code });
    expect(sendOnChannel).not.toHaveBeenCalled();
  });

  it('refuses a second manual reminder inside the cooldown', async () => {
    prismaMock.memberDocumentReminder.findFirst.mockResolvedValue({ createdAt: new Date(day(16).getTime() - 60 * 60 * 1000) } as never);
    await expect(sendManualReminder('m1', ACTOR, day(16))).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(prismaMock.memberDocumentReminder.create).not.toHaveBeenCalled();
  });
});
