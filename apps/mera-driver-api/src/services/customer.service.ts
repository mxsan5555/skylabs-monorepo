import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errorHandler';

export async function listCustomers() {
  return prisma.customer.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 });
}

export async function getCustomerById(id: string) {
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) throw new HttpError(404, 'NOT_FOUND', 'Customer not found');
  return customer;
}

export async function createCustomer(input: Record<string, unknown>) {
  return prisma.customer.create({ data: input as never });
}

export async function updateCustomer(id: string, input: Record<string, unknown>) {
  await getCustomerById(id);
  return prisma.customer.update({ where: { id }, data: input as never });
}

export async function deleteCustomer(id: string) {
  await getCustomerById(id);
  await prisma.customer.delete({ where: { id } });
}
