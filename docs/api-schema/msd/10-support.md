# 10 — Support: Tickets, FAQ, Contact

Consumer + partner support tickets with a message thread, an FAQ store for the Help
Center page, and the public contact form.

## Entities

### SupportTicket

| Field | Type | Required | Default | Description | Example |
|-------|------|----------|---------|-------------|---------|
| `id` | uuid | ✔ | | | |
| `ticketNumber` | string | ✔ | | Human-readable | `"SUP-2026-01847"` |
| `userId` | uuid | ✔ | | Requester (consumer or partner) | |
| `category` | enum | ✔ | | `booking \| payment \| refund \| account \| partner \| deal_content \| technical \| other` | |
| `subject` | string | ✔ | | ≤120 chars | |
| `orderId` | uuid | | null | Linked order (booking/payment/refund tickets) | |
| `orderItemId` | uuid | | null | | |
| `companyId` | uuid | | null | Set for partner tickets | |
| `priority` | enum | ✔ | `normal` | `low \| normal \| high \| urgent` — staff-set, not requester | |
| `status` | enum | ✔ | `open` | `open \| in_progress \| waiting_on_customer \| resolved \| closed` | |
| `assignedToUserId` | uuid | | null | Staff assignee | |
| `resolvedAt` / `closedAt` | timestamp | | | Auto-close 7 days after resolved | |
| `createdAt` / `updatedAt` | timestamp | ✔ | | | |

### TicketMessage (1..n per ticket)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | uuid | ✔ | |
| `ticketId` | uuid | ✔ | |
| `authorUserId` | uuid | ✔ | Requester or staff |
| `authorKind` | enum | ✔ | `customer \| staff \| system` (system = status-change notes) |
| `body` | text | ✔ | ≤5000 chars |
| `attachments` | MediaAsset[] | | Max 5, images/PDF |
| `isInternalNote` | bool | ✔ | Staff-only notes, never sent to requester |
| `createdAt` | timestamp | ✔ | |

### FaqEntry

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | uuid | ✔ | |
| `section` | string | ✔ | `"Bookings"`, `"Payments & Refunds"`, `"For Partners"` |
| `question` | string | ✔ | |
| `answer` | text | ✔ | Markdown allowed |
| `sortOrder` | int | ✔ | |
| `isPublished` | bool | ✔ | |

### ContactSubmission (public form, pre-auth)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | uuid | ✔ | |
| `name` | string | ✔ | |
| `email` | string | ✔ | |
| `phone` | string | | |
| `topic` | enum | ✔ | `general \| partnership \| press \| feedback` |
| `message` | text | ✔ | ≤2000 |
| `status` | enum | ✔ | `new \| handled` |

Rate-limited + honeypot field; staff can convert one into a ticket.

## Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/faq` | public | Published entries grouped by section (cached) |
| POST | `/contact` | public | Contact form submission |
| POST | `/me/tickets` | user | Create `{ category, subject, body, orderId?, orderItemId?, mediaIds? }` |
| GET | `/me/tickets` | user | My tickets (`?status=`) |
| GET | `/me/tickets/:id` | user | Ticket + thread (internal notes excluded) |
| POST | `/me/tickets/:id/messages` | user | Reply (reopens `waiting_on_customer` → `in_progress`) |
| POST | `/me/tickets/:id/close` | user | Requester closes own ticket |
| GET | `/admin/tickets` | admin, sales, marketing | Queue: filter status/category/assignee/priority |
| PATCH | `/admin/tickets/:id` | staff | Assign, set priority, change status |
| POST | `/admin/tickets/:id/messages` | staff | Reply or internal note |
| CRUD | `/admin/faq` | admin, marketing | FAQ management |
| GET | `/admin/contact-submissions` | staff | Inbox |

Notifications: requester gets email on staff reply and status change (Resend);
transactional only — independent of marketing preferences.

## Zod schemas

`TicketCreateSchema`, `TicketResponseSchema`, `TicketMessageCreateSchema`,
`TicketMessageResponseSchema`, `TicketAdminUpdateSchema`, `FaqEntrySchema`,
`ContactSubmissionSchema`.

## Open questions

- [ ] SLA targets per priority (affects sorting/escalation fields)?
- [ ] Do partners need a separate ticket category set / dedicated queue for payout disputes?
