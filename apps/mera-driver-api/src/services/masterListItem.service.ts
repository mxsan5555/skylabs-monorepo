import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errorHandler';

export async function listMasterListItems(category: string) {
  return prisma.masterListItem.findMany({ where: { category }, orderBy: { createdAt: 'asc' }, take: 1000 });
}

export async function getMasterListItemById(category: string, id: string) {
  const row = await prisma.masterListItem.findFirst({ where: { id, category } });
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Master list item not found');
  return row;
}

export async function createMasterListItem(category: string, input: { name: string; status?: string }) {
  return prisma.masterListItem.create({ data: { category, name: input.name, status: input.status } });
}

export async function updateMasterListItem(category: string, id: string, input: { name?: string; status?: string }) {
  await getMasterListItemById(category, id);
  return prisma.masterListItem.update({ where: { id }, data: input });
}

export async function deleteMasterListItem(category: string, id: string) {
  await getMasterListItemById(category, id);
  await prisma.masterListItem.delete({ where: { id } });
}
