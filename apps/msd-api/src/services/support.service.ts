import { prisma } from '../lib/prisma';
import type { SupportRequestInput } from '../schemas/support.schema';

export async function createSupportRequest(
  customerId: string,
  input: SupportRequestInput,
) {
  return prisma.supportRequest.create({
    data: {
      customerId,
      subject: input.subject,
      message: input.message,
    },
    select: {
      id: true,
      subject: true,
      message: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}