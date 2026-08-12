import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';

export async function listDashboardWidgets() {
  return prisma.dashboardWidget.findMany({ orderBy: { createdAt: 'asc' } });
}

export async function createDashboardWidget(input: {
  key: string;
  title: string;
  module: string;
  description?: string;
}) {
  const existing = await prisma.dashboardWidget.findUnique({ where: { key: input.key } });
  if (existing) throw new ApiError('CONFLICT', `Widget key "${input.key}" already exists`);
  return prisma.dashboardWidget.create({ data: input });
}
