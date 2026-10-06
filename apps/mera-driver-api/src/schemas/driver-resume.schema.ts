import { z } from 'zod';

const text = z.string().trim().max(160);
export function resumeDate(value: string): boolean {
  if (!/^\d{4}-\d{2}(?:-\d{2})?$/.test(value)) return false;
  const full = value.length === 7 ? `${value}-01` : value;
  const date = new Date(`${full}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === full;
}
const date = z.string().refine(v => v === '' || resumeDate(v), 'Use a real YYYY-MM or YYYY-MM-DD date');
const experience = z.object({
  jobTitle: text.min(1), employer: text.min(1), location: text.default(''),
  startDate: date.default(''), endDate: date.default(''), current: z.boolean().default(false),
  responsibilities: z.array(z.string().trim().min(1).max(240)).max(6).default([]),
}).strict().superRefine((entry, ctx) => {
  if (entry.current && entry.endDate) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'Current employment must not have an end date' });
  if (entry.startDate && entry.endDate && entry.startDate.slice(0, 7) > entry.endDate.slice(0, 7)) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End date must be after the start date' });
  if (entry.startDate && entry.endDate && entry.startDate.length === entry.endDate.length && entry.startDate > entry.endDate) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End date must be after the start date' });
});
export const ResumeProfileSchema = z.object({
  summary: z.string().trim().max(700).default(''),
  workExperience: z.array(experience).max(6).default([]),
  keySkills: z.array(text.min(1)).max(12).default([]),
  transmissionSkills: z.array(z.enum(['Manual', 'Automatic'])).max(2).default([]),
  education: z.object({ institution: text.default(''), location: text.default(''), year: z.string().regex(/^(?:\d{4})?$/).default('') }).strict().default({institution:'',location:'',year:''}),
  availability: z.string().trim().max(180).default(''),
  servicePreferences: z.array(z.enum(['Local', 'Outstation', 'Long-term'])).max(3).default([]),
  sharePhone: z.boolean().default(true), shareEmail: z.boolean().default(true),
}).strict();
export const UpdateResumeSchema = z.object({ profile: ResumeProfileSchema, revision: z.string().length(64), reason: z.string().trim().min(3).max(500) }).strict();
export type ResumeProfile = z.infer<typeof ResumeProfileSchema>;
