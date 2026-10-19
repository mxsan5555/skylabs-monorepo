import { prisma } from '../lib/prisma';

export async function getStatusHistory(memberId: string) {
  const rows = await prisma.memberStatusHistory.findMany({
    where: { memberId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const actorIds = [...new Set(rows.map((r) => r.actorUserId).filter((id): id is string => Boolean(id)))];
  const actors =
    actorIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
      : [];
  const nameById = new Map(actors.map((a) => [a.id, a.name]));
  return rows.map((r) => ({
    id: r.id,
    fromStatus: r.fromStatus,
    toStatus: r.toStatus,
    reason: r.reason,
    actorUserId: r.actorUserId,
    actorName: r.actorUserId ? (nameById.get(r.actorUserId) ?? null) : null,
    createdAt: r.createdAt,
  }));
}

export interface ActivityItem {
  kind: 'status' | 'document';
  at: Date;
  summary: string;
  detail: string | null;
}

export async function getMemberActivity(memberId: string): Promise<ActivityItem[]> {
  const [history, docs] = await Promise.all([
    getStatusHistory(memberId),
    prisma.memberDocument.findMany({
      where: { vendorId: memberId },
      select: {
        documentType: true,
        status: true,
        createdAt: true,
        reviewedAt: true,
        rejectionReason: true,
        uploadedOnBehalf: true,
      },
    }),
  ]);

  const items: ActivityItem[] = history.map((h) => ({
    kind: 'status',
    at: h.createdAt,
    summary: `Status changed from ${h.fromStatus} to ${h.toStatus}${h.actorName ? ` by ${h.actorName}` : ''}`,
    detail: h.reason,
  }));

  for (const d of docs) {
    items.push({
      kind: 'document',
      at: d.createdAt,
      summary: `${d.documentType} document uploaded${d.uploadedOnBehalf ? ' by staff for the member' : ''}`,
      detail: null,
    });
    if (d.reviewedAt) {
      items.push({
        kind: 'document',
        at: d.reviewedAt,
        summary: `${d.documentType} document ${d.status === 'APPROVED' ? 'approved' : 'rejected'}`,
        detail: d.rejectionReason,
      });
    }
  }
  return items.sort((a, b) => b.at.getTime() - a.at.getTime());
}
