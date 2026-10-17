# Member document reminders and suspension review flag

Status: **approved and built** (2026-10-17). Decisions in section 8 are final; section 11 records where the build differs from the draft.
Tasks covered: P6-01 to P6-05, P6-07, the reminder part of P6-08, P10-18 (reminders in Activity), P10-19 (flag set for real).
Business rules: `docs/msd/ADMIN_USER_ROLES_AND_PERMISSIONS.md` section 4. Technical design: `docs/msd/ADMIN_RBAC_MASTER_PLAN.md` S7, D4, D14.

## 1. What exists today

| Piece | State |
|---|---|
| `Member.documentsDueAt` set to created + 14 days | Built |
| `Member.reviewFlaggedAt` column, list filter `reviewFlag=true`, red badge and prefilled reason on the detail page | Built and tested |
| Flag cleared when an admin reactivates the member | Built and tested |
| Anything that **sends warnings** or **sets the flag** | Missing. The Review filter always shows 0 members. |

## 2. Timeline

Day 0 is the day the member is created. `due` = `documentsDueAt` (day 14).

| Day | Event |
|---|---|
| 14 (`due`) | Warning 1 by email and SMS, listing the exact missing documents |
| 21 (`due` + 7) | Warning 2 |
| 28 (`due` + 14) | Warning 3, the final warning; says an admin may now suspend the account |
| **28 or 35** | `reviewFlaggedAt` set. **Decision D4**, see section 8 |
| Any later day | Super Admin or Admin decides. The system never suspends. |

Rules:

- Only members with status `ACTIVE` or `INACTIVE` get warnings. `SUSPENDED` and `ARCHIVED` are skipped.
- A member whose documents are complete gets nothing. "Complete" reuses `documentsSummary()` (all three types SUBMITTED or APPROVED).
- Warnings stay at least 7 days apart even if the job missed a day: the job sends only the **next** warning in the sequence, never two at once.
- Each warning lists the documents missing **on the day it is sent**, and the record stores that list.

## 3. Database (needs approval)

One new table, one new enum, one new enum value. Migration with `down.sql`, as in `20261015100000_member_lifecycle`.

```prisma
model MemberDocumentReminder {
  id           String                 @id @default(uuid())
  memberId     String
  /// 1, 2 or 3. Warning 3 is the final one.
  sequence     Int
  channel      ReminderChannel
  missingTypes VendorDocumentType[]
  status       ReminderStatus         @default(FAILED)
  attempts     Int                    @default(0)
  sentAt       DateTime?
  createdAt    DateTime               @default(now())
  updatedAt    DateTime               @updatedAt
  member       Member                 @relation(fields: [memberId], references: [id], onDelete: Cascade)

  /// One row per warning per channel: a second run updates the row instead of sending again.
  @@unique([memberId, sequence, channel])
  @@index([status])
}

enum ReminderChannel { EMAIL SMS }
enum ReminderStatus  { SENT FAILED }
```

- `Member` gets the back relation `documentReminders MemberDocumentReminder[]` (no new column).
- Optional (decision 3): `NotificationType` gets `MEMBER_REVIEW_FLAGGED` for an in-app bell item to admins.
- Depends on `20261015100000_member_lifecycle` being applied first. That migration still waits for the P10-45 sign-off.

## 4. API (needs approval)

| Method and path | Guard | Purpose |
|---|---|---|
| `POST /api/v1/internal/jobs/document-reminders` | `x-cron-secret` header, timing-safe compare with env `CRON_SECRET` | Runs one pass. Returns `{ checked, sent, failed, flagged, cleared }`. Hidden from `/docs`. 503 when `CRON_SECRET` is not set. |
| `GET /api/v1/members/:id/activity` (exists) | `members:view` (unchanged) | Adds `kind: 'reminder'` items: "Warning 2 of 3 sent by email" plus the missing documents |

No other new route. The manual "remind now" button (P6-06) stays out of scope unless decision 4 says otherwise.

## 5. Job logic (one pass)

1. Take a Postgres advisory lock (`pg_try_advisory_xact_lock`). If another run holds it, return `{ skipped: true }`. No lock table.
2. Load candidates: status `ACTIVE`/`INACTIVE`, `documentsDueAt <= now`, with their documents and reminder rows. Page through in batches of 200.
3. Per member:
   - Documents complete: send nothing. If `reviewFlaggedAt` is set, clear it (decision 2) and count `cleared`.
   - Next sequence `n` = highest SENT sequence + 1 (max 3). Send when `now >= due + (n - 1) * 7 days` and the previous warning was sent at least 7 days ago.
   - Send by email and SMS (whichever exist) through `sendMemberNotice('DOCUMENTS_REMINDER', ...)`. Upsert one row per channel: SENT with `sentAt`, or FAILED with `attempts + 1`.
   - FAILED rows from earlier runs are retried first (max 5 attempts, then left FAILED and logged).
   - Flag: when warning 3 is SENT on at least one channel and the D4 day is reached, set `reviewFlaggedAt = now` if it is null. Write an `AuditLog` row `member.review.flagged`. Status never changes.
4. A provider failure never stops the pass. Every member is handled in its own try/catch.

Constants (`REMINDER_INTERVAL_DAYS = 7`, `REMINDER_COUNT = 3`, `REVIEW_FLAG_AFTER_DAYS`, `MAX_SEND_ATTEMPTS = 5`) live in one file, `services/member-reminder-policy.ts`. The existing `DOCUMENTS_DUE_MS` (14 days, now in `vendor.service.ts`) moves there too, so the whole timeline has one source.

## 6. Messages

- New `documentsReminderMessage(sequence, missing, dueAt)` in `lib/member-messages.ts`, reusing `contactLine()` and `MEMBER_DOCUMENT_LABEL`-style names. Warning 3 adds: "If they are not received, an admin may suspend your account."
- `MemberNoticeKind` gains `'DOCUMENTS_REMINDER'`. The existing sender, providers and inline retry are reused.
- Production blocker (P10-43): the 3 SMS texts need DLT-approved templates before go-live.

## 7. Frontend (msd)

- Activity tab: render `reminder` items with the existing activity list (no new component).
- Nothing else changes: the Review filter, badge and prefilled reason already read `reviewFlaggedAt`.
- Copy for reminder items follows the existing activity summary pattern.

## 8. Decisions needed before development

| # | Question | Options | Recommendation |
|---|---|---|---|
| 1 (D4) | When is the member flagged? | **Day 28**, right after warning 3 (roles doc section 4) / **Day 35**, one week after warning 3 (master plan D4) | **Decided: day 35** |
| 2 | Clear the flag when documents become complete? | Yes / No (only reactivation clears it) | **Decided: yes** |
| 3 | Tell admins in-app when a member is flagged? | Yes (new enum value, bell item) / No (filter only) | **Decided: yes**, to every user whose roles grant `members:status_change` |
| 4 | Manual "remind now" button (P6-06) in this slice? | Now / Later | **Decided: now** |
| 5 | Daily run time | 10:00 IST (04:30 UTC) | **Decided: 10:00 IST** |

## 9. Ops

- New env `CRON_SECRET` (32+ chars) on Railway staging and production; add to `.env.example` and `DEPLOYMENT.md`.
- Railway cron service, daily, runs: `curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" "$API_URL/api/v1/internal/jobs/document-reminders"`. Non-2xx exits non-zero so Railway marks the run failed (P6-07 alert).

## 10. Tests

- Policy (pure, fake clock): next sequence, 7-day spacing, catch-up after a missed day sends one warning only, flag day for D4, no warning for complete or suspended members.
- Job service: double run sends once (unique row), FAILED row retried then capped, flag set once with audit row, flag cleared when complete (if decision 2), provider error on one member does not stop the others.
- Route: 401 without or with a wrong secret, 503 when unset, 200 summary; route absent from the OpenAPI document.
- Messages: missing list and final-warning sentence.
- Activity: reminder items appear in order with their channel.
- msd Activity tab: reminder item renders.

## 11. As built (differences from the draft)

- **One row per reminder, not per channel.** `MemberDocumentReminder` holds `emailStatus` and `smsStatus` (`PENDING`, `SENT`, `FAILED`, or null when there is no address), so a warning or a manual send is one Activity item. `@@unique([memberId, sequence])`; manual rows have `sequence = null` and `sentByUserId`, and Postgres treats nulls as distinct.
- **No advisory lock.** Each run claims a row with a conditional update on `attempts`, and a parallel run that creates the same warning hits the unique index (P2002) and skips it. Two runs never send one warning twice.
- **No audit row for the automatic flag.** `AuditLog.actorUserId` must be a real user. The flag shows in the member's Activity ("Flagged as ready for suspension review") and in the admins' bell. Manual reminders write `member.reminder.sent` with the admin as actor.
- **Remind now** (`POST /members/:id/documents/reminders`, `members:status_change`): once per 24 hours per member (429), only for active or inactive members with documents still needed and an email or phone on record (409). The button sits in the member header next to the status actions.
- **Retries:** a channel is retried on later runs until `MAX_SEND_ATTEMPTS` (5). A warning that never reached the member is not counted as sent, so the timeline waits for it.
- **Reactivation:** clearing the flag on reactivation stays as before. If documents are still incomplete and the final warning is more than a week old, the next run sets the flag again.
- Timeline numbers live in `apps/msd-api/src/services/member-reminder-policy.ts` (the 14-day due date moved there from `vendor.service.ts`).
