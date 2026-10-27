import { prisma } from '../lib/prisma'; // apne path ke hisaab se adjust karein
import type { ContactMessageInput } from '../schemas/contact.schema';

export async function createContactMessage(input: ContactMessageInput) {
  const phone = input.phone?.trim() ? input.phone.trim() : null;

  return prisma.contactMessage.create({
    data: {
      name: input.name,
      email: input.email,
      phone,
      subject: input.subject,
      message: input.message,
    },
    select: {
      id: true,
      createdAt: true,
    },
  });
}