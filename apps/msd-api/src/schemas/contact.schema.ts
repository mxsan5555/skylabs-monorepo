import { z } from 'zod';

export const contactMessageSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    email: z.string().trim().email('Invalid email').max(255),
    phone: z
      .string()
      .trim()
      .max(20)
      .optional()
      .or(z.literal('')),
    subject: z.string().trim().min(1, 'Subject is required').max(200),
    message: z.string().trim().min(1, 'Message is required').max(5000),
  })
  .strict(); // reject unknown fields

export type ContactMessageInput = z.infer<typeof contactMessageSchema>;