import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma-client';
import { notFound } from '../../lib/api-error';
import { requireAuth, type AuthedRequest } from '../../middleware/require-auth';
import { requireRole } from '../../middleware/require-role';
import { UserRole } from '../../generated/prisma';

const contactSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  phone: z.string().optional(),
  topic: z.enum(['GENERAL', 'PARTNERSHIP', 'PRESS', 'FEEDBACK']),
  message: z.string().min(1).max(2000),
  honeypot: z.string().max(0).optional(), // must stay empty — bots fill every field
});

const ticketCreateSchema = z.object({
  category: z.enum(['BOOKING', 'PAYMENT', 'REFUND', 'ACCOUNT', 'PARTNER', 'DEAL_CONTENT', 'TECHNICAL', 'OTHER']),
  subject: z.string().min(1).max(120),
  body: z.string().min(1).max(5000),
  orderId: z.string().optional(),
  orderItemId: z.string().optional(),
});
const messageCreateSchema = z.object({
  body: z.string().min(1).max(5000),
  isInternalNote: z.boolean().default(false),
});
const adminTicketUpdateSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  assignedToUserId: z.string().optional(),
});
const faqCreateSchema = z.object({
  section: z.string().min(1),
  question: z.string().min(1),
  answer: z.string().min(1),
  sortOrder: z.number().int().default(0),
  isPublished: z.boolean().default(true),
});
const faqUpdateSchema = faqCreateSchema.partial();

function randomTicketNumber(): string {
  const year = new Date().getFullYear();
  const suffix = Math.floor(10000 + Math.random() * 90000);
  return `SUP-${year}-${suffix}`;
}

export const publicSupportRouter = Router();

publicSupportRouter.get('/faq', async (_req, res, next) => {
  try {
    const entries = await prisma.faqEntry.findMany({ where: { isPublished: true }, orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }] });
    const bySection = new Map<string, typeof entries>();
    for (const entry of entries) bySection.set(entry.section, [...(bySection.get(entry.section) ?? []), entry]);
    res.json({ sections: Array.from(bySection.entries()).map(([section, items]) => ({ section, items })) });
  } catch (err) {
    next(err);
  }
});

publicSupportRouter.post('/contact', async (req, res, next) => {
  try {
    const input = contactSchema.parse(req.body);
    const submission = await prisma.contactSubmission.create({
      data: { name: input.name, email: input.email, phone: input.phone, topic: input.topic, message: input.message },
    });
    res.status(201).json({ id: submission.id, status: submission.status });
  } catch (err) {
    next(err);
  }
});

export const meTicketsRouter = Router();

meTicketsRouter.post('/tickets', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = ticketCreateSchema.parse(req.body);
    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber: randomTicketNumber(),
        userId: req.auth!.id,
        category: input.category,
        subject: input.subject,
        orderId: input.orderId,
        orderItemId: input.orderItemId,
        messages: { create: [{ authorUserId: req.auth!.id, authorKind: 'CUSTOMER', body: input.body }] },
      },
      include: { messages: true },
    });
    res.status(201).json(ticket);
  } catch (err) {
    next(err);
  }
});

meTicketsRouter.get('/tickets', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : undefined;
    const tickets = await prisma.supportTicket.findMany({
      where: { userId: req.auth!.id, ...(status ? { status: status as never } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items: tickets });
  } catch (err) {
    next(err);
  }
});

meTicketsRouter.get('/tickets/:id', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const ticket = await prisma.supportTicket.findFirst({
      where: { id: req.params.id, userId: req.auth!.id },
      include: { messages: { where: { isInternalNote: false }, orderBy: { createdAt: 'asc' } } },
    });
    if (!ticket) throw notFound('ticket_not_found');
    res.json(ticket);
  } catch (err) {
    next(err);
  }
});

meTicketsRouter.post('/tickets/:id/messages', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { body } = messageCreateSchema.pick({ body: true }).parse(req.body);
    const ticket = await prisma.supportTicket.findFirst({ where: { id: req.params.id, userId: req.auth!.id } });
    if (!ticket) throw notFound('ticket_not_found');
    const message = await prisma.ticketMessage.create({
      data: { ticketId: ticket.id, authorUserId: req.auth!.id, authorKind: 'CUSTOMER', body },
    });
    if (ticket.status === 'WAITING_ON_CUSTOMER') {
      await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: 'IN_PROGRESS' } });
    }
    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
});

meTicketsRouter.post('/tickets/:id/close', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const ticket = await prisma.supportTicket.findFirst({ where: { id: req.params.id, userId: req.auth!.id } });
    if (!ticket) throw notFound('ticket_not_found');
    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export const adminSupportRouter = Router();
const staffRoles = [UserRole.ADMIN, UserRole.SALES, UserRole.MARKETING];

adminSupportRouter.get('/admin/tickets', requireAuth, requireRole(staffRoles), async (req, res, next) => {
  try {
    const { status, category, assignedToUserId, priority } = req.query;
    const where: Record<string, unknown> = {};
    if (typeof status === 'string') where.status = status.toUpperCase();
    if (typeof category === 'string') where.category = category.toUpperCase();
    if (typeof assignedToUserId === 'string') where.assignedToUserId = assignedToUserId;
    if (typeof priority === 'string') where.priority = priority.toUpperCase();
    const tickets = await prisma.supportTicket.findMany({ where: where as never, orderBy: { createdAt: 'desc' } });
    res.json({ items: tickets });
  } catch (err) {
    next(err);
  }
});

adminSupportRouter.patch('/admin/tickets/:id', requireAuth, requireRole(staffRoles), async (req, res, next) => {
  try {
    const input = adminTicketUpdateSchema.parse(req.body);
    const existing = await prisma.supportTicket.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('ticket_not_found');
    const ticket = await prisma.supportTicket.update({
      where: { id: existing.id },
      data: {
        ...input,
        resolvedAt: input.status === 'RESOLVED' ? new Date() : undefined,
        closedAt: input.status === 'CLOSED' ? new Date() : undefined,
      },
    });
    res.json(ticket);
  } catch (err) {
    next(err);
  }
});

adminSupportRouter.post('/admin/tickets/:id/messages', requireAuth, requireRole(staffRoles), async (req: AuthedRequest, res, next) => {
  try {
    const input = messageCreateSchema.parse(req.body);
    const ticket = await prisma.supportTicket.findUnique({ where: { id: req.params.id } });
    if (!ticket) throw notFound('ticket_not_found');
    const message = await prisma.ticketMessage.create({
      data: { ticketId: ticket.id, authorUserId: req.auth!.id, authorKind: 'STAFF', body: input.body, isInternalNote: input.isInternalNote },
    });
    if (!input.isInternalNote && ticket.status === 'OPEN') {
      await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: 'WAITING_ON_CUSTOMER' } });
    }
    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
});

adminSupportRouter.get('/admin/faq', requireAuth, requireRole([UserRole.ADMIN, UserRole.MARKETING]), async (_req, res, next) => {
  try {
    const items = await prisma.faqEntry.findMany({ orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }] });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

adminSupportRouter.post('/admin/faq', requireAuth, requireRole([UserRole.ADMIN, UserRole.MARKETING]), async (req, res, next) => {
  try {
    const input = faqCreateSchema.parse(req.body);
    const entry = await prisma.faqEntry.create({ data: input });
    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
});

adminSupportRouter.patch('/admin/faq/:id', requireAuth, requireRole([UserRole.ADMIN, UserRole.MARKETING]), async (req, res, next) => {
  try {
    const input = faqUpdateSchema.parse(req.body);
    const existing = await prisma.faqEntry.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('faq_not_found');
    const entry = await prisma.faqEntry.update({ where: { id: existing.id }, data: input });
    res.json(entry);
  } catch (err) {
    next(err);
  }
});

adminSupportRouter.delete('/admin/faq/:id', requireAuth, requireRole([UserRole.ADMIN, UserRole.MARKETING]), async (req, res, next) => {
  try {
    const existing = await prisma.faqEntry.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('faq_not_found');
    await prisma.faqEntry.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

adminSupportRouter.get('/admin/contact-submissions', requireAuth, requireRole(staffRoles), async (_req, res, next) => {
  try {
    const items = await prisma.contactSubmission.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});
