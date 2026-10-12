import { z } from 'zod';

export const SupportRequestSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(1, 'Subject is required')
    .max(200, 'Subject must not exceed 200 characters'),

  message: z
    .string()
    .trim()
    .min(1, 'Message is required')
    .max(5000, 'Message must not exceed 5000 characters'),
});

export type SupportRequestInput = z.infer<typeof SupportRequestSchema>;