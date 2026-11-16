import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

vi.mock('./member-notice.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./member-notice.service')>()),
  sendMemberNotice: vi.fn(),
}));

import { prisma } from '../lib/prisma';
import { sendMemberNotice } from './member-notice.service';
import { createMember } from './vendor.service';

const prismaMock = vi.mocked(prisma, true);
const noticeMock = vi.mocked(sendMemberNotice);
const INPUT = {
  businessName: 'Glow Studio',
  ownerFirstName: 'Asha',
  ownerLastName: 'Rao',
  ownerEmail: 'asha@glow.test',
  ownerMobile: '+919876543210',
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.findFirst.mockResolvedValue(null);
  prismaMock.user.create.mockResolvedValue({ id: 'u1' });
  prismaMock.role.findUnique.mockResolvedValue({ id: 'r-member', key: 'member' });
  prismaMock.userRole.upsert.mockResolvedValue({});
  prismaMock.member.findUnique.mockResolvedValue(null);
  prismaMock.member.update.mockResolvedValue({});
  prismaMock.member.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...data,
    owner: { id: 'u1', name: 'Asha Rao', email: INPUT.ownerEmail, phone: INPUT.ownerMobile, status: 'active', roles: [] },
    documents: [],
    mediaImages: [],
    mediaVideo: null,
    _count: { branches: 0, deals: 0, products: 0, therapists: 0 },
  }));
  noticeMock.mockResolvedValue({ email: true, sms: true });
});

describe('createMember', () => {
  it('creates an ACTIVE member with the documents timer and the member role', async () => {
    const before = Date.now();
    const member = await createMember(INPUT, 'admin-1');
    const data = prismaMock.member.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'ACTIVE', ownerUserId: 'u1', createdByUserId: 'admin-1', businessName: 'Glow Studio' });
    const due = (data.documentsDueAt as Date).getTime();
    expect(due).toBeGreaterThanOrEqual(before + 14 * 24 * 3600 * 1000 - 5000);
    expect(due).toBeLessThanOrEqual(Date.now() + 14 * 24 * 3600 * 1000 + 5000);
    expect(prismaMock.userRole.upsert).toHaveBeenCalled();
    expect(prismaMock.role.findUnique).toHaveBeenCalledWith({ where: { key: 'member' } });
    expect(member.status).toBe('ACTIVE');
  });

  it('creates the owner User and the Member inside one transaction', async () => {
    await createMember(INPUT, 'admin-1');
    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: { name: 'Asha Rao', email: INPUT.ownerEmail, phone: INPUT.ownerMobile },
    });
  });

  it('returns a documents summary with all three documents missing', async () => {
    const member = await createMember(INPUT, 'admin-1');
    expect(member.documentsSummary).toMatchObject({ complete: false, missing: ['AADHAAR', 'PAN', 'GST'] });
  });

  it('sends the welcome notice once after commit and records welcomeSentAt', async () => {
    const member = await createMember(INPUT, 'admin-1');
    expect(noticeMock).toHaveBeenCalledOnce();
    expect(noticeMock).toHaveBeenCalledWith('WELCOME', { name: 'Asha Rao', email: INPUT.ownerEmail, phone: INPUT.ownerMobile });
    const commitOrder = prismaMock.$transaction.mock.invocationCallOrder[0];
    expect(noticeMock.mock.invocationCallOrder[0]).toBeGreaterThan(commitOrder);
    expect(prismaMock.member.update).toHaveBeenCalledWith({
      where: { id: member.id },
      data: { welcomeSentAt: expect.any(Date) },
    });
    expect(member.welcomeSentAt).toBeInstanceOf(Date);
  });

  it('leaves welcomeSentAt empty and still returns the member when no notice channel delivered', async () => {
    noticeMock.mockResolvedValue({ email: false, sms: false });
    const member = await createMember(INPUT, 'admin-1');
    expect(member.status).toBe('ACTIVE');
    expect(prismaMock.member.update).not.toHaveBeenCalled();
    expect(member.welcomeSentAt ?? null).toBeNull();
  });

  it('409 names the field that is already taken', async () => {
    prismaMock.user.findFirst.mockResolvedValueOnce({ id: 'x' }).mockResolvedValueOnce(null);
    await expect(createMember(INPUT, 'admin-1')).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { fields: { ownerEmail: expect.any(String) } },
    });
    expect(prismaMock.member.create).not.toHaveBeenCalled();
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(noticeMock).not.toHaveBeenCalled();
  });

  it('409 names the mobile field when only the mobile number is taken', async () => {
    prismaMock.user.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'x' });
    const err = await createMember(INPUT, 'admin-1').catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'CONFLICT', details: { fields: { ownerMobile: expect.any(String) } } });
    expect((err as { details: { fields: Record<string, string> } }).details.fields).not.toHaveProperty('ownerEmail');
    expect((err as Error).message).not.toContain(INPUT.ownerMobile);
  });

  it('maps a unique-constraint race on the owner phone to a field-specific 409', async () => {
    const { Prisma } = await import('../generated/prisma-client');
    prismaMock.user.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['phone'] },
      }),
    );
    await expect(createMember(INPUT, 'admin-1')).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { fields: { ownerMobile: expect.any(String) } },
    });
    expect(noticeMock).not.toHaveBeenCalled();
  });
});
