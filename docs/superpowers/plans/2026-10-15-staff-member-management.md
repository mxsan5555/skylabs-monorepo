# Staff Member Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the staff member screens (list, add, detail), the `/members` API, `schema.prisma` and `seed.ts` follow the member lifecycle in `docs/msd/ADMIN_USER_ROLES_AND_PERMISSIONS.md`.

**Architecture:** Backend first. An expand migration renames the `Vendor` model to `Member` (same table), swaps `VendorStatus` for `MemberStatus`, and adds document review fields and a status history table. A pure status machine plus a status service drive every transition. `authenticate` and the login and OTP paths enforce Inactive (read only) and Suspended (blocked). Then the three screens are rebuilt on the new API.

**Tech Stack:** Express + TypeScript + Prisma 6.19.3 + Zod + zod-to-openapi (msd-api); React 19 + Vite + Vitest + shared-ui `sky-*` components (msd); Nx 22.

**Spec:** `docs/superpowers/specs/2026-10-15-staff-member-management-design.md`

---

## Rules every task follows

- Work on the current branch `feature/all-member-matrix-sandeep-5oct26`. Do not create branches.
- **Never run** `git stash`, `git reset`, `git checkout -- <file>`, `git restore`, `git clean`, `git apply`, `git worktree`. Read old files with `git show <rev>:<path>`.
- **Commits:** the main agent only. Subagents never commit. Before each commit, show the exact one-line message and the staged file list and wait for a yes. Format `type(scope): Title`, no body, no AI attribution. Stage only the files the task names.
- No em dashes in code comments, docs or copy. Active voice.
- Run single backend tests with `cd apps/msd-api && npx vitest run <path relative to apps/msd-api>`. Run single frontend tests with `cd apps/msd && npx vitest run <path relative to apps/msd>`.
- Known failing tests that must not grow: msd `app.spec.tsx` (1), `otp.test.tsx` (2).
- No Postgres is available: use `npx prisma validate`, `npx prisma generate`, `tsc`, lint and mocked unit tests. Migrations are verified in Task 17.

## Deviations from the spec (decided while planning, record them in Task 18)

1. Support contact comes from env vars `SUPPORT_EMAIL` and `SUPPORT_PHONE`, not `SystemSetting` keys. The `SystemSetting` table is task P8-02, outside this slice.
2. A failed notice is retried once inline. A durable retry queue arrives with the reminder cron slice.
3. Role Member keeps `members:custom` plus the `vendor-portal.*` keys. The matrix row "Member: own VE" needs own-scope enforcement (P2), so granting `members:view` now would expose the admin list. The own-scope slice replaces `custom`.
4. Public registration (`POST /vendors/public/register`) returns 403 with a "contact our team" message. Members are created by staff only (decision D9). The `/become-vendor` page stays and shows that message.

## File map

**Backend create**
- `apps/msd-api/src/lib/role-keys.ts` role key constants
- `apps/msd-api/src/lib/member-messages.ts` suspended and read-only message text
- `apps/msd-api/src/lib/document-number.ts` PAN, GST, Aadhaar validation and masking
- `apps/msd-api/src/lib/field-crypto.ts` AES-256-GCM and HMAC helpers
- `apps/msd-api/src/lib/deprecation.ts` `Deprecation` header middleware
- `apps/msd-api/src/services/member-status-machine.ts` pure transition table
- `apps/msd-api/src/services/member-access.service.ts` cached member access state
- `apps/msd-api/src/services/member-notice.service.ts` email and SMS notices
- `apps/msd-api/src/services/member-status.service.ts` change status, delete or archive
- `apps/msd-api/src/services/member-document.service.ts` documents (replaces `vendor-document.service.ts`)
- `apps/msd-api/src/services/member-activity.service.ts` history and activity
- `apps/msd-api/src/routes/member-admin.routes.ts` the `/members` handlers
- `apps/msd-api/src/routes/members.routes.ts` router mounted at `/members`
- `apps/msd-api/prisma/migrations/20261015100000_member_lifecycle/migration.sql` and `down.sql`
- `apps/msd-api/prisma/member-status-report.ts` read-only backfill report

**Backend modify**: `schema.prisma`, `seed.ts`, `http.ts`, `env.ts`, `authenticate.ts`, `auth.service.ts`, `otp.service.ts`, `vendor.service.ts`, `vendors.routes.ts`, `vendor-public.routes.ts`, `vendor.schema.ts`, `catalog.service.ts`, `bootstrap.service.ts`, `app.ts`, `registry.ts`, `prisma-mock.ts`, `smtp.provider.ts`, `connectExpress.provider.ts`, `msd-menu.json`, `shared-types/src/index.ts`.

**Frontend** (after `git mv` the folder is `apps/msd/src/app/pages/account/members/`)
- Create: `api/rbac/members.ts`, `members/member-status.ts`, `members/member-list.tsx` (renamed from `vendor-list.tsx`), `members/member-new-page.tsx`, `members/member-detail-page.tsx`, `members/member-header-actions.tsx`, `members/member-documents-tab.tsx`, `members/member-activity-tab.tsx`
- Modify: `routes.tsx`, `vendors.tsx` (to `members.tsx`), `api/rbac/vendors.ts`, `api/rbac/client.ts`, `layouts/admin-layout.tsx`
- Delete: `vendor-pipeline.tsx`, `vendor-wizard-*.tsx`, `vendor-setup.ts`, `vendor-detail-customers.tsx`, `vendor-detail-orders.tsx` and their tests

---

## PART A: BACKEND

### Task 1: Error codes, env vars, role key constants

**Files:**
- Modify: `apps/msd-api/src/lib/http.ts`, `apps/msd-api/src/config/env.ts`
- Create: `apps/msd-api/src/lib/role-keys.ts`, `apps/msd-api/src/lib/role-keys.test.ts`

- [ ] **Step 1: Write the failing test** `apps/msd-api/src/lib/role-keys.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { ROLE_KEYS, MEMBER_ROLE_KEYS } from './role-keys';

describe('role keys', () => {
  it('names the seven system roles', () => {
    expect(Object.values(ROLE_KEYS).sort()).toEqual(
      ['admin', 'customer', 'marketing', 'member', 'sales', 'super_admin', 'support'].sort(),
    );
  });

  it('treats the pre-rename key `vendor` as a member while old tokens are still alive', () => {
    expect(MEMBER_ROLE_KEYS).toContain('member');
    expect(MEMBER_ROLE_KEYS).toContain('vendor');
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** (`Cannot find module './role-keys'`)

Run: `cd apps/msd-api && npx vitest run src/lib/role-keys.test.ts`

- [ ] **Step 3: Create `apps/msd-api/src/lib/role-keys.ts`**

```ts
/** The seven fixed system roles. One definition, so no service compares a role-key literal. */
export const ROLE_KEYS = {
  superAdmin: 'super_admin',
  admin: 'admin',
  marketing: 'marketing',
  sales: 'sales',
  member: 'member',
  support: 'support',
  customer: 'customer',
} as const;

/**
 * Role keys that mean "this user owns a member business". `vendor` is the pre-rename key:
 * access tokens issued before the rename migration still carry it for up to one token TTL.
 */
export const MEMBER_ROLE_KEYS: readonly string[] = [ROLE_KEYS.member, 'vendor'];
```

- [ ] **Step 4: Add error codes to `apps/msd-api/src/lib/http.ts`**

Replace the `ErrorCode` union and `STATUS_BY_CODE` map with:

```ts
export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'CONFLICT'
  | 'BAD_REQUEST'
  | 'MEMBER_SUSPENDED'
  | 'MEMBER_INACTIVE_READ_ONLY'
  | 'MEMBER_NOT_SUSPENDED'
  | 'DOCUMENT_NUMBER_IN_USE';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  MEMBER_SUSPENDED: 403,
  MEMBER_INACTIVE_READ_ONLY: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  MEMBER_NOT_SUSPENDED: 409,
  DOCUMENT_NUMBER_IN_USE: 409,
  VALIDATION_ERROR: 422,
  RATE_LIMITED: 429,
  SERVER_ERROR: 500,
};
```

- [ ] **Step 5: Add env vars in `apps/msd-api/src/config/env.ts`**

Directly after the line `googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',` add:

```ts
  /** Shown to a suspended member so they know how to get their account back. */
  supportEmail: process.env.SUPPORT_EMAIL ?? '',
  supportPhone: process.env.SUPPORT_PHONE ?? '',
  /** 32 bytes, base64. Encrypts full Aadhaar and PAN numbers at rest. Optional in development. */
  fieldEncryptionKey: process.env.FIELD_ENCRYPTION_KEY ?? '',
  /** Secret mixed into the document number hash used for the duplicate check. */
  docHashPepper: process.env.DOC_HASH_PEPPER ?? '',
```

- [ ] **Step 6: Document the vars in `apps/msd-api/.env.example`** (append)

```
# Member lifecycle
SUPPORT_EMAIL=
SUPPORT_PHONE=
# 32 random bytes, base64: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
FIELD_ENCRYPTION_KEY=
DOC_HASH_PEPPER=
```

- [ ] **Step 7: Run test, expect PASS**, then `cd apps/msd-api && npx tsc -p tsconfig.app.json --noEmit` (expect no new errors)

- [ ] **Step 8: Commit** (main agent, after confirmation)

```bash
git add apps/msd-api/src/lib/http.ts apps/msd-api/src/config/env.ts apps/msd-api/src/lib/role-keys.ts apps/msd-api/src/lib/role-keys.test.ts apps/msd-api/.env.example
git commit -m "feat(msd-api): Add member error codes, env vars and role keys"
```

---

### Task 2: Schema, migration and backfill report

**Files:**
- Modify: `apps/msd-api/prisma/schema.prisma`
- Create: `apps/msd-api/prisma/migrations/20261015100000_member_lifecycle/migration.sql`, `.../down.sql`, `apps/msd-api/prisma/member-status-report.ts`

- [ ] **Step 1: Rename the model and relation types in `schema.prisma`**

Run this once from the repo root. It prints every changed line so you can eyeball it.

```bash
python - <<'EOF'
import re
p='apps/msd-api/prisma/schema.prisma'
s=open(p,encoding='utf-8').read()
s,n1=re.subn(r'(?m)^(\s+\w+\s+)Vendor(\?|\[\])?(\s|$)', r'\1Member\2\3', s)
s,n2=re.subn(r'(?m)^(\s+\w+\s+)VendorDocument(\?|\[\])?(\s|$)', r'\1MemberDocument\2\3', s)
s=s.replace('model Vendor {','model Member {',1).replace('model VendorDocument {','model MemberDocument {',1)
open(p,'w',encoding='utf-8').write(s)
print('relation type edits:',n1,'document relation edits:',n2)
EOF
git diff --stat apps/msd-api/prisma/schema.prisma
grep -n "Member\b" apps/msd-api/prisma/schema.prisma | head -40
```

Expected: the relation type lines on `Branch`, `Deal`, `Therapist`, `Product`, `Order`, `OrderItem`, `VendorImage`, `VendorVideo`, `VendorCategoryAccess`, `VendorDocument` (now `MemberDocument`) and `User.vendorProfile` all say `Member`.

- [ ] **Step 2: Edit the `Member` model**

Replace

```prisma
  status                     VendorStatus           @default(PROFILE_INCOMPLETE)
  /// Reason recorded on reject/suspend — never on approve/activate.
  statusReason               String?
```

with

```prisma
  status                     MemberStatus           @default(ACTIVE)
  /// Reason recorded on inactive, suspend and archive. Cleared when the member becomes ACTIVE.
  statusReason               String?
  statusChangedAt            DateTime?
  statusChangedByUserId      String?
  archivedAt                 DateTime?
  /// Documents are a follow-up, never a gate: due 14 days after the member is created.
  documentsDueAt             DateTime?
  /// Set by the reminder job after the final warning. Never suspends on its own.
  reviewFlaggedAt            DateTime?
  welcomeSentAt              DateTime?
  statusHistory              MemberStatusHistory[]
```

and replace the model's closing

```prisma
  @@index([status])
  @@index([ownerUserId])
}
```

with

```prisma
  @@index([status])
  @@index([ownerUserId])
  @@map("Vendor")
}
```

- [ ] **Step 3: Replace the `MemberDocument` model**

Replace the whole `model MemberDocument { ... }` block (it still has the old fields) with:

```prisma
model MemberDocument {
  id               String               @id @default(uuid())
  vendorId         String
  documentType     VendorDocumentType
  storageKey       String
  originalFilename String?
  mimeType         String
  sizeBytes        Int
  status           MemberDocumentStatus @default(SUBMITTED)
  /// `XXXX XXXX 1234` for Aadhaar, `ABXXXXX34F` for PAN, the number itself for GST.
  numberMasked     String?
  /// HMAC of type + number. Enforces one number per member, never returned by the API.
  numberHash       String?
  /// AES-256-GCM of the full number. Never returned by the API.
  numberEncrypted  String?
  rejectionReason  String?
  reviewedByUserId String?
  reviewedAt       DateTime?
  expiresAt        DateTime?
  uploadedByUserId String?
  uploadedOnBehalf Boolean              @default(false)
  createdAt        DateTime             @default(now())
  updatedAt        DateTime             @updatedAt
  vendor           Member               @relation(fields: [vendorId], references: [id], onDelete: Cascade)

  @@unique([vendorId, documentType])
  @@unique([documentType, numberHash])
  @@index([vendorId])
  @@index([status, expiresAt])
  @@map("VendorDocument")
}

model MemberStatusHistory {
  id          String       @id @default(uuid())
  memberId    String
  fromStatus  MemberStatus
  toStatus    MemberStatus
  reason      String?
  actorUserId String?
  createdAt   DateTime     @default(now())
  member      Member       @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@index([memberId, createdAt])
}
```

- [ ] **Step 4: Replace the enums**

Delete `enum VendorStatus { ... }`. Add next to `KycStatus`:

```prisma
enum MemberStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
  ARCHIVED
}

enum MemberDocumentStatus {
  SUBMITTED
  APPROVED
  REJECTED
  EXPIRED
}
```

Replace `enum NotificationType` with:

```prisma
enum NotificationType {
  DEAL_PENDING_APPROVAL
  ORDER_RECEIVED
  VENDOR_PENDING_APPROVAL
  MEMBER_SUSPENDED
  DOCUMENT_APPROVED
  DOCUMENT_REJECTED
}
```

- [ ] **Step 5: Validate**

Run: `npx prisma validate --schema=apps/msd-api/prisma/schema.prisma`
Expected: `The schema at apps/msd-api/prisma/schema.prisma is valid`

- [ ] **Step 6: Write the migration `apps/msd-api/prisma/migrations/20261015100000_member_lifecycle/migration.sql`**

```sql
-- Member lifecycle: status model, document review fields, status history, role rename.
-- Order matters: the REJECTED reason is recorded before the enum type is swapped.

UPDATE "Vendor"
SET "statusReason" = CASE
  WHEN "statusReason" IS NULL OR "statusReason" = '' THEN 'Migrated from rejected'
  ELSE 'Migrated from rejected: ' || "statusReason"
END
WHERE "status"::text = 'REJECTED';

CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED');

ALTER TABLE "Vendor" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Vendor" ALTER COLUMN "status" TYPE "MemberStatus" USING (
  CASE "status"::text
    WHEN 'INACTIVE' THEN 'INACTIVE'
    WHEN 'SUSPENDED' THEN 'SUSPENDED'
    WHEN 'REJECTED' THEN 'SUSPENDED'
    ELSE 'ACTIVE'
  END
)::"MemberStatus";
ALTER TABLE "Vendor" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
DROP TYPE "VendorStatus";

ALTER TABLE "Vendor"
  ADD COLUMN "statusChangedAt" TIMESTAMP(3),
  ADD COLUMN "statusChangedByUserId" TEXT,
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "documentsDueAt" TIMESTAMP(3),
  ADD COLUMN "reviewFlaggedAt" TIMESTAMP(3),
  ADD COLUMN "welcomeSentAt" TIMESTAMP(3);

UPDATE "Vendor"
SET "statusChangedAt" = "updatedAt",
    "documentsDueAt" = NOW() + INTERVAL '14 days';

CREATE TYPE "MemberDocumentStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'EXPIRED');

ALTER TABLE "VendorDocument"
  ADD COLUMN "status" "MemberDocumentStatus" NOT NULL DEFAULT 'SUBMITTED',
  ADD COLUMN "numberMasked" TEXT,
  ADD COLUMN "numberHash" TEXT,
  ADD COLUMN "numberEncrypted" TEXT,
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "reviewedByUserId" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "uploadedByUserId" TEXT,
  ADD COLUMN "uploadedOnBehalf" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "VendorDocument_documentType_numberHash_key" ON "VendorDocument"("documentType", "numberHash");
CREATE INDEX "VendorDocument_status_expiresAt_idx" ON "VendorDocument"("status", "expiresAt");

CREATE TABLE "MemberStatusHistory" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "fromStatus" "MemberStatus" NOT NULL,
  "toStatus" "MemberStatus" NOT NULL,
  "reason" TEXT,
  "actorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MemberStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MemberStatusHistory_memberId_createdAt_idx" ON "MemberStatusHistory"("memberId", "createdAt");

ALTER TABLE "MemberStatusHistory"
  ADD CONSTRAINT "MemberStatusHistory_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TYPE "NotificationType" ADD VALUE 'MEMBER_SUSPENDED';
ALTER TYPE "NotificationType" ADD VALUE 'DOCUMENT_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'DOCUMENT_REJECTED';

-- Role rename keeps every UserRole link, because UserRole points at the role id.
UPDATE "Role" SET "key" = 'member', "name" = 'Member' WHERE "key" = 'vendor';
```

- [ ] **Step 7: Write `down.sql` in the same folder**

```sql
-- Manual rollback. Cannot restore REJECTED (they stay SUSPENDED) and cannot remove
-- NotificationType values (Postgres has no DROP VALUE); the extra values are harmless.
UPDATE "Role" SET "key" = 'vendor', "name" = 'Vendor' WHERE "key" = 'member';

DROP TABLE "MemberStatusHistory";

DROP INDEX "VendorDocument_status_expiresAt_idx";
DROP INDEX "VendorDocument_documentType_numberHash_key";
ALTER TABLE "VendorDocument"
  DROP COLUMN "status", DROP COLUMN "numberMasked", DROP COLUMN "numberHash",
  DROP COLUMN "numberEncrypted", DROP COLUMN "rejectionReason", DROP COLUMN "reviewedByUserId",
  DROP COLUMN "reviewedAt", DROP COLUMN "expiresAt", DROP COLUMN "uploadedByUserId",
  DROP COLUMN "uploadedOnBehalf";
DROP TYPE "MemberDocumentStatus";

ALTER TABLE "Vendor"
  DROP COLUMN "statusChangedAt", DROP COLUMN "statusChangedByUserId", DROP COLUMN "archivedAt",
  DROP COLUMN "documentsDueAt", DROP COLUMN "reviewFlaggedAt", DROP COLUMN "welcomeSentAt";

CREATE TYPE "VendorStatus" AS ENUM
  ('PROFILE_INCOMPLETE', 'PENDING_VERIFICATION', 'APPROVED', 'REJECTED', 'ACTIVE', 'INACTIVE', 'SUSPENDED');
ALTER TABLE "Vendor" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Vendor" ALTER COLUMN "status" TYPE "VendorStatus" USING (
  CASE "status"::text WHEN 'ARCHIVED' THEN 'SUSPENDED' ELSE "status"::text END
)::"VendorStatus";
ALTER TABLE "Vendor" ALTER COLUMN "status" SET DEFAULT 'PROFILE_INCOMPLETE';
DROP TYPE "MemberStatus";
```

- [ ] **Step 8: Write the read-only report `apps/msd-api/prisma/member-status-report.ts`**

Run it BEFORE applying the migration. It prints the counts the owner signs off on.

```ts
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

/**
 * Read-only. Prints how many vendors are in each old status and what each becomes.
 * Usage: npx tsx apps/msd-api/prisma/member-status-report.ts
 */
const MAPPING: Record<string, string> = {
  PROFILE_INCOMPLETE: 'ACTIVE',
  PENDING_VERIFICATION: 'ACTIVE',
  APPROVED: 'ACTIVE',
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  SUSPENDED: 'SUSPENDED',
  REJECTED: 'SUSPENDED',
};

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ status: string; count: string }>(
      'SELECT "status"::text AS status, COUNT(*)::text AS count FROM "Vendor" GROUP BY 1 ORDER BY 1',
    );
    let hidden = 0;
    console.log('Old status            Rows   Becomes');
    for (const row of rows) {
      const target = MAPPING[row.status] ?? 'ACTIVE';
      console.log(`${row.status.padEnd(21)} ${row.count.padStart(4)}   ${target}`);
      if (row.status === 'REJECTED') hidden += Number(row.count);
    }
    console.log(`\nRows that become SUSPENDED and disappear from the website because they were REJECTED: ${hidden}`);
    const docs = await client.query('SELECT COUNT(*)::text AS count FROM "VendorDocument"');
    console.log(`Existing KYC files that become SUBMITTED documents: ${docs.rows[0].count}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 9: Generate the client**

Run: `npx prisma generate --schema=apps/msd-api/prisma/schema.prisma`
Expected: `Generated Prisma Client` (TypeScript errors in services are expected until Task 3).

- [ ] **Step 10: Commit**

```bash
git add apps/msd-api/prisma/schema.prisma apps/msd-api/prisma/migrations/20261015100000_member_lifecycle apps/msd-api/prisma/member-status-report.ts
git commit -m "feat(msd-api): Add member lifecycle schema and migration"
```

---

### Task 3: Rename sweep (delegates, types, test mock)

**Files:** every `*.ts` under `apps/msd-api/src` and `apps/msd-api/prisma/seed.ts` that uses `prisma.vendor`, `tx.vendor`, `vendorDocument`, `VendorStatus`.

- [ ] **Step 1: Run the mechanical rename**

```bash
cd apps/msd-api
FILES=$(grep -rlE "\b(prisma|tx|prismaMock|mockTx)\.vendor\b|\bvendorDocument\b|\bVendorStatus\b|Prisma\.Vendor(Unchecked|Create|Update|Where)" src prisma/seed.ts | grep -v generated)
echo "$FILES"
sed -i -E \
  -e 's/\b(prisma|tx|prismaMock|mockTx)\.vendor\b/\1.member/g' \
  -e 's/\b(prisma|tx|prismaMock|mockTx)\.vendorDocument\b/\1.memberDocument/g' \
  -e 's/\bVendorStatus\b/MemberStatus/g' \
  -e 's/Prisma\.Vendor(Unchecked|Create|Update|Where)/Prisma.Member\1/g' \
  $FILES
```

- [ ] **Step 2: Update the test mock `apps/msd-api/src/test-utils/prisma-mock.ts`**

Replace the `vendor: {` block key with `member:` and add `updateMany` and `findFirst` handled; replace `vendorDocument:` with `memberDocument:`; add two new blocks. The three edited blocks must read:

```ts
    member: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    memberStatusHistory: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    memberDocument: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
```

Also make sure `orderItem` has `count: vi.fn()` (add it to that block if missing).

- [ ] **Step 3: Fix the status literals that no longer exist**

Run: `cd apps/msd-api && npx tsc -p tsconfig.app.json --noEmit 2>&1 | head -60`

Fix each error. The expected ones:
- `vendor.service.ts`: `heuristicInitialStatus`, `approveVendor`, `rejectVendor`, `submitForVerification` reference removed enum values. Do not fix them here; leave them failing and note the line numbers. Task 10 removes them. To keep the build green until then, change only the type position: `status: VendorStatus` becomes `status: MemberStatus` (already done by sed) and return `'ACTIVE'` from `heuristicInitialStatus`:

```ts
function heuristicInitialStatus(_input: { gstNumber?: string; panNumber?: string }): MemberStatus {
  return 'ACTIVE';
}
```

- In `approveVendor` use `status: 'ACTIVE'` (already). In `rejectVendor` temporarily `status: 'SUSPENDED'`. In `registerPublicVendor` pass `'ACTIVE'` instead of `'PENDING_VERIFICATION'`. In `submitForVerification` and `VendorListQuerySchema` / `VendorStatusUpdateSchema` the old string values are in Zod enums: leave until Task 10, but they must compile, so change the Zod enum in `vendor.schema.ts` `VendorListQuerySchema.status` to `z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED']).optional()`.

- [ ] **Step 4: Run the whole backend suite**

Run: `cd apps/msd-api && npx vitest run`
Expected: only failures that assert old statuses (`PENDING_VERIFICATION`, `REJECTED`, approve or reject routes). List them. Fix test fixtures that merely use the old status as data by changing the value to `ACTIVE`. Leave tests for approve, reject, submit and public register failing; Task 10 deletes them.

- [ ] **Step 5: Commit**

```bash
git add apps/msd-api/src apps/msd-api/prisma/seed.ts
git commit -m "refactor(msd-api): Rename Vendor model delegates to Member"
```

---

### Task 4: Roles and the `members` permission key

**Files:**
- Modify: `apps/msd-api/prisma/seed.ts`, `packages/shared-menu/src/msd-menu.json`, `apps/msd-api/src/services/vendor.service.ts`, `apps/msd-api/src/routes/vendors.routes.ts`, `apps/msd-api/src/routes/orders.routes.ts`, `packages/shared-menu/src/index.test.ts`, `packages/shared-permissions/src/index.test.ts`
- Create: `apps/msd-api/prisma/seed-members.test.ts`

- [ ] **Step 1: Rename the permission key in backend code**

```bash
cd apps/msd-api
sed -i -E "s/requirePermission\('vendors'/requirePermission('members'/g; s/requireAnyPermission\('vendors'/requireAnyPermission('members'/g" src/routes/vendors.routes.ts
sed -i "s/can(granted, 'vendors', 'custom')/can(granted, 'members', 'custom')/" src/routes/orders.routes.ts
grep -rn "'vendors'" src --include=*.ts | grep -v "\.test\.ts" | grep -v generated
```

Expected remaining hits: none that are permission keys. Update the test files the same way: `grep -rln "'vendors'" src --include=*.test.ts | xargs sed -i -E "s/'vendors', '(view|create|edit|delete|custom|approve|reject|status_change)'/'members', '\1'/g"`.

- [ ] **Step 2: Rename the menu node in `packages/shared-menu/src/msd-menu.json`**

In the Members group change `"permissionKey": "vendors.group"` to `"members.group"`, and in the `vendor-list` child change `"permissionKey": "vendors"` to `"members"`. Set the child's `"id"` to `"member-list"`. Then:

```bash
npx nx run shared-menu:test
```

Fix the `index.test.ts` assertions that name `vendors` or `vendors.group` to `members` and `members.group`. Do the same in `packages/shared-permissions/src/index.test.ts` if it hard-codes the key.

- [ ] **Step 3: Role key in the service**

In `vendor.service.ts` add `import { ROLE_KEYS } from '../lib/role-keys';` and change `ensureVendorRoleAssigned`:

```ts
async function ensureVendorRoleAssigned(userId: string) {
  const memberRole = await prisma.role.findUnique({ where: { key: ROLE_KEYS.member } });
  if (!memberRole) return; // seed.ts always creates the seven system roles
  await assignRole(userId, memberRole.id);
}
```

Update `vendor.service.test.ts`: the `findUnique` mock for the role should resolve with `key: 'member'` where it asserted `'vendor'`.

- [ ] **Step 4: Write the failing seed test `apps/msd-api/prisma/seed-members.test.ts`**

The seed exports its pure tables so they can be asserted. Add to `seed.ts` (Step 5) `export const MEMBER_GRANTS`.

```ts
import { describe, it, expect } from 'vitest';
import { ROLES, MEMBER_GRANTS } from './seed';

describe('seed: roles', () => {
  it('has the seven system roles', () => {
    expect(ROLES.map((r) => r.key).sort()).toEqual(
      ['admin', 'customer', 'marketing', 'member', 'sales', 'super_admin', 'support'].sort(),
    );
  });
});

describe('seed: members grants (matches the role matrix)', () => {
  it('Admin: view, create, edit, status_change, approve, reject, never delete', () => {
    expect(MEMBER_GRANTS.admin).toEqual(
      expect.arrayContaining(['members:view', 'members:create', 'members:edit', 'members:status_change', 'members:approve', 'members:reject']),
    );
    expect(MEMBER_GRANTS.admin).not.toContain('members:delete');
  });

  it('Sales: view, create, edit only', () => {
    expect([...MEMBER_GRANTS.sales].sort()).toEqual(['members:create', 'members:edit', 'members:view']);
  });

  it('Marketing and Support: view only', () => {
    expect(MEMBER_GRANTS.marketing).toEqual(['members:view']);
    expect(MEMBER_GRANTS.support).toEqual(['members:view']);
  });

  it('Member keeps custom, never view (own scope is not enforced yet)', () => {
    expect(MEMBER_GRANTS.member).toEqual(['members:custom']);
  });
});
```

Run: `cd apps/msd-api && npx vitest run prisma/seed-members.test.ts` (the vite include pattern is `src/**`; temporarily add `'prisma/**/*.test.ts'` to `include` in `apps/msd-api/vite.config.ts`). Expected: FAIL.

- [ ] **Step 5: Edit `apps/msd-api/prisma/seed.ts`**

1. Export `ROLES` and replace the `vendor` role line, and add `support`:

```ts
export const ROLES: RoleSeed[] = [
  { key: 'super_admin', name: 'Super Admin', description: 'Full unrestricted access to every module.', isSystem: true, isSuperAdmin: true },
  { key: 'admin', name: 'Admin', description: 'MSD staff. Same as Super Admin except delete.', isSystem: true, isSuperAdmin: false },
  { key: 'marketing', name: 'Marketing', description: 'View members and catalog. Manages website content.', isSystem: true, isSuperAdmin: false },
  { key: 'sales', name: 'Sales', description: 'Creates members and their catalog.', isSystem: true, isSuperAdmin: false },
  { key: 'member', name: 'Member', description: 'Deal company that manages its own profile and catalog.', isSystem: true, isSuperAdmin: false },
  { key: 'support', name: 'Support', description: 'Contacts customers and members. View only.', isSystem: true, isSuperAdmin: false },
  { key: 'customer', name: 'Customer', description: 'Consumer-facing base role.', isSystem: true, isSuperAdmin: false },
];
```

2. In `EXTRA_ACTIONS_BY_MENU_KEY` rename the key `vendors:` to `members:` (same action list).

3. Add above `grantStarterPermissions`:

```ts
/** The `members` row of the role matrix. Super Admin gets everything through its role flag. */
export const MEMBER_GRANTS: Record<'admin' | 'sales' | 'marketing' | 'support' | 'member', string[]> = {
  admin: ['members:view', 'members:create', 'members:edit', 'members:status_change', 'members:approve', 'members:reject'],
  sales: ['members:view', 'members:create', 'members:edit'],
  marketing: ['members:view'],
  support: ['members:view'],
  // `custom` gates the member's own /vendors/me/* surface. `view` would expose the admin list
  // until own-scope enforcement exists, so it is deliberately not granted here.
  member: ['members:custom'],
};
```

4. In `grantStarterPermissions`:
   - In the `admin` list replace the `'vendors:view' ... 'vendors:status_change'` lines with `...MEMBER_GRANTS.admin,`.
   - In the `sales` list replace `'vendors:view', 'vendors:edit'` with `...MEMBER_GRANTS.sales`.
   - In the `marketing` list add `...MEMBER_GRANTS.marketing,`.
   - Add after the `sales` grant:

```ts
  await grant('support', [
    'dashboard:view',
    ...MEMBER_GRANTS.support,
    'customers:view',
    'orders:view',
  ]);
```

   - Rename `resetGrant('vendor', [` to `resetGrant('member', [` and replace `'vendors:custom',` with `...MEMBER_GRANTS.member,`.
   - Admin must lose `members:delete` if an older seed granted it. After the admin `grant(...)` add:

```ts
  const adminRole = roles.get('admin');
  const memberDelete = permissionIdByKey.get('members:delete');
  if (adminRole && memberDelete) {
    await prisma.rolePermission.deleteMany({ where: { roleId: adminRole.id, permissionId: memberDelete } });
  }
```

5. Change `assign('vendor', ['vendor-profile'])` to `assign('member', ['vendor-profile'])` and `roles.get('vendor')` in `seedVendorsAndBranches` to `roles.get('member')`.

6. In `main()` replace the split list with:

```ts
    [
      { oldMenuKey: 'cms.blog', newMenuKeys: ['cms.blog.pages', 'cms.blog.articles'] },
      { oldMenuKey: 'vendors', newMenuKeys: ['members'] },
    ],
```

7. Guard `main()` so importing the seed in a test does not run it: wrap the bottom call as

```ts
if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
```

(Keep the existing error handling the file already has; only add the `require.main` guard around it.)

- [ ] **Step 6: Run tests and typecheck**

```bash
cd apps/msd-api && npx vitest run prisma/seed-members.test.ts src/services/vendor.service.test.ts
cd ../.. && npx nx run-many -t test --projects=shared-menu,shared-permissions
npx tsc -p apps/msd-api/tsconfig.app.json --noEmit
```

Expected: PASS, no new type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/msd-api/prisma/seed.ts apps/msd-api/prisma/seed-members.test.ts apps/msd-api/vite.config.ts apps/msd-api/src packages/shared-menu packages/shared-permissions
git commit -m "feat(msd-api): Rename vendors key to members and seed the 7 roles"
```

---

### Task 5: Status machine

**Files:** Create `apps/msd-api/src/services/member-status-machine.ts` and `.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { canTransition, assertTransition, REASON_MIN, REASON_MAX } from './member-status-machine';

type S = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVED';
const CASES: Array<[S, S, boolean]> = [
  ['ACTIVE', 'INACTIVE', true],
  ['ACTIVE', 'SUSPENDED', true],
  ['ACTIVE', 'ACTIVE', false],
  ['ACTIVE', 'ARCHIVED', false],
  ['INACTIVE', 'ACTIVE', true],
  ['INACTIVE', 'SUSPENDED', true],
  ['INACTIVE', 'INACTIVE', false],
  ['SUSPENDED', 'ACTIVE', true],
  ['SUSPENDED', 'INACTIVE', false],
  ['SUSPENDED', 'SUSPENDED', false],
  ['ARCHIVED', 'ACTIVE', false],
  ['ARCHIVED', 'INACTIVE', false],
  ['ARCHIVED', 'SUSPENDED', false],
];

describe('member status machine', () => {
  it.each(CASES)('%s -> %s is %s', (from, to, allowed) => {
    expect(canTransition(from, to)).toBe(allowed);
  });

  it('throws CONFLICT for a refused transition', () => {
    expect(() => assertTransition('SUSPENDED', 'INACTIVE')).toThrowError(/Suspended to Inactive/);
  });

  it('exposes the reason length limits', () => {
    expect(REASON_MIN).toBe(10);
    expect(REASON_MAX).toBe(500);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (`cd apps/msd-api && npx vitest run src/services/member-status-machine.test.ts`)

- [ ] **Step 3: Implement**

```ts
import { ApiError } from '../lib/http';

export type MemberStatusValue = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVED';

/** Statuses an admin can set. ARCHIVED is reached only through a delete of a member with orders. */
export type SettableMemberStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export const REASON_MIN = 10;
export const REASON_MAX = 500;

const ALLOWED: Record<MemberStatusValue, readonly MemberStatusValue[]> = {
  ACTIVE: ['INACTIVE', 'SUSPENDED'],
  INACTIVE: ['ACTIVE', 'SUSPENDED'],
  SUSPENDED: ['ACTIVE'],
  ARCHIVED: [],
};

const LABEL: Record<MemberStatusValue, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  SUSPENDED: 'Suspended',
  ARCHIVED: 'Archived',
};

export function canTransition(from: MemberStatusValue, to: MemberStatusValue): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: MemberStatusValue, to: MemberStatusValue): void {
  if (!canTransition(from, to)) {
    throw new ApiError('CONFLICT', `A member cannot move from ${LABEL[from]} to ${LABEL[to]}.`);
  }
}
```

- [ ] **Step 4: Run, expect PASS. Commit**

```bash
git add apps/msd-api/src/services/member-status-machine.ts apps/msd-api/src/services/member-status-machine.test.ts
git commit -m "feat(msd-api): Add member status machine"
```

---

### Task 6: Member messages, providers and notice service

**Files:**
- Create: `apps/msd-api/src/lib/member-messages.ts`, `apps/msd-api/src/lib/member-messages.test.ts`, `apps/msd-api/src/services/member-notice.service.ts`, `apps/msd-api/src/services/member-notice.service.test.ts`
- Modify: `apps/msd-api/src/providers/email/smtp.provider.ts`, `apps/msd-api/src/providers/sms/connectExpress.provider.ts`

- [ ] **Step 1: Write the failing message test `member-messages.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../config/env', () => ({ env: { supportEmail: 'help@msd.test', supportPhone: '+911234567890' } }));

import { suspendedMessage, inactiveReadOnlyMessage } from './member-messages';

describe('member messages', () => {
  it('suspended message carries the reason, the support contact and the way back', () => {
    const text = suspendedMessage('Documents not completed');
    expect(text).toContain('suspended');
    expect(text).toContain('Documents not completed');
    expect(text).toContain('help@msd.test');
    expect(text).toContain('+911234567890');
    expect(text).toContain('reactivate');
  });

  it('suspended message still reads well with no reason on record', () => {
    expect(suspendedMessage(null)).toContain('not recorded');
  });

  it('read only message tells the member they can view but not change', () => {
    expect(inactiveReadOnlyMessage()).toMatch(/view only/i);
  });
});
```

- [ ] **Step 2: Run, expect FAIL. Implement `member-messages.ts`**

```ts
import { env } from '../config/env';

function contactLine(): string {
  const parts: string[] = [];
  if (env.supportEmail) parts.push(`email ${env.supportEmail}`);
  if (env.supportPhone) parts.push(`call ${env.supportPhone}`);
  return parts.length > 0 ? `Please ${parts.join(' or ')}` : 'Please contact our support team';
}

/** One text for the login error, the email and the SMS, so a member always reads the same steps. */
export function suspendedMessage(reason: string | null): string {
  return (
    `Your member account is suspended. Reason: ${reason?.trim() || 'not recorded'}. ` +
    `${contactLine()}, resolve the reason above, and our team will reactivate your account.`
  );
}

export function reactivatedMessage(): string {
  return 'Your member account is active again. You can log in and manage your branches, deals, therapists and products.';
}

export function inactiveReadOnlyMessage(): string {
  return 'Your member account is inactive and view only. You can look at your orders, customers, branches, deals, therapists and products, but you cannot change anything. Please contact our support team to reactivate it.';
}

export function welcomeMessage(name: string | null | undefined): string {
  const who = name?.trim() ? `, ${name.trim()}` : '';
  return `Welcome to MSD${who}. Your member account is ready. Log in with this mobile number or email address using a one-time password.`;
}
```

- [ ] **Step 3: Add generic send functions to the providers**

In `smtp.provider.ts` append (reuses `getTransporter`, `REQUIRED_ENV`, `maskEmail`):

```ts
/** Sends a plain text transactional email. Returns true only once SMTP accepted it. */
export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const missing = REQUIRED_ENV.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) {
    console.error(`[email:smtp] cannot send, missing env var(s): ${missing.join(', ')}`);
    return false;
  }
  try {
    const info = await getTransporter().sendMail({ from: env.emailFrom, to, subject, text });
    console.info(`[email:smtp] sent to=${maskEmail(to)} messageId=${info.messageId}`);
    return true;
  } catch (err) {
    console.error(`[email:smtp] request FAILED to=${maskEmail(to)} error=${(err as Error).message}`);
    return false;
  }
}
```

In `connectExpress.provider.ts` append (reuses `REQUIRED_ENV`, `isProviderSuccess`, `maskPhone`, `safeStringify`):

```ts
/**
 * Sends a free text SMS. Production senders must have this text registered as a DLT template
 * with the provider, otherwise the carrier drops it. Returns true only on provider success.
 */
export async function sendTextSms(phone: string, message: string): Promise<boolean> {
  const missing = REQUIRED_ENV.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) {
    console.error(`[sms:connectExpress] cannot send, missing env var(s): ${missing.join(', ')}`);
    return false;
  }
  try {
    const response = await axios.get(env.smsApiUrl, {
      params: { method: 'sms', api_key: env.smsApiKey, to: phone, sender: env.smsSender, unicode: 'auto', message, format: 'json' },
      timeout: 10_000,
    });
    const ok = isProviderSuccess(response.data);
    console.info(`[sms:connectExpress] ${ok ? 'sent' : 'send reported failure'} to=${maskPhone(phone)} response=${safeStringify(response.data)}`);
    return ok;
  } catch (err) {
    console.error(`[sms:connectExpress] request FAILED to=${maskPhone(phone)} error=${(err as Error).message}`);
    return false;
  }
}
```

- [ ] **Step 4: Write the failing notice test `member-notice.service.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendEmail = vi.fn();
const sendTextSms = vi.fn();
vi.mock('../providers/email/smtp.provider', () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
vi.mock('../providers/sms/connectExpress.provider', () => ({ sendTextSms: (...a: unknown[]) => sendTextSms(...a) }));
vi.mock('../config/env', () => ({ env: { supportEmail: 'help@msd.test', supportPhone: '+911234567890' } }));

import { sendMemberNotice } from './member-notice.service';

beforeEach(() => {
  vi.clearAllMocks();
  sendEmail.mockResolvedValue(true);
  sendTextSms.mockResolvedValue(true);
});

describe('sendMemberNotice', () => {
  it('sends both channels for a suspension, with the reason in the text', async () => {
    const result = await sendMemberNotice('SUSPENDED', { name: 'Asha', email: 'a@x.com', phone: '+919876543210' }, 'Documents not completed');
    expect(result).toEqual({ email: true, sms: true });
    expect(sendEmail).toHaveBeenCalledWith('a@x.com', expect.stringMatching(/suspended/i), expect.stringContaining('Documents not completed'));
    expect(sendTextSms).toHaveBeenCalledWith('+919876543210', expect.stringContaining('Documents not completed'));
  });

  it('skips a channel that has no contact detail', async () => {
    const result = await sendMemberNotice('REACTIVATED', { email: null, phone: '+919876543210' });
    expect(result).toEqual({ email: null, sms: true });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('retries a failed send once and reports the final result', async () => {
    sendEmail.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const result = await sendMemberNotice('WELCOME', { name: 'Asha', email: 'a@x.com' });
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(result.email).toBe(true);
  });

  it('never throws when a provider throws', async () => {
    sendEmail.mockRejectedValue(new Error('smtp down'));
    await expect(sendMemberNotice('SUSPENDED', { email: 'a@x.com' }, 'x'.repeat(12))).resolves.toEqual({ email: false, sms: null });
  });
});
```

- [ ] **Step 5: Implement `member-notice.service.ts`**

```ts
import { sendEmail } from '../providers/email/smtp.provider';
import { sendTextSms } from '../providers/sms/connectExpress.provider';
import { reactivatedMessage, suspendedMessage, welcomeMessage } from '../lib/member-messages';

export type MemberNoticeKind = 'WELCOME' | 'SUSPENDED' | 'REACTIVATED';

export interface MemberNoticeTarget {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface MemberNoticeResult {
  /** null when the member has no email on record. */
  email: boolean | null;
  /** null when the member has no phone on record. */
  sms: boolean | null;
}

function build(kind: MemberNoticeKind, target: MemberNoticeTarget, reason?: string | null) {
  if (kind === 'SUSPENDED') return { subject: 'Your MSD member account is suspended', text: suspendedMessage(reason ?? null) };
  if (kind === 'REACTIVATED') return { subject: 'Your MSD member account is active again', text: reactivatedMessage() };
  return { subject: 'Welcome to MSD', text: welcomeMessage(target.name) };
}

/** One inline retry. A durable retry queue arrives with the reminder job slice. */
async function attempt(send: () => Promise<boolean>): Promise<boolean> {
  for (let i = 0; i < 2; i += 1) {
    try {
      if (await send()) return true;
    } catch (err) {
      console.error({ err, context: 'member notice send threw' });
    }
  }
  return false;
}

/** Never throws. The caller records the result; a failed send must not undo a status change. */
export async function sendMemberNotice(
  kind: MemberNoticeKind,
  target: MemberNoticeTarget,
  reason?: string | null,
): Promise<MemberNoticeResult> {
  const { subject, text } = build(kind, target, reason);
  const email = target.email ? await attempt(() => sendEmail(target.email as string, subject, text)) : null;
  const sms = target.phone ? await attempt(() => sendTextSms(target.phone as string, text)) : null;
  return { email, sms };
}
```

- [ ] **Step 6: Run both tests, expect PASS. Commit**

```bash
cd apps/msd-api && npx vitest run src/lib/member-messages.test.ts src/services/member-notice.service.test.ts
git add apps/msd-api/src/lib/member-messages.ts apps/msd-api/src/lib/member-messages.test.ts apps/msd-api/src/services/member-notice.service.ts apps/msd-api/src/services/member-notice.service.test.ts apps/msd-api/src/providers
git commit -m "feat(msd-api): Add member email and SMS notices"
```

---

### Task 7: Access enforcement (authenticate, login, OTP)

**Files:**
- Create: `apps/msd-api/src/services/member-access.service.ts`, `apps/msd-api/src/middleware/authenticate.member.test.ts`, `apps/msd-api/src/services/auth.member.test.ts`
- Modify: `apps/msd-api/src/middleware/authenticate.ts`, `apps/msd-api/src/services/auth.service.ts`, `apps/msd-api/src/services/otp.service.ts`

- [ ] **Step 1: Implement `member-access.service.ts`**

```ts
import { prisma } from '../lib/prisma';

export type MemberAccessState =
  | { kind: 'none' }
  | { kind: 'ok' }
  | { kind: 'readOnly' }
  | { kind: 'blocked'; reason: string | null };

const TTL_MS = 30_000;
const cache = new Map<string, { at: number; state: MemberAccessState }>();

/** Reads the owner's member status with a 30 second cache. Status changes clear the entry. */
export async function getMemberAccessState(userId: string, now: number = Date.now()): Promise<MemberAccessState> {
  const hit = cache.get(userId);
  if (hit && now - hit.at < TTL_MS) return hit.state;

  const member = await prisma.member.findUnique({
    where: { ownerUserId: userId },
    select: { status: true, statusReason: true },
  });

  let state: MemberAccessState = { kind: 'none' };
  if (member) {
    if (member.status === 'SUSPENDED' || member.status === 'ARCHIVED') {
      state = { kind: 'blocked', reason: member.statusReason ?? null };
    } else if (member.status === 'INACTIVE') {
      state = { kind: 'readOnly' };
    } else {
      state = { kind: 'ok' };
    }
  }
  cache.set(userId, { at: now, state });
  return state;
}

export function clearMemberAccessCache(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}
```

- [ ] **Step 2: Write the failing middleware test `authenticate.member.test.ts`**

```ts
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import { authenticate } from './authenticate';
import { clearMemberAccessCache } from '../services/member-access.service';
import { bearerFor } from '../test-utils/auth-test-utils';

const prismaMock = vi.mocked(prisma, true);
const USER_ID = 'a0a0a0a0-0000-4000-8000-000000000001';

function app() {
  const a = express();
  a.use(express.json());
  a.get('/api/v1/things', authenticate, (_req, res) => res.json({ ok: true }));
  a.post('/api/v1/things', authenticate, (_req, res) => res.json({ ok: true }));
  a.post('/api/v1/auth/logout', authenticate, (_req, res) => res.json({ ok: true }));
  return a;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearMemberAccessCache();
});

describe('authenticate: member lifecycle', () => {
  it('refuses a suspended member on any route with MEMBER_SUSPENDED and the reason', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ status: 'SUSPENDED', statusReason: 'Documents not completed' });
    const res = await request(app()).get('/api/v1/things').set('Authorization', bearerFor({ sub: USER_ID, roles: ['member'] }));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MEMBER_SUSPENDED');
    expect(res.body.error.message).toContain('Documents not completed');
  });

  it('refuses an archived member', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ status: 'ARCHIVED', statusReason: null });
    const res = await request(app()).get('/api/v1/things').set('Authorization', bearerFor({ sub: USER_ID, roles: ['member'] }));
    expect(res.status).toBe(403);
  });

  it('lets an inactive member read', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ status: 'INACTIVE', statusReason: 'Business pause' });
    const res = await request(app()).get('/api/v1/things').set('Authorization', bearerFor({ sub: USER_ID, roles: ['member'] }));
    expect(res.status).toBe(200);
  });

  it('blocks an inactive member from writing', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ status: 'INACTIVE', statusReason: 'Business pause' });
    const res = await request(app()).post('/api/v1/things').set('Authorization', bearerFor({ sub: USER_ID, roles: ['member'] }));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MEMBER_INACTIVE_READ_ONLY');
  });

  it('lets an inactive member log out', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ status: 'INACTIVE', statusReason: null });
    const res = await request(app()).post('/api/v1/auth/logout').set('Authorization', bearerFor({ sub: USER_ID, roles: ['member'] }));
    expect(res.status).toBe(200);
  });

  it('still honours a token that carries the pre-rename `vendor` role key', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ status: 'SUSPENDED', statusReason: null });
    const res = await request(app()).get('/api/v1/things').set('Authorization', bearerFor({ sub: USER_ID, roles: ['vendor'] }));
    expect(res.status).toBe(403);
  });

  it('does not look up a member for staff or customers', async () => {
    const res = await request(app()).get('/api/v1/things').set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.member.findUnique).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run, expect FAIL. Edit `authenticate.ts`**

Add imports at the top:

```ts
import { MEMBER_ROLE_KEYS } from '../lib/role-keys';
import { getMemberAccessState } from '../services/member-access.service';
import { inactiveReadOnlyMessage, suspendedMessage } from '../lib/member-messages';
```

Add above `authenticate`:

```ts
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const READ_ONLY_EXEMPT_SUFFIXES = ['/auth/logout', '/auth/refresh'];

/** An inactive member may read, and may always log out or refresh a token. */
export function isReadOnlyExempt(method: string, originalUrl: string): boolean {
  if (READ_METHODS.has(method.toUpperCase())) return true;
  const path = originalUrl.split('?')[0];
  return READ_ONLY_EXEMPT_SUFFIXES.some((suffix) => path.endsWith(suffix));
}
```

Inside `authenticate`, in the second `try` block, after the `user.status !== 'active'` check and before the closing of the `try`, add:

```ts
    if (req.user.roles.some((role) => MEMBER_ROLE_KEYS.includes(role))) {
      const access = await getMemberAccessState(req.user.sub);
      if (access.kind === 'blocked') {
        sendError(res, 'MEMBER_SUSPENDED', suspendedMessage(access.reason));
        return;
      }
      if (access.kind === 'readOnly' && !isReadOnlyExempt(req.method, req.originalUrl)) {
        sendError(res, 'MEMBER_INACTIVE_READ_ONLY', inactiveReadOnlyMessage());
        return;
      }
    }
```

- [ ] **Step 4: Run, expect PASS**, then the existing `authenticate.test.ts` still passes.

- [ ] **Step 5: Write the failing login test `auth.member.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});
vi.mock('../config/env', () => ({
  env: { supportEmail: '', supportPhone: '', otpExpiryMinutes: 10, otpMaxAttempts: 5 },
}));
vi.mock('../providers/sms/connectExpress.provider', () => ({ sendOtp: vi.fn().mockResolvedValue(true) }));
vi.mock('../providers/email/smtp.provider', () => ({ sendOtpEmail: vi.fn().mockResolvedValue(true) }));

import { prisma } from '../lib/prisma';
import { loginWithIdentifier } from './auth.service';
import { requestOtp } from './otp.service';

const prismaMock = vi.mocked(prisma, true);

beforeEach(() => vi.clearAllMocks());

describe('suspended member cannot log in or receive an OTP', () => {
  it('refuses login with MEMBER_SUSPENDED and records a failed attempt', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', status: 'active' });
    prismaMock.member.findUnique.mockResolvedValue({ status: 'SUSPENDED', statusReason: 'Rule break reported' });
    await expect(loginWithIdentifier('+919876543210')).rejects.toMatchObject({ code: 'MEMBER_SUSPENDED' });
    expect(prismaMock.loginHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'u1', success: false }) }),
    );
    expect(prismaMock.user.upsert).not.toHaveBeenCalled();
  });

  it('refuses the OTP request and creates no challenge', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'u1' });
    prismaMock.member.findUnique.mockResolvedValue({ status: 'SUSPENDED', statusReason: 'Rule break reported' });
    await expect(requestOtp('+919876543210', 'login' as never)).rejects.toMatchObject({ code: 'MEMBER_SUSPENDED' });
    expect(prismaMock.otpChallenge.create).not.toHaveBeenCalled();
  });

  it('lets an inactive member log in', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', status: 'active' });
    prismaMock.member.findUnique.mockResolvedValue({ status: 'INACTIVE', statusReason: null });
    prismaMock.user.upsert.mockResolvedValue({ id: 'u1', name: 'A', email: null, phone: '+919876543210', roles: [{}] });
    prismaMock.userRole.findMany.mockResolvedValue([{ role: { key: 'member' } }]);
    prismaMock.refreshSession.create.mockResolvedValue({});
    prismaMock.loginHistory.create.mockResolvedValue({});
    await expect(loginWithIdentifier('+919876543210')).resolves.toHaveProperty('accessToken');
  });
});
```

Adjust the `OtpPurpose` literal to a valid value from `auth.schema.ts` if `'login'` is not one (open `src/schemas/auth.schema.ts` and use the first enum member).

- [ ] **Step 6: Run, expect FAIL. Edit `auth.service.ts`**

Add the import `import { suspendedMessage } from '../lib/member-messages';` and below `assertUserMayLogIn` add:

```ts
/** A suspended or archived member never gets a token, and sees the reason and the way back. */
async function assertMemberMayLogIn(userId: string, meta: { ip?: string; userAgent?: string }, method: LoginMethod) {
  const member = await prisma.member.findUnique({
    where: { ownerUserId: userId },
    select: { status: true, statusReason: true },
  });
  if (!member || (member.status !== 'SUSPENDED' && member.status !== 'ARCHIVED')) return;
  await prisma.loginHistory.create({ data: { userId, method, success: false, ...meta } });
  throw new ApiError('MEMBER_SUSPENDED', suspendedMessage(member.statusReason ?? null));
}
```

In `loginWithIdentifier` change `if (existing) await assertUserMayLogIn(existing, meta, method);` to:

```ts
  if (existing) {
    await assertUserMayLogIn(existing, meta, method);
    await assertMemberMayLogIn(existing.id, meta, method);
  }
```

In `loginWithGoogle` change `if (existing) await assertUserMayLogIn(existing, meta, 'google');` to:

```ts
  if (existing) {
    await assertUserMayLogIn(existing, meta, 'google');
    await assertMemberMayLogIn(existing.id, meta, 'google');
  }
```

- [ ] **Step 7: Edit `otp.service.ts`**

Add imports `import { suspendedMessage } from '../lib/member-messages';` and at the top of `requestOtp` (before `crypto.randomInt`):

```ts
  const owner = await prisma.user.findFirst({
    where: isPhoneIdentifier(identifier) ? { phone: identifier, deletedAt: null } : { email: identifier, deletedAt: null },
    select: { id: true },
  });
  if (owner) {
    const member = await prisma.member.findUnique({
      where: { ownerUserId: owner.id },
      select: { status: true, statusReason: true },
    });
    if (member && (member.status === 'SUSPENDED' || member.status === 'ARCHIVED')) {
      throw new ApiError('MEMBER_SUSPENDED', suspendedMessage(member.statusReason ?? null));
    }
  }
```

Note for the owner: this tells anyone who knows a phone number that it belongs to a suspended member. That is what the request asked for, so the message is shown at OTP request. The existing `otpRequestRateLimiter` limits probing.

- [ ] **Step 8: Run all three test files and the existing auth and otp tests, expect PASS. Commit**

```bash
cd apps/msd-api && npx vitest run src/middleware src/services/auth src/services/otp
git add apps/msd-api/src/services/member-access.service.ts apps/msd-api/src/middleware apps/msd-api/src/services/auth.service.ts apps/msd-api/src/services/otp.service.ts apps/msd-api/src/services/auth.member.test.ts
git commit -m "feat(msd-api): Enforce suspended and inactive member access"
```

---

### Task 8: Status service (change, delete, archive)

**Files:** Create `apps/msd-api/src/services/member-status.service.ts` and `.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});
const sendMemberNotice = vi.fn().mockResolvedValue({ email: true, sms: true });
vi.mock('./member-notice.service', () => ({ sendMemberNotice: (...a: unknown[]) => sendMemberNotice(...a) }));

import { prisma } from '../lib/prisma';
import { changeMemberStatus, deleteMember } from './member-status.service';

const prismaMock = vi.mocked(prisma, true);
const ACTOR = { userId: 'admin-1', ip: '1.1.1.1', userAgent: 'test' };
const MEMBER = {
  id: 'm1',
  status: 'ACTIVE',
  ownerUserId: 'owner-1',
  ownerEmail: 'o@x.com',
  ownerMobile: '+919876543210',
  businessName: 'Glow',
  owner: { name: 'Asha', email: 'o@x.com', phone: '+919876543210' },
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.member.findUnique.mockResolvedValue({ ...MEMBER });
  prismaMock.member.update.mockResolvedValue({});
  prismaMock.memberStatusHistory.create.mockResolvedValue({});
  prismaMock.refreshSession.updateMany.mockResolvedValue({ count: 2 });
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe('changeMemberStatus', () => {
  it('suspends: updates status, writes history, revokes sessions and notifies', async () => {
    await changeMemberStatus('m1', 'SUSPENDED', 'Documents not completed', ACTOR);

    expect(prismaMock.member.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'm1' },
        data: expect.objectContaining({ status: 'SUSPENDED', statusReason: 'Documents not completed', statusChangedByUserId: 'admin-1' }),
      }),
    );
    expect(prismaMock.memberStatusHistory.create).toHaveBeenCalledWith({
      data: { memberId: 'm1', fromStatus: 'ACTIVE', toStatus: 'SUSPENDED', reason: 'Documents not completed', actorUserId: 'admin-1' },
    });
    expect(prismaMock.refreshSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'owner-1', revokedAt: null } }),
    );
    expect(sendMemberNotice).toHaveBeenCalledWith('SUSPENDED', expect.objectContaining({ email: 'o@x.com' }), 'Documents not completed');
  });

  it('inactive does not revoke sessions or notify', async () => {
    await changeMemberStatus('m1', 'INACTIVE', 'Owner on a long holiday', ACTOR);
    expect(prismaMock.refreshSession.updateMany).not.toHaveBeenCalled();
    expect(sendMemberNotice).not.toHaveBeenCalled();
  });

  it('reactivating clears the reason and sends the active again notice', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ ...MEMBER, status: 'SUSPENDED' });
    await changeMemberStatus('m1', 'ACTIVE', 'Documents received and checked', ACTOR);
    expect(prismaMock.member.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE', statusReason: null, reviewFlaggedAt: null }) }),
    );
    expect(sendMemberNotice).toHaveBeenCalledWith('REACTIVATED', expect.anything(), undefined);
  });

  it('rejects a short reason with 422 before touching the database', async () => {
    await expect(changeMemberStatus('m1', 'SUSPENDED', 'short', ACTOR)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prismaMock.member.update).not.toHaveBeenCalled();
  });

  it('refuses SUSPENDED to INACTIVE with 409', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ ...MEMBER, status: 'SUSPENDED' });
    await expect(changeMemberStatus('m1', 'INACTIVE', 'Not allowed route here', ACTOR)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('404 for an unknown member', async () => {
    prismaMock.member.findUnique.mockResolvedValue(null);
    await expect(changeMemberStatus('nope', 'INACTIVE', 'Reason long enough', ACTOR)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('deleteMember', () => {
  it('refuses unless the member is suspended', async () => {
    await expect(deleteMember('m1', 'Cleanup after suspension', ACTOR)).rejects.toMatchObject({ code: 'MEMBER_NOT_SUSPENDED' });
  });

  it('hard deletes a suspended member with no orders and disables the owner login', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ ...MEMBER, status: 'SUSPENDED' });
    prismaMock.orderItem.count.mockResolvedValue(0);
    prismaMock.member.delete.mockResolvedValue({});
    prismaMock.user.update.mockResolvedValue({});
    const result = await deleteMember('m1', 'Cleanup after suspension', ACTOR);
    expect(result.outcome).toBe('DELETED');
    expect(prismaMock.member.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: 'owner-1' }, data: { status: 'inactive' } });
  });

  it('archives a suspended member that has orders', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ ...MEMBER, status: 'SUSPENDED' });
    prismaMock.orderItem.count.mockResolvedValue(3);
    const result = await deleteMember('m1', 'Cleanup after suspension', ACTOR);
    expect(result.outcome).toBe('ARCHIVED');
    expect(prismaMock.member.delete).not.toHaveBeenCalled();
    expect(prismaMock.member.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ARCHIVED' }) }),
    );
  });
});
```

- [ ] **Step 2: Run, expect FAIL. Implement `member-status.service.ts`**

```ts
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { Prisma } from '../generated/prisma-client';
import { writeAuditLog } from './audit.service';
import { clearMemberAccessCache } from './member-access.service';
import { sendMemberNotice } from './member-notice.service';
import {
  assertTransition,
  REASON_MAX,
  REASON_MIN,
  type MemberStatusValue,
  type SettableMemberStatus,
} from './member-status-machine';

export interface StatusActor {
  userId: string;
  ip?: string;
  userAgent?: string;
}

const MEMBER_SELECT = {
  id: true,
  status: true,
  ownerUserId: true,
  businessName: true,
  owner: { select: { name: true, email: true, phone: true } },
} as const;

function validReason(raw: string | undefined): string {
  const reason = (raw ?? '').trim();
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
    throw new ApiError('VALIDATION_ERROR', `Enter a reason of ${REASON_MIN} to ${REASON_MAX} characters.`, {
      fields: { reason: `Use ${REASON_MIN} to ${REASON_MAX} characters.` },
    });
  }
  return reason;
}

export async function changeMemberStatus(
  memberId: string,
  to: SettableMemberStatus,
  rawReason: string,
  actor: StatusActor,
): Promise<{ from: MemberStatusValue; to: SettableMemberStatus }> {
  const reason = validReason(rawReason);
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: MEMBER_SELECT });
  if (!member) throw new ApiError('NOT_FOUND', 'Member not found');
  const from = member.status as MemberStatusValue;
  assertTransition(from, to);

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.member.update({
      where: { id: memberId },
      data: {
        status: to,
        statusReason: to === 'ACTIVE' ? null : reason,
        statusChangedAt: now,
        statusChangedByUserId: actor.userId,
        ...(to === 'ACTIVE' ? { reviewFlaggedAt: null } : {}),
      },
    });
    await tx.memberStatusHistory.create({
      data: { memberId, fromStatus: from, toStatus: to, reason, actorUserId: actor.userId },
    });
    if (to === 'SUSPENDED' && member.ownerUserId) {
      await tx.refreshSession.updateMany({
        where: { userId: member.ownerUserId, revokedAt: null },
        data: { revokedAt: now },
      });
    }
  });

  if (member.ownerUserId) clearMemberAccessCache(member.ownerUserId);

  await writeAuditLog({
    actorUserId: actor.userId,
    action: 'member.status.changed',
    targetType: 'Member',
    targetId: memberId,
    before: { status: from },
    after: { status: to, reason },
    ip: actor.ip,
    userAgent: actor.userAgent,
  });

  const target = { name: member.owner?.name, email: member.owner?.email, phone: member.owner?.phone };
  if (to === 'SUSPENDED') {
    await sendMemberNotice('SUSPENDED', target, reason);
  } else if (to === 'ACTIVE' && from !== 'ACTIVE') {
    await sendMemberNotice('REACTIVATED', target, undefined);
  }

  return { from, to };
}

export async function deleteMember(
  memberId: string,
  rawReason: string,
  actor: StatusActor,
): Promise<{ outcome: 'DELETED' | 'ARCHIVED' }> {
  const reason = validReason(rawReason);
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: MEMBER_SELECT });
  if (!member) throw new ApiError('NOT_FOUND', 'Member not found');
  if (member.status !== 'SUSPENDED') {
    throw new ApiError('MEMBER_NOT_SUSPENDED', 'Suspend this member before deleting. The journey is Inactive, then Suspended, then Delete.');
  }

  const orderLines = await prisma.orderItem.count({ where: { vendorId: memberId } });
  let outcome: 'DELETED' | 'ARCHIVED' = orderLines > 0 ? 'ARCHIVED' : 'DELETED';

  const archive = async () => {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.member.update({
        where: { id: memberId },
        data: { status: 'ARCHIVED', archivedAt: now, statusReason: reason, statusChangedAt: now, statusChangedByUserId: actor.userId },
      });
      await tx.memberStatusHistory.create({
        data: { memberId, fromStatus: 'SUSPENDED', toStatus: 'ARCHIVED', reason, actorUserId: actor.userId },
      });
    });
  };

  if (outcome === 'ARCHIVED') {
    await archive();
  } else {
    try {
      await prisma.member.delete({ where: { id: memberId } });
      if (member.ownerUserId) {
        await prisma.user.update({ where: { id: member.ownerUserId }, data: { status: 'inactive' } });
      }
    } catch (err) {
      // Orders carts or other rows still point at the member: keep the records, hide the member.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        outcome = 'ARCHIVED';
        await archive();
      } else {
        throw err;
      }
    }
  }

  if (member.ownerUserId) clearMemberAccessCache(member.ownerUserId);
  await writeAuditLog({
    actorUserId: actor.userId,
    action: outcome === 'DELETED' ? 'member.deleted' : 'member.archived',
    targetType: 'Member',
    targetId: memberId,
    before: { status: 'SUSPENDED' },
    after: { outcome, reason },
    ip: actor.ip,
    userAgent: actor.userAgent,
  });
  return { outcome };
}
```

- [ ] **Step 3: Run, expect PASS. Commit**

```bash
cd apps/msd-api && npx vitest run src/services/member-status.service.test.ts
git add apps/msd-api/src/services/member-status.service.ts apps/msd-api/src/services/member-status.service.test.ts
git commit -m "feat(msd-api): Add member status change, delete and archive"
```

---

### Task 9: Document numbers and field crypto

**Files:** Create `apps/msd-api/src/lib/document-number.ts`, `.test.ts`, `field-crypto.ts`, `field-crypto.test.ts`.

- [ ] **Step 1: Write the failing test `document-number.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import {
  normalizeDocumentNumber,
  isValidDocumentNumber,
  maskDocumentNumber,
  verhoeffCheckDigit,
} from './document-number';

const AADHAAR_BASE = '23456789012';
const AADHAAR = AADHAAR_BASE + verhoeffCheckDigit(AADHAAR_BASE);

describe('document numbers', () => {
  it('normalises spaces, hyphens and case', () => {
    expect(normalizeDocumentNumber('PAN', ' abcde-1234 f ')).toBe('ABCDE1234F');
    expect(normalizeDocumentNumber('AADHAAR', '2345 6789 0123')).toBe('234567890123');
  });

  it('accepts a valid PAN and rejects a malformed one', () => {
    expect(isValidDocumentNumber('PAN', 'ABCDE1234F')).toBe(true);
    expect(isValidDocumentNumber('PAN', 'ABCDE12345')).toBe(false);
  });

  it('accepts a valid GST number and rejects a bad state code', () => {
    expect(isValidDocumentNumber('GST', '27ABCDE1234F1Z5')).toBe(true);
    expect(isValidDocumentNumber('GST', '99ABCDE1234F1Z5')).toBe(false);
    expect(isValidDocumentNumber('GST', '27ABCDE1234F1Y5')).toBe(false);
  });

  it('accepts an Aadhaar that passes the Verhoeff check and rejects a one digit change', () => {
    expect(isValidDocumentNumber('AADHAAR', AADHAAR)).toBe(true);
    const last = Number(AADHAAR.slice(-1));
    const broken = AADHAAR.slice(0, -1) + String((last + 1) % 10);
    expect(isValidDocumentNumber('AADHAAR', broken)).toBe(false);
  });

  it('rejects an Aadhaar that starts with 0 or 1', () => {
    expect(isValidDocumentNumber('AADHAAR', '123456789012')).toBe(false);
  });

  it('masks Aadhaar and PAN, and leaves GST readable', () => {
    expect(maskDocumentNumber('AADHAAR', '234567890123')).toBe('XXXX XXXX 0123');
    expect(maskDocumentNumber('PAN', 'ABCDE1234F')).toBe('ABXXXXX34F');
    expect(maskDocumentNumber('GST', '27ABCDE1234F1Z5')).toBe('27ABCDE1234F1Z5');
  });
});
```

- [ ] **Step 2: Implement `document-number.ts`**

```ts
export type DocumentTypeKey = 'GST' | 'PAN' | 'AADHAAR';

const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
const GST_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[A-Z\d]$/;
const AADHAAR_RE = /^[2-9]\d{11}$/;

const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

function verhoeffValid(num: string): boolean {
  let c = 0;
  num
    .split('')
    .reverse()
    .map(Number)
    .forEach((d, i) => {
      c = D[c][P[i % 8][d]];
    });
  return c === 0;
}

/** Check digit to append to an 11 digit base so the 12 digit result passes `verhoeffValid`. */
export function verhoeffCheckDigit(base: string): number {
  let c = 0;
  base
    .split('')
    .reverse()
    .map(Number)
    .forEach((d, i) => {
      c = D[c][P[(i + 1) % 8][d]];
    });
  return INV[c];
}

export function normalizeDocumentNumber(_type: DocumentTypeKey, raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

export function isValidDocumentNumber(type: DocumentTypeKey, normalized: string): boolean {
  if (type === 'PAN') return PAN_RE.test(normalized);
  if (type === 'GST') {
    if (!GST_RE.test(normalized)) return false;
    const state = Number(normalized.slice(0, 2));
    return state >= 1 && state <= 38;
  }
  return AADHAAR_RE.test(normalized) && verhoeffValid(normalized);
}

export function maskDocumentNumber(type: DocumentTypeKey, normalized: string): string {
  if (type === 'AADHAAR') return `XXXX XXXX ${normalized.slice(-4)}`;
  if (type === 'PAN') return `${normalized.slice(0, 2)}XXXXX${normalized.slice(-3)}`;
  return normalized;
}
```

- [ ] **Step 3: Write the failing test `field-crypto.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { randomBytes } from 'crypto';

const KEY = randomBytes(32).toString('base64');
vi.mock('../config/env', () => ({ env: { fieldEncryptionKey: KEY, docHashPepper: 'pepper-1' } }));

import { encryptField, decryptField, hashDocumentNumber } from './field-crypto';

describe('field crypto', () => {
  it('round trips and never stores the plain value', () => {
    const cipher = encryptField('234567890123');
    expect(cipher).not.toContain('234567890123');
    expect(decryptField(cipher as string)).toBe('234567890123');
  });

  it('uses a fresh IV, so equal inputs give different ciphertext', () => {
    expect(encryptField('same')).not.toBe(encryptField('same'));
  });

  it('refuses a tampered payload', () => {
    const cipher = encryptField('secret') as string;
    const parts = cipher.split(':');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(() => decryptField(parts.join(':'))).toThrow();
  });

  it('hashes deterministically and differently per document type', () => {
    expect(hashDocumentNumber('PAN', 'ABCDE1234F')).toBe(hashDocumentNumber('PAN', 'ABCDE1234F'));
    expect(hashDocumentNumber('PAN', 'ABCDE1234F')).not.toBe(hashDocumentNumber('GST', 'ABCDE1234F'));
  });
});
```

- [ ] **Step 4: Implement `field-crypto.ts`**

```ts
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';
import { env } from '../config/env';

function key(): Buffer | null {
  if (!env.fieldEncryptionKey) return null;
  const buf = Buffer.from(env.fieldEncryptionKey, 'base64');
  if (buf.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY must decode to 32 bytes');
  return buf;
}

/** AES-256-GCM. Returns `v1:iv:tag:ciphertext` (base64), or null when no key is configured. */
export function encryptField(plain: string): string | null {
  const k = key();
  if (!k) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', k, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

export function decryptField(payload: string): string {
  const k = key();
  if (!k) throw new Error('FIELD_ENCRYPTION_KEY is not configured');
  const [version, iv, tag, ciphertext] = payload.split(':');
  if (version !== 'v1') throw new Error('Unsupported ciphertext version');
  const decipher = createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

/** HMAC-SHA256 of type and number. Null when no pepper is configured (duplicate check skipped). */
export function hashDocumentNumber(type: string, normalized: string): string | null {
  if (!env.docHashPepper) return null;
  return createHmac('sha256', env.docHashPepper).update(`${type}:${normalized}`).digest('hex');
}
```

- [ ] **Step 5: Run both tests, expect PASS. Commit**

```bash
cd apps/msd-api && npx vitest run src/lib/document-number.test.ts src/lib/field-crypto.test.ts
git add apps/msd-api/src/lib/document-number.ts apps/msd-api/src/lib/document-number.test.ts apps/msd-api/src/lib/field-crypto.ts apps/msd-api/src/lib/field-crypto.test.ts
git commit -m "feat(msd-api): Add document number validation and field crypto"
```

---

### Task 10: Member document service

**Files:**
- Rename: `apps/msd-api/src/services/vendor-document.service.ts` to `member-document.service.ts` (use `git mv`)
- Create: `apps/msd-api/src/services/member-document.service.test.ts`
- Modify: `apps/msd-api/src/routes/vendors.routes.ts` (import path), `apps/msd-api/src/routes/vendor-kyc-documents.routes.test.ts`

- [ ] **Step 1: Move the file**

```bash
git mv apps/msd-api/src/services/vendor-document.service.ts apps/msd-api/src/services/member-document.service.ts
sed -i "s#../services/vendor-document.service#../services/member-document.service#; s#vendorDocumentService#memberDocumentService#g" apps/msd-api/src/routes/vendors.routes.ts
grep -rn "vendor-document.service" apps/msd-api/src | head
```

Update any remaining import (including `vi.mock('../services/vendor-document.service'...)` in tests) to the new path.

- [ ] **Step 2: Write the failing test `member-document.service.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomBytes } from 'crypto';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});
vi.mock('../config/env', () => ({
  env: { fieldEncryptionKey: randomBytes(32).toString('base64'), docHashPepper: 'pepper' },
}));
vi.mock('../lib/media-storage', () => ({
  writeMediaFile: vi.fn().mockResolvedValue({ storageKey: 'vendor-documents/m1/file.pdf', sizeBytes: 10 }),
  deleteMediaFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./media-validation.service', () => ({
  validateMediaFile: vi.fn().mockReturnValue({ extension: 'pdf', sniffedType: 'application/pdf' }),
}));

import { prisma } from '../lib/prisma';
import {
  documentsSummary,
  listMemberDocuments,
  uploadMemberDocument,
  reviewMemberDocument,
} from './member-document.service';

const prismaMock = vi.mocked(prisma, true);
const FILE = { buffer: Buffer.from('%PDF-1.4'), originalname: 'pan.pdf' };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.memberDocument.findUnique.mockResolvedValue(null);
  prismaMock.memberDocument.findFirst.mockResolvedValue(null);
});

describe('documentsSummary', () => {
  const NOW = new Date('2026-10-20T00:00:00Z');

  it('is complete when Aadhaar, PAN and GST are all submitted or approved', () => {
    const summary = documentsSummary(
      [
        { documentType: 'AADHAAR', status: 'APPROVED' },
        { documentType: 'PAN', status: 'SUBMITTED' },
        { documentType: 'GST', status: 'SUBMITTED' },
      ],
      new Date('2026-10-01T00:00:00Z'),
      NOW,
    );
    expect(summary).toMatchObject({ complete: true, missing: [], rejected: [], overdue: false });
  });

  it('lists what is missing and what was rejected, and marks overdue after the due date', () => {
    const summary = documentsSummary(
      [{ documentType: 'PAN', status: 'REJECTED' }],
      new Date('2026-10-01T00:00:00Z'),
      NOW,
    );
    expect(summary.complete).toBe(false);
    expect(summary.missing).toEqual(['AADHAAR', 'GST']);
    expect(summary.rejected).toEqual(['PAN']);
    expect(summary.overdue).toBe(true);
  });
});

describe('listMemberDocuments', () => {
  const ROW = {
    id: 'd1', documentType: 'PAN', status: 'SUBMITTED', numberMasked: 'ABXXXXX34F', storageKey: 'k', originalFilename: 'pan.pdf',
    mimeType: 'application/pdf', sizeBytes: 10, rejectionReason: null, reviewedAt: null, uploadedOnBehalf: true,
    uploadedByUserId: 'admin-1', createdAt: new Date(), updatedAt: new Date(), numberHash: 'h', numberEncrypted: 'c',
  };

  it('never returns hash or encrypted number, and hides file keys from viewers who cannot open files', async () => {
    prismaMock.memberDocument.findMany.mockResolvedValue([ROW]);
    const [row] = await listMemberDocuments('m1', { includeFiles: false });
    expect(row).not.toHaveProperty('numberHash');
    expect(row).not.toHaveProperty('numberEncrypted');
    expect(row).not.toHaveProperty('storageKey');
    expect(row).not.toHaveProperty('originalFilename');
    expect(row.numberMasked).toBe('ABXXXXX34F');
  });

  it('includes the file key for viewers who can open files', async () => {
    prismaMock.memberDocument.findMany.mockResolvedValue([ROW]);
    const [row] = await listMemberDocuments('m1', { includeFiles: true });
    expect(row.storageKey).toBe('k');
  });
});

describe('uploadMemberDocument', () => {
  it('stores masked number, hash and ciphertext, marks on behalf and resets review to SUBMITTED', async () => {
    prismaMock.memberDocument.upsert.mockResolvedValue({ id: 'd1' });
    await uploadMemberDocument({
      memberId: 'm1', documentType: 'PAN', file: FILE, number: 'abcde 1234 f', actorUserId: 'admin-1', onBehalf: true,
    });
    const arg = prismaMock.memberDocument.upsert.mock.calls[0][0];
    expect(arg.create).toMatchObject({ numberMasked: 'ABXXXXX34F', uploadedOnBehalf: true, uploadedByUserId: 'admin-1', status: 'SUBMITTED' });
    expect(arg.create.numberHash).toMatch(/^[0-9a-f]{64}$/);
    expect(arg.create.numberEncrypted).toMatch(/^v1:/);
    expect(JSON.stringify(arg)).not.toContain('ABCDE1234F');
    expect(arg.update).toMatchObject({ status: 'SUBMITTED', rejectionReason: null, reviewedAt: null });
  });

  it('rejects an invalid number with 422', async () => {
    await expect(
      uploadMemberDocument({ memberId: 'm1', documentType: 'PAN', file: FILE, number: 'NOTAPAN', actorUserId: 'a', onBehalf: true }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prismaMock.memberDocument.upsert).not.toHaveBeenCalled();
  });

  it('rejects a number already used by another member with 409', async () => {
    prismaMock.memberDocument.findFirst.mockResolvedValue({ id: 'other', vendorId: 'm2' });
    await expect(
      uploadMemberDocument({ memberId: 'm1', documentType: 'PAN', file: FILE, number: 'ABCDE1234F', actorUserId: 'a', onBehalf: true }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_NUMBER_IN_USE' });
  });
});

describe('reviewMemberDocument', () => {
  it('approves a submitted document', async () => {
    prismaMock.memberDocument.findUnique.mockResolvedValue({ id: 'd1', status: 'SUBMITTED', vendorId: 'm1' });
    prismaMock.memberDocument.update.mockResolvedValue({ id: 'd1', status: 'APPROVED' });
    await reviewMemberDocument({ memberId: 'm1', documentType: 'PAN', decision: 'APPROVED', actorUserId: 'admin-1' });
    expect(prismaMock.memberDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED', reviewedByUserId: 'admin-1' }) }),
    );
  });

  it('requires a reason to reject', async () => {
    prismaMock.memberDocument.findUnique.mockResolvedValue({ id: 'd1', status: 'SUBMITTED', vendorId: 'm1' });
    await expect(
      reviewMemberDocument({ memberId: 'm1', documentType: 'PAN', decision: 'REJECTED', actorUserId: 'admin-1' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('409 when the document is not waiting for review', async () => {
    prismaMock.memberDocument.findUnique.mockResolvedValue({ id: 'd1', status: 'APPROVED', vendorId: 'm1' });
    await expect(
      reviewMemberDocument({ memberId: 'm1', documentType: 'PAN', decision: 'APPROVED', actorUserId: 'admin-1' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
```

- [ ] **Step 3: Run, expect FAIL. Replace the contents of `member-document.service.ts`**

```ts
import { prisma } from '../lib/prisma';
import { deleteMediaFile, writeMediaFile } from '../lib/media-storage';
import { validateMediaFile } from './media-validation.service';
import { ApiError } from '../lib/http';
import {
  isValidDocumentNumber,
  maskDocumentNumber,
  normalizeDocumentNumber,
  type DocumentTypeKey,
} from '../lib/document-number';
import { encryptField, hashDocumentNumber } from '../lib/field-crypto';
import { REASON_MAX } from './member-status-machine';
import type { MediaFile } from './media.service';

const STORAGE_SUBDIR = 'vendor-documents';
export const REQUIRED_DOCUMENT_TYPES: readonly DocumentTypeKey[] = ['AADHAAR', 'PAN', 'GST'];
const PROVIDED_STATUSES = ['SUBMITTED', 'APPROVED'];

export interface DocumentsSummary {
  complete: boolean;
  missing: DocumentTypeKey[];
  rejected: DocumentTypeKey[];
  dueAt: Date | null;
  overdue: boolean;
}

/** Pure. "Complete" means all three types are provided (submitted or approved). */
export function documentsSummary(
  docs: { documentType: string; status: string }[],
  dueAt: Date | null,
  now: Date = new Date(),
): DocumentsSummary {
  const byType = new Map(docs.map((d) => [d.documentType, d.status]));
  const missing = REQUIRED_DOCUMENT_TYPES.filter((t) => !byType.has(t));
  const rejected = REQUIRED_DOCUMENT_TYPES.filter((t) => byType.get(t) === 'REJECTED' || byType.get(t) === 'EXPIRED');
  const complete = REQUIRED_DOCUMENT_TYPES.every((t) => PROVIDED_STATUSES.includes(byType.get(t) ?? ''));
  return { complete, missing, rejected, dueAt, overdue: !complete && dueAt !== null && dueAt.getTime() < now.getTime() };
}

/**
 * The API shape. Hash and ciphertext never leave the server. File keys are returned only to
 * viewers who may open files (members:edit or members:approve); Support and Marketing see the
 * type, the masked number and the status only.
 */
export async function listMemberDocuments(memberId: string, opts: { includeFiles: boolean }) {
  const rows = await prisma.memberDocument.findMany({ where: { vendorId: memberId }, orderBy: { documentType: 'asc' } });
  return rows.map((row) => ({
    id: row.id,
    documentType: row.documentType,
    status: row.status,
    numberMasked: row.numberMasked,
    rejectionReason: row.rejectionReason,
    reviewedAt: row.reviewedAt,
    uploadedOnBehalf: row.uploadedOnBehalf,
    uploadedByUserId: row.uploadedByUserId,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(opts.includeFiles
      ? { storageKey: row.storageKey, originalFilename: row.originalFilename, mimeType: row.mimeType, sizeBytes: row.sizeBytes }
      : {}),
  }));
}

export interface UploadInput {
  memberId: string;
  documentType: DocumentTypeKey;
  file: MediaFile;
  /** The typed number. Optional: a file alone is still accepted, the checklist then shows no number. */
  number?: string;
  actorUserId: string;
  /** True when staff upload for the member. */
  onBehalf: boolean;
}

export async function uploadMemberDocument(input: UploadInput) {
  const { memberId, documentType } = input;

  let numberFields: { numberMasked: string; numberHash: string | null; numberEncrypted: string | null } | null = null;
  if (input.number && input.number.trim()) {
    const normalized = normalizeDocumentNumber(documentType, input.number);
    if (!isValidDocumentNumber(documentType, normalized)) {
      throw new ApiError('VALIDATION_ERROR', 'Enter a valid document number.', {
        fields: { number: `Enter a valid ${documentType === 'GST' ? 'GST' : documentType === 'PAN' ? 'PAN' : 'Aadhaar'} number.` },
      });
    }
    const numberHash = hashDocumentNumber(documentType, normalized);
    if (numberHash) {
      const taken = await prisma.memberDocument.findFirst({
        where: { documentType, numberHash, vendorId: { not: memberId } },
        select: { id: true },
      });
      if (taken) throw new ApiError('DOCUMENT_NUMBER_IN_USE', 'This document number already belongs to another member.');
    }
    numberFields = {
      numberMasked: maskDocumentNumber(documentType, normalized),
      numberHash,
      numberEncrypted: encryptField(normalized),
    };
  }

  const validated = validateMediaFile(input.file.buffer, 'document');
  const existing = await prisma.memberDocument.findUnique({
    where: { vendorId_documentType: { vendorId: memberId, documentType } },
  });
  const { storageKey, sizeBytes } = await writeMediaFile(STORAGE_SUBDIR, memberId, input.file.buffer, validated.extension);

  const fileFields = {
    storageKey,
    originalFilename: input.file.originalname || null,
    mimeType: validated.sniffedType,
    sizeBytes,
  };
  const provenance = { uploadedByUserId: input.actorUserId, uploadedOnBehalf: input.onBehalf };
  // A re-upload always goes back to review, even when it was approved or rejected before.
  const reset = { status: 'SUBMITTED' as const, rejectionReason: null, reviewedAt: null, reviewedByUserId: null };

  let upserted;
  try {
    upserted = await prisma.memberDocument.upsert({
      where: { vendorId_documentType: { vendorId: memberId, documentType } },
      create: { vendorId: memberId, documentType, ...fileFields, ...provenance, ...reset, ...(numberFields ?? {}) },
      update: { ...fileFields, ...provenance, ...reset, ...(numberFields ?? {}) },
    });
  } catch (err) {
    await deleteMediaFile(storageKey);
    throw err;
  }

  if (existing) {
    try {
      await deleteMediaFile(existing.storageKey);
    } catch (err) {
      console.error({ err, context: 'uploadMemberDocument: failed to delete old file', memberId, documentType });
    }
  }
  return upserted;
}

export async function deleteMemberDocument(memberId: string, documentType: DocumentTypeKey) {
  const existing = await prisma.memberDocument.findUnique({
    where: { vendorId_documentType: { vendorId: memberId, documentType } },
  });
  if (!existing) throw new ApiError('NOT_FOUND', 'Document not found');
  if (existing.status === 'APPROVED') {
    throw new ApiError('CONFLICT', 'An approved document cannot be removed. Upload a new file to replace it.');
  }
  await prisma.memberDocument.delete({ where: { id: existing.id } });
  await deleteMediaFile(existing.storageKey);
}

export interface ReviewInput {
  memberId: string;
  documentType: DocumentTypeKey;
  decision: 'APPROVED' | 'REJECTED';
  reason?: string;
  actorUserId: string;
}

export async function reviewMemberDocument(input: ReviewInput) {
  const doc = await prisma.memberDocument.findUnique({
    where: { vendorId_documentType: { vendorId: input.memberId, documentType: input.documentType } },
  });
  if (!doc) throw new ApiError('NOT_FOUND', 'Document not found');
  if (doc.status !== 'SUBMITTED') {
    throw new ApiError('CONFLICT', 'Only a submitted document can be approved or rejected.');
  }
  const reason = (input.reason ?? '').trim();
  if (input.decision === 'REJECTED' && (reason.length < 10 || reason.length > REASON_MAX)) {
    throw new ApiError('VALIDATION_ERROR', 'Enter a rejection reason of 10 to 500 characters.', {
      fields: { reason: 'Use 10 to 500 characters.' },
    });
  }
  return prisma.memberDocument.update({
    where: { id: doc.id },
    data: {
      status: input.decision,
      rejectionReason: input.decision === 'REJECTED' ? reason : null,
      reviewedByUserId: input.actorUserId,
      reviewedAt: new Date(),
    },
  });
}

/* Wrappers keep the member self-service routes (/vendors/me/kyc-documents) unchanged. */
export async function listVendorDocuments(vendorId: string) {
  return listMemberDocuments(vendorId, { includeFiles: true });
}

export async function uploadVendorDocument(vendorId: string, documentType: DocumentTypeKey, file: MediaFile) {
  return uploadMemberDocument({ memberId: vendorId, documentType, file, actorUserId: '', onBehalf: false });
}

export async function deleteVendorDocument(vendorId: string, documentType: DocumentTypeKey) {
  return deleteMemberDocument(vendorId, documentType);
}
```

- [ ] **Step 4: Fix the self-service upload to record who uploaded**

In `vendors.routes.ts` the `/me/kyc-documents/:documentType` POST handler calls `memberDocumentService.uploadVendorDocument(vendor.id, ..., {...})`. Replace that call with:

```ts
      const document = await memberDocumentService.uploadMemberDocument({
        memberId: vendor.id,
        documentType: req.params.documentType as VendorDocumentType,
        file: { buffer: req.file.buffer, originalname: req.file.originalname },
        number: typeof req.body?.number === 'string' ? req.body.number : undefined,
        actorUserId: req.user!.sub,
        onBehalf: false,
      });
```

Then remove the `uploadVendorDocument` wrapper from the service if nothing else calls it (`grep -rn uploadVendorDocument apps/msd-api/src`).

- [ ] **Step 5: Run `member-document.service.test.ts` and `vendor-kyc-documents.routes.test.ts`; fix the route test mocks** (`vendorDocument` to `memberDocument`, service path). Expect PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/msd-api/src/services apps/msd-api/src/routes
git commit -m "feat(msd-api): Add member document checklist, review and masking"
```

---

### Task 11: Member service changes (create, list filters, summary, remove approval)

**Files:**
- Modify: `apps/msd-api/src/services/vendor.service.ts`, `apps/msd-api/src/schemas/vendor.schema.ts`, `apps/msd-api/src/routes/vendor-public.routes.ts`, `apps/msd-api/src/services/vendor.service.test.ts`
- Create: `apps/msd-api/src/services/member-create.test.ts`

- [ ] **Step 1: Add schemas to `vendor.schema.ts`** (append near `VendorStatusUpdateSchema`; replace the old `VendorStatusUpdateSchema`, `VendorRejectSchema` and `VendorKycReviewSchema`)

```ts
export const MemberListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().max(200).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED']).optional(),
  documents: z.enum(['incomplete']).optional(),
  reviewFlag: z.enum(['true']).optional(),
});

/** The short Add member form. Everything else is completed later on the Profile tab. */
export const MemberCreateSchema = z
  .object({
    businessName: z.string().trim().min(1).max(200),
    ownerFirstName: z.string().trim().min(1).max(75),
    ownerLastName: z.string().trim().min(1).max(75),
    ownerEmail: z.string().trim().email().max(254),
    ownerMobile: z
      .string()
      .max(30)
      .transform((v) => normalizeIdentifier(v))
      .refine((v) => INDIA_MOBILE_REGEX.test(v), { message: 'Enter a valid 10-digit mobile number' }),
  })
  .strict()
  .openapi('MemberCreate');

export const MemberStatusChangeSchema = z
  .object({
    status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
    reason: z.string().trim().min(10).max(500),
  })
  .strict()
  .openapi('MemberStatusChange');

export const MemberDeleteSchema = z
  .object({ reason: z.string().trim().min(10).max(500) })
  .strict()
  .openapi('MemberDelete');

export const MemberDocumentReviewSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    reason: z.string().trim().max(500).optional(),
  })
  .strict()
  .openapi('MemberDocumentReview');
```

Delete `VendorRejectSchema`, `VendorStatusUpdateSchema`, `VendorKycReviewSchema` and their imports in `vendors.routes.ts` and `openapi/registry.ts` (Task 14 removes the registry entries).

- [ ] **Step 2: Write the failing test `member-create.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import { createMember } from './vendor.service';

const prismaMock = vi.mocked(prisma, true);
const INPUT = {
  businessName: 'Glow Studio',
  ownerFirstName: 'Asha',
  ownerLastName: 'Rao',
  ownerEmail: 'asha@glow.test',
  ownerMobile: '+919876543210',
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.findFirst.mockResolvedValue(null);
  prismaMock.user.create.mockResolvedValue({ id: 'u1' });
  prismaMock.role.findUnique.mockResolvedValue({ id: 'r-member', key: 'member' });
  prismaMock.userRole.upsert.mockResolvedValue({});
  prismaMock.member.findUnique.mockResolvedValue(null);
  prismaMock.member.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...data,
    owner: { id: 'u1', name: 'Asha Rao', email: INPUT.ownerEmail, phone: INPUT.ownerMobile, status: 'active', roles: [] },
    documents: [],
    mediaImages: [],
    mediaVideo: null,
    _count: { branches: 0, deals: 0, products: 0, therapists: 0 },
  }));
});

describe('createMember', () => {
  it('creates an ACTIVE member with the documents timer and the member role', async () => {
    const before = Date.now();
    const member = await createMember(INPUT, 'admin-1');
    const data = prismaMock.member.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'ACTIVE', ownerUserId: 'u1', createdByUserId: 'admin-1', businessName: 'Glow Studio' });
    const due = (data.documentsDueAt as Date).getTime();
    expect(due).toBeGreaterThanOrEqual(before + 14 * 24 * 3600 * 1000 - 5000);
    expect(due).toBeLessThanOrEqual(Date.now() + 14 * 24 * 3600 * 1000 + 5000);
    expect(prismaMock.userRole.upsert).toHaveBeenCalled();
    expect(member.status).toBe('ACTIVE');
  });

  it('409 names the field that is already taken', async () => {
    prismaMock.user.findFirst.mockResolvedValueOnce({ id: 'x' }).mockResolvedValueOnce(null);
    await expect(createMember(INPUT, 'admin-1')).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { fields: { ownerEmail: expect.any(String) } },
    });
    expect(prismaMock.member.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run, expect FAIL. Edit `vendor.service.ts`**

1. Add imports: `import { documentsSummary } from './member-document.service';` and `import type { MemberCreateSchema } from '../schemas/vendor.schema';` plus `type MemberCreateInput = z.infer<typeof MemberCreateSchema>;`.

2. Replace `heuristicInitialStatus` and its call. Delete the function and in `createVendor` call `buildAndInsertVendor(input, ownerUserId, createdByUserId, 'ACTIVE')`.

3. In `buildAndInsertVendor`, extend the `data` object with `documentsDueAt` and `statusChangedAt`:

```ts
      status,
      createdByUserId,
      statusChangedAt: new Date(),
      documentsDueAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
```

4. Add `createMember` below `createVendor`:

```ts
/**
 * The Add member form. Staff create every member (decision D9). A brand-new owner login is always
 * created, status is ACTIVE from the first second, and the 14 day documents timer starts here.
 */
export async function createMember(input: MemberCreateInput, createdByUserId: string) {
  const availability = await checkVendorOwnerAvailability(input.ownerEmail, input.ownerMobile);
  if (!availability.available) {
    const fields: Record<string, string> = {};
    if (availability.conflicts.includes('email')) fields.ownerEmail = 'This email already belongs to another account.';
    if (availability.conflicts.includes('phone')) fields.ownerMobile = 'This mobile number already belongs to another account.';
    throw new ApiError('CONFLICT', 'A user with this email or mobile number already exists.', { fields });
  }
  const ownerUserId = await createVendorOwner(
    input.ownerEmail,
    input.ownerMobile,
    `${input.ownerFirstName} ${input.ownerLastName}`.trim(),
  );
  await ensureVendorRoleAssigned(ownerUserId);
  return buildAndInsertVendor(
    {
      businessName: input.businessName,
      ownerFirstName: input.ownerFirstName,
      ownerLastName: input.ownerLastName,
      ownerEmail: input.ownerEmail,
      ownerMobile: input.ownerMobile,
      businessEmail: input.ownerEmail,
      businessPhone: input.ownerMobile,
      contactPerson: `${input.ownerFirstName} ${input.ownerLastName}`.trim(),
    },
    ownerUserId,
    createdByUserId,
    'ACTIVE',
  );
}
```

5. Delete `approveVendor`, `rejectVendor`, `reviewKyc`, `submitForVerification`, `registerPublicVendor`, `createSelfVendor`, `setVendorStatus`, `deleteVendor` (status and delete now live in `member-status.service.ts`). Remove their imports and `KYC_RELEVANT_FIELDS` if now unused. Delete the matching tests in `vendor.service.test.ts`.

6. In `serializeVendor` add the documents summary:

```ts
function serializeVendor<T extends { owner: RawOwner | null; documents?: { documentType: string; status: string }[]; documentsDueAt?: Date | null }>(vendor: T) {
  return {
    ...vendor,
    owner: vendor.owner ? { ...vendor.owner, roles: vendor.owner.roles.map((r) => r.role) } : null,
    documentsSummary: documentsSummary(vendor.documents ?? [], vendor.documentsDueAt ?? null),
  };
}
```

7. Replace `listVendors` with filters:

```ts
export async function listVendors(opts: {
  page: number;
  pageSize: number;
  search?: string;
  status?: MemberStatus;
  documents?: 'incomplete';
  reviewFlag?: 'true';
}) {
  const providedStatuses: MemberDocumentStatus[] = ['SUBMITTED', 'APPROVED'];
  const where: Prisma.MemberWhereInput = {
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.reviewFlag ? { reviewFlaggedAt: { not: null } } : {}),
    ...(opts.documents === 'incomplete'
      ? {
          OR: (['AADHAAR', 'PAN', 'GST'] as const).map((documentType) => ({
            documents: { none: { documentType, status: { in: providedStatuses } } },
          })),
        }
      : {}),
    ...(opts.search
      ? {
          AND: [
            {
              OR: [
                { businessName: { contains: opts.search, mode: 'insensitive' as const } },
                { businessEmail: { contains: opts.search, mode: 'insensitive' as const } },
                { ownerMobile: { contains: opts.search } },
              ],
            },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.member.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: OWNER_INCLUDE,
    }),
    prisma.member.count({ where }),
  ]);
  return { items: items.map(serializeVendor), total };
}
```

Add `type MemberDocumentStatus` to the existing `Prisma` client import line.

8. Make the public registration route refuse. Replace the body of the handler in `vendor-public.routes.ts`:

```ts
router.post('/register', vendorPublicRegisterRateLimiter, async (_req, _res, next) => {
  next(
    new ApiError(
      'FORBIDDEN',
      'Member accounts are created by our team. Please contact us and we will set up your account.',
    ),
  );
});
```

and fix the imports (`ApiError` from `../lib/http`; remove unused ones). Update its test to expect 403.

- [ ] **Step 4: Run `member-create.test.ts`, `vendor.service.test.ts`, `vendor-public.routes.test.ts`, `tsc`, expect PASS.** Delete tests that exercised the removed functions.

- [ ] **Step 5: Commit**

```bash
git add apps/msd-api/src
git commit -m "feat(msd-api): Create members Active with a documents timer"
```

---

### Task 12: Activity service

**Files:** Create `apps/msd-api/src/services/member-activity.service.ts` and `.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import { getStatusHistory, getMemberActivity } from './member-activity.service';

const prismaMock = vi.mocked(prisma, true);

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.memberStatusHistory.findMany.mockResolvedValue([
    { id: 'h1', fromStatus: 'ACTIVE', toStatus: 'SUSPENDED', reason: 'Documents not completed', actorUserId: 'a1', createdAt: new Date('2026-10-10T00:00:00Z') },
  ]);
  prismaMock.user.findMany.mockResolvedValue([{ id: 'a1', name: 'Admin One' }]);
  prismaMock.memberDocument.findMany.mockResolvedValue([
    { documentType: 'PAN', status: 'REJECTED', createdAt: new Date('2026-10-02T00:00:00Z'), reviewedAt: new Date('2026-10-05T00:00:00Z'), rejectionReason: 'Blurry scan', uploadedOnBehalf: true },
  ]);
});

describe('member activity', () => {
  it('status history carries the actor name', async () => {
    const [row] = await getStatusHistory('m1');
    expect(row).toMatchObject({ fromStatus: 'ACTIVE', toStatus: 'SUSPENDED', actorName: 'Admin One' });
  });

  it('activity merges status changes and document events, newest first', async () => {
    const items = await getMemberActivity('m1');
    expect(items.map((i) => i.kind)).toEqual(['status', 'document', 'document']);
    expect(items[0].at.getTime()).toBeGreaterThan(items[1].at.getTime());
  });
});
```

- [ ] **Step 2: Implement `member-activity.service.ts`**

```ts
import { prisma } from '../lib/prisma';

export async function getStatusHistory(memberId: string) {
  const rows = await prisma.memberStatusHistory.findMany({
    where: { memberId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const actorIds = [...new Set(rows.map((r) => r.actorUserId).filter((id): id is string => Boolean(id)))];
  const actors = actorIds.length > 0 ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
  const nameById = new Map(actors.map((a) => [a.id, a.name]));
  return rows.map((r) => ({
    id: r.id,
    fromStatus: r.fromStatus,
    toStatus: r.toStatus,
    reason: r.reason,
    actorUserId: r.actorUserId,
    actorName: r.actorUserId ? nameById.get(r.actorUserId) ?? null : null,
    createdAt: r.createdAt,
  }));
}

export interface ActivityItem {
  kind: 'status' | 'document';
  at: Date;
  summary: string;
  detail: string | null;
}

export async function getMemberActivity(memberId: string): Promise<ActivityItem[]> {
  const [history, docs] = await Promise.all([
    getStatusHistory(memberId),
    prisma.memberDocument.findMany({
      where: { vendorId: memberId },
      select: { documentType: true, status: true, createdAt: true, reviewedAt: true, rejectionReason: true, uploadedOnBehalf: true },
    }),
  ]);

  const items: ActivityItem[] = history.map((h) => ({
    kind: 'status',
    at: h.createdAt,
    summary: `Status changed from ${h.fromStatus} to ${h.toStatus}${h.actorName ? ` by ${h.actorName}` : ''}`,
    detail: h.reason,
  }));

  for (const d of docs) {
    items.push({
      kind: 'document',
      at: d.createdAt,
      summary: `${d.documentType} document uploaded${d.uploadedOnBehalf ? ' by staff for the member' : ''}`,
      detail: null,
    });
    if (d.reviewedAt) {
      items.push({
        kind: 'document',
        at: d.reviewedAt,
        summary: `${d.documentType} document ${d.status === 'APPROVED' ? 'approved' : 'rejected'}`,
        detail: d.rejectionReason,
      });
    }
  }
  return items.sort((a, b) => b.at.getTime() - a.at.getTime());
}
```

- [ ] **Step 3: Run, expect PASS. Commit**

```bash
git add apps/msd-api/src/services/member-activity.service.ts apps/msd-api/src/services/member-activity.service.test.ts
git commit -m "feat(msd-api): Add member status history and activity"
```

---

### Task 13: `/members` routes and the `/vendors` alias

**Files:**
- Create: `apps/msd-api/src/lib/deprecation.ts`, `apps/msd-api/src/routes/member-admin.routes.ts`, `apps/msd-api/src/routes/members.routes.ts`, `apps/msd-api/src/routes/members.routes.test.ts`
- Modify: `apps/msd-api/src/routes/vendors.routes.ts`, `apps/msd-api/src/app.ts`

- [ ] **Step 1: Create `lib/deprecation.ts`**

```ts
import type { RequestHandler } from 'express';

/** Marks a legacy path. The successor prefix is shown in the Link header. */
export function deprecatedAlias(successorPrefix: string): RequestHandler {
  return (_req, res, next) => {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Link', `<${successorPrefix}>; rel="successor-version"`);
    next();
  };
}
```

- [ ] **Step 2: Create `routes/member-admin.routes.ts`**

```ts
import { Router, type Request, type RequestHandler } from 'express';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { UuidParamSchema } from '../schemas/common.schema';
import {
  MemberCreateSchema,
  MemberListQuerySchema,
  MemberStatusChangeSchema,
  MemberDeleteSchema,
  MemberDocumentReviewSchema,
  VendorUpdateSchema,
  VendorDocumentAdminParamSchema,
} from '../schemas/vendor.schema';
import { documentUpload } from '../lib/media-upload.middleware';
import { deprecatedAlias } from '../lib/deprecation';
import { resolveGrantedPermissionKeys } from '../services/permission-resolver.service';
import { can } from '@skylabs-monorepo/shared-permissions';
import * as vendorService from '../services/vendor.service';
import * as memberDocumentService from '../services/member-document.service';
import * as memberStatusService from '../services/member-status.service';
import * as memberActivityService from '../services/member-activity.service';
import { sendMemberNotice } from '../services/member-notice.service';
import { prisma } from '../lib/prisma';
import { writeAuditLog } from '../services/audit.service';
import { sendData, ApiError } from '../lib/http';
import type { VendorDocumentType } from '../generated/prisma-client';

function meta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

/**
 * The admin member routes, built once and mounted twice: canonical at `/members`, and as a
 * deprecated alias at `/vendors` for one release so a frontend and API deployed a few minutes
 * apart keep working.
 */
export function buildMemberAdminRoutes(opts: { deprecated: boolean }): Router {
  const router = Router();
  const mark: RequestHandler = opts.deprecated
    ? deprecatedAlias('/api/v1/members')
    : (_req, _res, next) => next();

  router.get('/', mark, requirePermission('members', 'view'), validateQuery(MemberListQuerySchema), async (req, res, next) => {
    try {
      const q = req.validatedQuery as ReturnType<typeof MemberListQuerySchema.parse>;
      const { items, total } = await vendorService.listVendors(q);
      sendData(res, await vendorService.attachLiveCounts(items), { meta: { total, page: q.page, pageSize: q.pageSize } });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', mark, requirePermission('members', 'create'), validateBody(MemberCreateSchema), async (req, res, next) => {
    try {
      const member = await vendorService.createMember(req.body, req.user!.sub);
      const notice = await sendMemberNotice('WELCOME', {
        name: member.owner?.name,
        email: member.owner?.email,
        phone: member.owner?.phone,
      });
      if (notice.email || notice.sms) {
        await prisma.member.update({ where: { id: member.id }, data: { welcomeSentAt: new Date() } });
      }
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'member.created',
        targetType: 'Member',
        targetId: member.id,
        after: { id: member.id, businessName: member.businessName },
        ...meta(req),
      });
      sendData(res, member, { status: 201 });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', mark, requirePermission('members', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
    try {
      const member = await vendorService.getVendorOrThrow(req.params.id);
      const [withCounts] = await vendorService.attachLiveCounts([member]);
      sendData(res, withCounts);
    } catch (err) {
      next(err);
    }
  });

  router.patch(
    '/:id',
    mark,
    requirePermission('members', 'edit'),
    validateParams(UuidParamSchema),
    validateBody(VendorUpdateSchema),
    async (req, res, next) => {
      try {
        const before = await vendorService.getVendorOrThrow(req.params.id);
        const after = await vendorService.updateVendor(req.params.id, req.body);
        await writeAuditLog({
          actorUserId: req.user!.sub,
          action: 'member.updated',
          targetType: 'Member',
          targetId: after.id,
          before,
          after,
          ...meta(req),
        });
        sendData(res, after);
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch(
    '/:id/status',
    mark,
    requirePermission('members', 'status_change'),
    validateParams(UuidParamSchema),
    validateBody(MemberStatusChangeSchema),
    async (req, res, next) => {
      try {
        await memberStatusService.changeMemberStatus(req.params.id, req.body.status, req.body.reason, {
          userId: req.user!.sub,
          ...meta(req),
        });
        sendData(res, await vendorService.getVendorOrThrow(req.params.id));
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete(
    '/:id',
    mark,
    requirePermission('members', 'delete'),
    validateParams(UuidParamSchema),
    validateBody(MemberDeleteSchema),
    async (req, res, next) => {
      try {
        const result = await memberStatusService.deleteMember(req.params.id, req.body.reason, {
          userId: req.user!.sub,
          ...meta(req),
        });
        sendData(res, result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get('/:id/status-history', mark, requirePermission('members', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
    try {
      sendData(res, await memberActivityService.getStatusHistory(req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/activity', mark, requirePermission('members', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
    try {
      sendData(res, await memberActivityService.getMemberActivity(req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/documents', mark, requirePermission('members', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
    try {
      const granted = await resolveGrantedPermissionKeys(req.user!.roles);
      const includeFiles = can(granted, 'members', 'edit') || can(granted, 'members', 'approve');
      sendData(res, await memberDocumentService.listMemberDocuments(req.params.id, { includeFiles }));
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/:id/documents/:documentType',
    mark,
    requirePermission('members', 'edit'),
    validateParams(VendorDocumentAdminParamSchema),
    documentUpload.single('file'),
    async (req, res, next) => {
      try {
        if (!req.file) throw new ApiError('VALIDATION_ERROR', 'No file was uploaded.');
        const document = await memberDocumentService.uploadMemberDocument({
          memberId: req.params.id,
          documentType: req.params.documentType as VendorDocumentType,
          file: { buffer: req.file.buffer, originalname: req.file.originalname },
          number: typeof req.body?.number === 'string' ? req.body.number : undefined,
          actorUserId: req.user!.sub,
          onBehalf: true,
        });
        await writeAuditLog({
          actorUserId: req.user!.sub,
          action: 'member.document.uploaded',
          targetType: 'MemberDocument',
          targetId: document.id,
          ...meta(req),
        });
        sendData(res, { id: document.id, documentType: document.documentType, status: document.status }, { status: 201 });
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete(
    '/:id/documents/:documentType',
    mark,
    requirePermission('members', 'edit'),
    validateParams(VendorDocumentAdminParamSchema),
    async (req, res, next) => {
      try {
        await memberDocumentService.deleteMemberDocument(req.params.id, req.params.documentType as VendorDocumentType);
        await writeAuditLog({
          actorUserId: req.user!.sub,
          action: 'member.document.deleted',
          targetType: 'MemberDocument',
          targetId: req.params.documentType,
          ...meta(req),
        });
        sendData(res, { deleted: true });
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch(
    '/:id/documents/:documentType/review',
    mark,
    validateParams(VendorDocumentAdminParamSchema),
    validateBody(MemberDocumentReviewSchema),
    async (req, res, next) => {
      // Approve and reject are separate permissions, so the gate depends on the decision.
      const gate = requirePermission('members', req.body.decision === 'APPROVED' ? 'approve' : 'reject');
      gate(req, res, async (gateErr?: unknown) => {
        if (gateErr) return next(gateErr);
        try {
          const doc = await memberDocumentService.reviewMemberDocument({
            memberId: req.params.id,
            documentType: req.params.documentType as VendorDocumentType,
            decision: req.body.decision,
            reason: req.body.reason,
            actorUserId: req.user!.sub,
          });
          await writeAuditLog({
            actorUserId: req.user!.sub,
            action: req.body.decision === 'APPROVED' ? 'member.document.approved' : 'member.document.rejected',
            targetType: 'MemberDocument',
            targetId: doc.id,
            after: { status: doc.status },
            ...meta(req),
          });
          sendData(res, { id: doc.id, documentType: doc.documentType, status: doc.status });
        } catch (err) {
          next(err);
        }
      });
    },
  );

  return router;
}
```

- [ ] **Step 3: Create `routes/members.routes.ts`**

```ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { buildMemberAdminRoutes } from './member-admin.routes';

const router = Router();
router.use(authenticate);
router.use(buildMemberAdminRoutes({ deprecated: false }));

export default router;
```

- [ ] **Step 4: Mount in `app.ts`**

Add `import membersRoutes from './routes/members.routes';` and, directly above `api.use('/vendors/public', vendorPublicRoutes);`:

```ts
  api.use('/members', membersRoutes);
```

- [ ] **Step 5: Replace the old handlers in `vendors.routes.ts` with the alias**

Delete these route blocks (find each by its path; each block ends at its closing `);` or `});`): `GET '/'`, `POST '/'`, `GET '/:id'`, `PATCH '/:id'` (lines ~1289 to 1347), the three `kyc-documents` admin routes (`GET`, `POST`, `DELETE '/:id/kyc-documents...'`), `PATCH '/:id/approve'`, `PATCH '/:id/reject'`, `PATCH '/:id/status'`, `DELETE '/:id'`, `PATCH '/:id/kyc-review'`. Keep the `/:id/images` and `/:id/video` routes. At the position of the deleted `GET '/'` (before the `/:id/images` routes) add:

```ts
// Deprecated alias for one release: the canonical admin member routes live at /members.
router.use(buildMemberAdminRoutes({ deprecated: true }));
```

with `import { buildMemberAdminRoutes } from './member-admin.routes';` at the top. Remove imports that became unused (`VendorCreateSchema`, `VendorRejectSchema`, `VendorStatusUpdateSchema`, `VendorKycReviewSchema`, `VendorListQuerySchema`, `withCompletion` if unused, and the `/me` routes `POST /me` and `POST /me/submit`). Delete the `POST '/me'` and `POST '/me/submit'` blocks entirely (decision D9). Keep `GET /me` and `PATCH /me`.

- [ ] **Step 6: Write the route test `members.routes.test.ts`**

```ts
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});
vi.mock('../services/permission-resolver.service', () => ({ resolveGrantedPermissionKeys: vi.fn() }));
vi.mock('../services/member-notice.service', () => ({ sendMemberNotice: vi.fn().mockResolvedValue({ email: true, sms: true }) }));

import { prisma } from '../lib/prisma';
import { resolveGrantedPermissionKeys } from '../services/permission-resolver.service';
import { createApp } from '../app';
import { bearerFor } from '../test-utils/auth-test-utils';

const prismaMock = vi.mocked(prisma, true);
const grants = vi.mocked(resolveGrantedPermissionKeys);
const MEMBER_ID = 'b1b1b1b1-0000-4000-8000-000000000001';
const MEMBER_ROW = { id: MEMBER_ID, status: 'ACTIVE', ownerUserId: 'o1', businessName: 'Glow', owner: { name: 'A', email: 'a@x.com', phone: '+919876543210' } };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.member.findUnique.mockResolvedValue(MEMBER_ROW);
});

describe('PATCH /api/v1/members/:id/status', () => {
  it('403 for a role without members:status_change', async () => {
    grants.mockResolvedValue(['members:view']);
    const res = await request(createApp())
      .patch(`/api/v1/members/${MEMBER_ID}/status`)
      .set('Authorization', bearerFor({ roles: ['sales'] }))
      .send({ status: 'SUSPENDED', reason: 'Documents not completed' });
    expect(res.status).toBe(403);
  });

  it('422 when the reason is shorter than 10 characters', async () => {
    grants.mockResolvedValue(['members:status_change']);
    const res = await request(createApp())
      .patch(`/api/v1/members/${MEMBER_ID}/status`)
      .set('Authorization', bearerFor({ roles: ['admin'] }))
      .send({ status: 'SUSPENDED', reason: 'short' });
    expect(res.status).toBe(422);
  });

  it('200 and a history row for an admin', async () => {
    grants.mockResolvedValue(['members:status_change', 'members:view']);
    prismaMock.member.update.mockResolvedValue({});
    prismaMock.memberStatusHistory.create.mockResolvedValue({});
    prismaMock.refreshSession.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.auditLog.create.mockResolvedValue({});
    prismaMock.member.findUnique
      .mockResolvedValueOnce(MEMBER_ROW) // status service read
      .mockResolvedValue({ ...MEMBER_ROW, status: 'SUSPENDED', owner: null, documents: [], _count: {}, mediaImages: [], mediaVideo: null });
    const res = await request(createApp())
      .patch(`/api/v1/members/${MEMBER_ID}/status`)
      .set('Authorization', bearerFor({ roles: ['admin'] }))
      .send({ status: 'SUSPENDED', reason: 'Documents not completed' });
    expect(res.status).toBe(200);
    expect(prismaMock.memberStatusHistory.create).toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/members/:id', () => {
  it('403 for admin, who has no members:delete', async () => {
    grants.mockResolvedValue(['members:status_change']);
    const res = await request(createApp())
      .delete(`/api/v1/members/${MEMBER_ID}`)
      .set('Authorization', bearerFor({ roles: ['admin'] }))
      .send({ reason: 'Cleanup after suspension' });
    expect(res.status).toBe(403);
  });

  it('409 MEMBER_NOT_SUSPENDED when the member is still active', async () => {
    grants.mockResolvedValue(['members:delete']);
    const res = await request(createApp())
      .delete(`/api/v1/members/${MEMBER_ID}`)
      .set('Authorization', bearerFor({ roles: ['super_admin'] }))
      .send({ reason: 'Cleanup after suspension' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('MEMBER_NOT_SUSPENDED');
  });
});

describe('legacy alias', () => {
  it('serves GET /api/v1/vendors with a Deprecation header', async () => {
    grants.mockResolvedValue(['members:view']);
    prismaMock.member.findMany.mockResolvedValue([]);
    prismaMock.member.count.mockResolvedValue(0);
    const res = await request(createApp()).get('/api/v1/vendors').set('Authorization', bearerFor({ roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.headers.deprecation).toBe('true');
  });
});
```

If `app.ts` does not export `createApp`, open it and use whatever the other route tests (`vendors.routes.test.ts`) import to build the app; mirror their first 40 lines.

- [ ] **Step 7: Run `members.routes.test.ts`, `vendors.routes.test.ts` (delete or fix tests for removed routes), `tsc`. Expect PASS.**

- [ ] **Step 8: Commit**

```bash
git add apps/msd-api/src
git commit -m "feat(msd-api): Add /members routes with /vendors alias"
```

---

### Task 14: Storefront visibility, bootstrap and OpenAPI

**Files:**
- Modify: `apps/msd-api/src/services/catalog.service.ts`, `apps/msd-api/src/services/bootstrap.service.ts`, `packages/shared-types/src/index.ts`, `apps/msd-api/src/openapi/registry.ts`
- Create: `apps/msd-api/src/services/catalog-visibility.test.ts`

- [ ] **Step 1: Write the failing visibility test**

```ts
import { describe, it, expect } from 'vitest';
import { VISIBLE_DEAL_WHERE, VISIBLE_PRODUCT_WHERE, VISIBLE_THERAPIST_WHERE } from './catalog.service';

describe('storefront visibility requires an ACTIVE member', () => {
  it.each([
    ['deals', VISIBLE_DEAL_WHERE],
    ['products', VISIBLE_PRODUCT_WHERE],
    ['therapists', VISIBLE_THERAPIST_WHERE],
  ])('%s', (_name, where) => {
    expect(where.vendor).toEqual({ status: 'ACTIVE' });
  });
});
```

Run it: it should already PASS (the three constants already filter). It guards against regression.

- [ ] **Step 2: Fix the city list, which still counted suspended members' branches**

In `catalog.service.ts` `listPublicLocations`, change the `where` to:

```ts
    where: { isActive: true, vendor: { status: 'ACTIVE' }, state: { not: null }, city: { not: null } },
```

Add a test in the same test file (mock prisma, call `listPublicLocations`, assert `prisma.branch.groupBy` was called with `where.vendor` equal to `{ status: 'ACTIVE' }`).

- [ ] **Step 3: Bootstrap exposes the member status**

In `packages/shared-types/src/index.ts` add to `BootstrapResponse`:

```ts
  /** Present only when the signed in user owns a member business (msd). */
  member?: { id: string; status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVED' } | null;
```

In `bootstrap.service.ts` before the `return`:

```ts
  const ownedMember = await prisma.member.findUnique({
    where: { ownerUserId: user.id },
    select: { id: true, status: true },
  });
```

and add to the returned object `member: ownedMember ?? null,`. Add a unit test that a user with an INACTIVE member gets `member.status === 'INACTIVE'`.

- [ ] **Step 4: OpenAPI**

In `registry.ts` replace the `/vendors/{id}/approve`, `/vendors/{id}/reject`, `/vendors/{id}/status`, `/vendors/{id}/kyc-review` and `DELETE /vendors/{id}` entries and add these (import the new schemas):

```ts
  registry.registerPath({
    method: 'post',
    path: '/members',
    summary: 'Create a member (short form). Status starts ACTIVE.',
    tags: ['Members - Admin'],
    security: bearer,
    request: { body: { content: { 'application/json': { schema: MemberCreateSchema } } } },
    responses: { 201: { description: 'Created' }, 409: errorResponse, 422: errorResponse },
  });

  registry.registerPath({
    method: 'get',
    path: '/members',
    summary: 'List members. Filters: status, documents=incomplete, reviewFlag=true.',
    tags: ['Members - Admin'],
    security: bearer,
    request: { query: MemberListQuerySchema },
    responses: { 200: { description: 'Members' } },
  });

  registry.registerPath({
    method: 'patch',
    path: '/members/{id}/status',
    summary: 'Make a member Inactive, Suspended or Active again. Reason 10 to 500 characters.',
    tags: ['Members - Admin'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: MemberStatusChangeSchema } } },
    },
    responses: { 200: { description: 'Updated' }, 409: errorResponse, 422: errorResponse },
  });

  registry.registerPath({
    method: 'delete',
    path: '/members/{id}',
    summary: 'Delete a suspended member (Super Admin). Archives when orders exist.',
    tags: ['Members - Admin'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: MemberDeleteSchema } } },
    },
    responses: { 200: { description: 'DELETED or ARCHIVED' }, 409: errorResponse },
  });

  registry.registerPath({
    method: 'get',
    path: '/members/{id}/status-history',
    summary: 'Status changes with who and why',
    tags: ['Members - Admin'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'History' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/members/{id}/documents',
    summary: 'Document checklist. File keys only for roles that can edit or approve.',
    tags: ['Members - Admin'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Documents' } },
  });

  registry.registerPath({
    method: 'patch',
    path: '/members/{id}/documents/{documentType}/review',
    summary: 'Approve or reject a submitted document',
    tags: ['Members - Admin'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid(), documentType: z.enum(['GST', 'PAN', 'AADHAAR']) }),
      body: { content: { 'application/json': { schema: MemberDocumentReviewSchema } } },
    },
    responses: { 200: { description: 'Reviewed' }, 409: errorResponse },
  });
```

Also remove the `/vendors/public/register` and `/vendors/me` POST and `/vendors/me/submit` entries.

- [ ] **Step 5: Verify**

```bash
cd apps/msd-api && npx vitest run src/services/catalog src/services/bootstrap src/openapi
cd ../.. && npx tsc -p apps/msd-api/tsconfig.app.json --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add apps/msd-api/src packages/shared-types
git commit -m "feat(msd-api): Hide suspended branches, expose member status, document routes"
```

---

### Task 15: Seed demo members and backend gate

**Files:** Modify `apps/msd-api/prisma/seed.ts`.

- [ ] **Step 1: Seed `documentsDueAt` and `statusChangedAt` on demo members**

In `seedVendorsAndBranches` extend `vendorData` (remove `kycStatus: 'VERIFIED' as const`; keep `status: 'ACTIVE'`):

```ts
      status: 'ACTIVE' as const,
      statusChangedAt: new Date(),
      documentsDueAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
```

The find-or-create already avoids overwriting, so existing demo rows keep their values.

- [ ] **Step 2: Validate everything that needs no database**

```bash
npx prisma validate --schema=apps/msd-api/prisma/schema.prisma
npx prisma generate --schema=apps/msd-api/prisma/schema.prisma
npx nx run msd-api:lint
npx nx run msd-api:test
npx nx run msd-api:build
```

Expected: all pass. Compare the test failures with the baseline; none new.

- [ ] **Step 3: Commit**

```bash
git add apps/msd-api/prisma/seed.ts
git commit -m "feat(msd-api): Seed demo members with the documents timer"
```

---

## PART B: FRONTEND (`apps/msd`)

### Task 16: Folder rename, routes, API module

**Files:**
- Rename: `apps/msd/src/app/pages/account/vendors/` to `members/` (`git mv`)
- Modify: `apps/msd/src/app/routes.tsx`, `apps/msd/src/api/rbac/client.ts`, `apps/msd/src/api/rbac/vendors.ts`, `apps/msd/src/app/components/notification-bell.tsx`, `apps/msd/src/app/pages/account/notifications/notifications.tsx`
- Create: `apps/msd/src/api/rbac/members.ts`, `apps/msd/src/api/rbac/members.test.ts`

- [ ] **Step 1: Move the folder and fix imports and paths**

```bash
cd apps/msd/src
git mv app/pages/account/vendors app/pages/account/members
grep -rl "pages/account/vendors" . | xargs sed -i "s#pages/account/vendors#pages/account/members#g"
grep -rl "/account/vendors" . | xargs sed -i "s#/account/vendors#/account/members#g"
grep -rn "account/vendors" . | head
```

Expected: no hits left. (API paths such as `/vendors/me` do not contain `account/` and are untouched.)

- [ ] **Step 2: Rename permission key usages in the frontend**

```bash
grep -rl "can('vendors'" . | xargs sed -i "s/can('vendors'/can('members'/g"
sed -i 's/menuKey="vendors"/menuKey="members"/g' app/routes.tsx
grep -rn "'vendors'" app --include=*.tsx --include=*.ts | grep -v test | head
```

Update the matching assertions in `*.test.tsx` the same way (`roles.test.tsx` uses menu keys).

- [ ] **Step 3: Add the legacy redirect in `routes.tsx`**

Directly above the `/account/members` route add:

```tsx
          <Route path="/account/vendors" element={<Navigate to="/account/members" replace />} />
          <Route path="/account/vendors/*" element={<LegacyMemberRedirect />} />
```

and define near the top of the file:

```tsx
function LegacyMemberRedirect() {
  const { pathname, search } = useLocation();
  return <Navigate to={`${pathname.replace('/account/vendors', '/account/members')}${search}`} replace />;
}
```

Import `Navigate` and `useLocation` from `react-router-dom` if not already imported.

- [ ] **Step 4: Let `apiDelete` carry a body** (`client.ts`)

```ts
export function apiDelete<T>(path: string, token: string | null, body?: unknown): Promise<ApiResult<T>> {
  return request<T>(path, token, {
    method: 'DELETE',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
```

- [ ] **Step 5: Update `api/rbac/vendors.ts` types**

Replace the `VendorStatus` union:

```ts
export type VendorStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVED';
export type MemberStatus = VendorStatus;
```

Add to the `Vendor` interface:

```ts
  statusChangedAt?: string | null;
  documentsDueAt?: string | null;
  reviewFlaggedAt?: string | null;
  documentsSummary?: {
    complete: boolean;
    missing: VendorDocumentType[];
    rejected: VendorDocumentType[];
    dueAt: string | null;
    overdue: boolean;
  };
```

Run `cd apps/msd && npx tsc -p tsconfig.app.json --noEmit` and remove every dead reference to `PENDING_VERIFICATION`, `PROFILE_INCOMPLETE`, `APPROVED`, `REJECTED` for members, plus `approveVendor`, `rejectVendor`, `reviewVendorKyc`, `submitMyVendor`, `createMyVendor`, `deleteVendor`, `setVendorStatus` in `vendors.ts` (the new module replaces them). Files still referencing them (`vendor-detail-page.tsx`, `vendors.tsx`) are rewritten in Tasks 18 and 20; leave those errors for now.

- [ ] **Step 6: Write the failing API test `members.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
vi.stubEnv('VITE_API_URL', 'http://api.test');

import { createMember, changeMemberStatus, deleteMember, listMembers, reviewMemberDocument } from './members';

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => ({ data, error: null }) };
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(ok({}));
});

describe('members api', () => {
  it('creates a member with POST /members', async () => {
    await createMember('t', { businessName: 'Glow', ownerFirstName: 'A', ownerLastName: 'R', ownerEmail: 'a@x.com', ownerMobile: '9876543210' });
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/members');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });

  it('changes status with PATCH and the reason in the body', async () => {
    await changeMemberStatus('t', 'm1', 'SUSPENDED', 'Documents not completed');
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/members/m1/status');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ status: 'SUSPENDED', reason: 'Documents not completed' });
  });

  it('deletes with a JSON body', async () => {
    await deleteMember('t', 'm1', 'Cleanup after suspension');
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ reason: 'Cleanup after suspension' });
  });

  it('builds the list query from the filter', async () => {
    await listMembers('t', { page: 2, pageSize: 10, search: 'glow', documents: 'incomplete' });
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/members?page=2&pageSize=10&search=glow&documents=incomplete');
  });

  it('reviews a document', async () => {
    await reviewMemberDocument('t', 'm1', 'PAN', { decision: 'REJECTED', reason: 'Scan is blurry' });
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/members/m1/documents/PAN/review');
  });
});
```

- [ ] **Step 7: Implement `api/rbac/members.ts`**

```ts
import { apiGet, apiPatch, apiPost, apiDelete, apiPostForm } from './client';
import type { Vendor, VendorDocumentType, MemberStatus } from './vendors';

export type { MemberStatus };
export type MemberDocumentStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export interface MemberCreateInput {
  businessName: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  ownerMobile: string;
}

export interface MemberListFilter {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: MemberStatus;
  documents?: 'incomplete';
  reviewFlag?: 'true';
}

export interface MemberDocumentRow {
  id: string;
  documentType: VendorDocumentType;
  status: MemberDocumentStatus;
  numberMasked: string | null;
  rejectionReason: string | null;
  reviewedAt: string | null;
  uploadedOnBehalf: boolean;
  uploadedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present only for roles that may open files. */
  storageKey?: string;
  originalFilename?: string | null;
}

export interface StatusHistoryItem {
  id: string;
  fromStatus: MemberStatus;
  toStatus: MemberStatus;
  reason: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface ActivityItem {
  kind: 'status' | 'document';
  at: string;
  summary: string;
  detail: string | null;
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export function listMembers(token: string | null, filter: MemberListFilter = {}) {
  return apiGet<Vendor[]>(`/members${toQuery({ ...filter })}`, token);
}

export function getMember(token: string | null, id: string) {
  return apiGet<Vendor>(`/members/${id}`, token);
}

export function createMember(token: string | null, input: MemberCreateInput) {
  return apiPost<Vendor>('/members', token, input);
}

export function changeMemberStatus(token: string | null, id: string, status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED', reason: string) {
  return apiPatch<Vendor>(`/members/${id}/status`, token, { status, reason });
}

export function deleteMember(token: string | null, id: string, reason: string) {
  return apiDelete<{ outcome: 'DELETED' | 'ARCHIVED' }>(`/members/${id}`, token, { reason });
}

export function getMemberStatusHistory(token: string | null, id: string) {
  return apiGet<StatusHistoryItem[]>(`/members/${id}/status-history`, token);
}

export function getMemberActivity(token: string | null, id: string) {
  return apiGet<ActivityItem[]>(`/members/${id}/activity`, token);
}

export function listMemberDocuments(token: string | null, id: string) {
  return apiGet<MemberDocumentRow[]>(`/members/${id}/documents`, token);
}

export function uploadMemberDocument(
  token: string | null,
  id: string,
  documentType: VendorDocumentType,
  file: Blob,
  filename: string,
  number?: string,
) {
  const form = new FormData();
  form.append('file', file, filename);
  if (number) form.append('number', number);
  return apiPostForm<{ id: string; documentType: VendorDocumentType; status: MemberDocumentStatus }>(
    `/members/${id}/documents/${documentType}`,
    token,
    form,
  );
}

export function deleteMemberDocument(token: string | null, id: string, documentType: VendorDocumentType) {
  return apiDelete<{ deleted: true }>(`/members/${id}/documents/${documentType}`, token);
}

export function reviewMemberDocument(
  token: string | null,
  id: string,
  documentType: VendorDocumentType,
  body: { decision: 'APPROVED' | 'REJECTED'; reason?: string },
) {
  return apiPatch<{ id: string; status: MemberDocumentStatus }>(`/members/${id}/documents/${documentType}/review`, token, body);
}
```

- [ ] **Step 8: Run `cd apps/msd && npx vitest run src/api/rbac/members.test.ts`, expect PASS. Commit**

```bash
git add apps/msd/src
git commit -m "refactor(msd): Move vendor screens to members routes and API module"
```

---

### Task 17: Status helpers

**Files:** Create `apps/msd/src/app/pages/account/members/member-status.ts` and `member-status.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  MEMBER_STATUS_LABEL,
  statusBadgeVariant,
  documentsChipLabel,
  dueDateLabel,
  availableStatusActions,
} from './member-status';

describe('member status helpers', () => {
  it('labels the three lifecycle states plus archived', () => {
    expect(MEMBER_STATUS_LABEL).toEqual({ ACTIVE: 'Active', INACTIVE: 'Inactive', SUSPENDED: 'Suspended', ARCHIVED: 'Archived' });
  });

  it('colours Active primary and Suspended error', () => {
    expect(statusBadgeVariant('ACTIVE')).toBe('primary');
    expect(statusBadgeVariant('SUSPENDED')).toBe('error');
  });

  it('documents chip', () => {
    expect(documentsChipLabel({ complete: true, missing: [], rejected: [], dueAt: null, overdue: false })).toBe('Documents complete');
    expect(documentsChipLabel({ complete: false, missing: ['PAN'], rejected: [], dueAt: null, overdue: false })).toBe('Documents incomplete');
    expect(documentsChipLabel(undefined)).toBe('Documents incomplete');
  });

  it('due date label', () => {
    const summary = { complete: false, missing: ['PAN' as const], rejected: [], dueAt: '2026-10-20T00:00:00Z', overdue: false };
    expect(dueDateLabel(summary)).toBe('Due 20 Oct 2026');
    expect(dueDateLabel({ ...summary, overdue: true })).toBe('Overdue since 20 Oct 2026');
    expect(dueDateLabel({ ...summary, complete: true })).toBe('');
  });

  it('actions follow the lifecycle and the viewer permissions', () => {
    const all = { canStatusChange: true, canDelete: true };
    expect(availableStatusActions('ACTIVE', all)).toEqual(['deactivate', 'suspend']);
    expect(availableStatusActions('INACTIVE', all)).toEqual(['reactivate', 'suspend']);
    expect(availableStatusActions('SUSPENDED', all)).toEqual(['reactivate', 'delete']);
    expect(availableStatusActions('ARCHIVED', all)).toEqual([]);
    expect(availableStatusActions('SUSPENDED', { canStatusChange: true, canDelete: false })).toEqual(['reactivate']);
    expect(availableStatusActions('ACTIVE', { canStatusChange: false, canDelete: false })).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement `member-status.ts`**

```ts
import type { MemberStatus, Vendor } from '../../../../api/rbac/vendors';

export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  SUSPENDED: 'Suspended',
  ARCHIVED: 'Archived',
};

export type BadgeVariant = 'primary' | 'secondary' | 'tertiary' | 'error';

export function statusBadgeVariant(status: MemberStatus): BadgeVariant {
  if (status === 'ACTIVE') return 'primary';
  if (status === 'INACTIVE') return 'tertiary';
  if (status === 'SUSPENDED') return 'error';
  return 'secondary';
}

type Summary = NonNullable<Vendor['documentsSummary']>;

export function documentsChipLabel(summary: Summary | undefined): string {
  return summary?.complete ? 'Documents complete' : 'Documents incomplete';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function dueDateLabel(summary: Summary | undefined): string {
  if (!summary || summary.complete || !summary.dueAt) return '';
  return `${summary.overdue ? 'Overdue since' : 'Due'} ${formatDate(summary.dueAt)}`;
}

export type StatusAction = 'deactivate' | 'suspend' | 'reactivate' | 'delete';

export function availableStatusActions(
  status: MemberStatus,
  can: { canStatusChange: boolean; canDelete: boolean },
): StatusAction[] {
  const actions: StatusAction[] = [];
  if (can.canStatusChange) {
    if (status === 'ACTIVE') actions.push('deactivate', 'suspend');
    if (status === 'INACTIVE') actions.push('reactivate', 'suspend');
    if (status === 'SUSPENDED') actions.push('reactivate');
  }
  if (can.canDelete && status === 'SUSPENDED') actions.push('delete');
  return actions;
}
```

- [ ] **Step 3: Run, expect PASS. Commit**

```bash
git add apps/msd/src/app/pages/account/members/member-status.ts apps/msd/src/app/pages/account/members/member-status.test.ts
git commit -m "feat(msd): Add member status helpers"
```

---

### Task 18: All members list

**Files:**
- Rename and rewrite: `members/vendor-list.tsx` to `members/member-list.tsx`, `vendor-list.test.tsx` to `member-list.test.tsx`
- Rewrite: `members/vendors.tsx` to `members/members.tsx`
- Modify: `routes.tsx` import

- [ ] **Step 1: Rename**

```bash
cd apps/msd/src/app/pages/account/members
git mv vendor-list.tsx member-list.tsx
git mv vendor-list.test.tsx member-list.test.tsx
git mv vendors.tsx members.tsx
sed -i "s#./pages/account/members/vendors'#./pages/account/members/members'#; s#VendorManagement#MemberManagement#g" ../../../routes.tsx
grep -rn "from './vendors'\|from './vendor-list'" . | head
```

- [ ] **Step 2: Write the failing test `member-list.test.tsx`** (replace the file)

```tsx
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { Vendor } from '../../../../api/rbac/vendors';
import { MemberList } from './member-list';

const MEMBER = {
  id: 'm1',
  businessName: 'Vitality Wellness & Beauty',
  status: 'ACTIVE',
  owner: { id: 'o1', name: 'Arjun Malhotra', status: 'active', roles: [] },
  _count: { branches: 9, deals: 18, products: 18, therapists: 12 },
  liveCounts: { branches: 9, deals: 5, products: 18, therapists: 12 },
  documentsSummary: { complete: false, missing: ['PAN'], rejected: [], dueAt: '2026-10-20T00:00:00Z', overdue: false },
} as unknown as Vendor;

function table(): HTMLElement {
  const el = document.querySelector('sky-data-table');
  if (!el) throw new Error('sky-data-table not found');
  return el as HTMLElement;
}

function renderList(members: Vendor[], onSelect = vi.fn()) {
  render(<MemberList members={members} onSelect={onSelect} total={members.length} page={1} pageSize={10} loading={false} onParamsChange={vi.fn()} />);
}

describe('MemberList', () => {
  it('declares the member columns', () => {
    renderList([]);
    const columns = JSON.parse(table().getAttribute('columns') ?? '[]') as { label: string }[];
    expect(columns.map((c) => c.label)).toEqual(['Business', 'Owner', 'Status', 'Documents', 'Due', 'Branches', 'Deals', 'Therapists', 'Products']);
  });

  it('shows a readable status, documents chip, due date and live counts', () => {
    renderList([MEMBER]);
    const [row] = JSON.parse(table().getAttribute('rows') ?? '[]') as Record<string, string>[];
    expect(row.Status).toBe('Active');
    expect(row.Documents).toBe('Documents incomplete');
    expect(row.Due).toBe('Due 20 Oct 2026');
    expect(row['Deal Count']).toBe('5 of 18');
  });

  it('maps Suspended to an error badge', () => {
    renderList([{ ...MEMBER, status: 'SUSPENDED' } as Vendor]);
    const columns = JSON.parse(table().getAttribute('columns') ?? '[]') as { key: string; statusMap?: Record<string, string> }[];
    expect(columns.find((c) => c.key === 'Status')?.statusMap?.Suspended).toBe('error');
  });

  it('opens a member from the row action', () => {
    const onSelect = vi.fn();
    renderList([MEMBER], onSelect);
    fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action: 'select', row: { 'Member ID': 'm1' } } }));
    expect(onSelect).toHaveBeenCalledWith('m1');
  });
});
```

- [ ] **Step 3: Rewrite `member-list.tsx`**

```tsx
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import type { Vendor } from '../../../../api/rbac/vendors';
import { formatCount } from './vendor-setup';
import { MEMBER_STATUS_LABEL, documentsChipLabel, dueDateLabel } from './member-status';

interface MemberTableParams {
  page: number;
  pageSize: number;
  search: string;
}

interface MemberListProps {
  members: Vendor[];
  onSelect: (id: string) => void;
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  onParamsChange: (params: MemberTableParams) => void;
}

const STATUS_MAP: Record<string, 'success' | 'warning' | 'error'> = {
  Active: 'success',
  Inactive: 'warning',
  Suspended: 'error',
  Archived: 'error',
};
const DOCUMENTS_MAP: Record<string, 'success' | 'warning' | 'error'> = {
  'Documents complete': 'success',
  'Documents incomplete': 'warning',
};

const COLUMNS = JSON.stringify([
  { key: 'Business Name', label: 'Business' },
  { key: 'Owner', label: 'Owner' },
  { key: 'Status', label: 'Status', type: 'status', statusMap: STATUS_MAP },
  { key: 'Documents', label: 'Documents', type: 'status', statusMap: DOCUMENTS_MAP },
  { key: 'Due', label: 'Due' },
  { key: 'Branch Count', label: 'Branches' },
  { key: 'Deal Count', label: 'Deals' },
  { key: 'Therapist Count', label: 'Therapists' },
  { key: 'Product Count', label: 'Products' },
]);

const ACTIONS = JSON.stringify([{ icon: 'chevron_right', label: 'Open member', event: 'select' }]);

function toRow(member: Vendor): Record<string, string | number> {
  const live = member.liveCounts;
  const all = member._count;
  return {
    'Member ID': member.id,
    'Business Name': member.businessName || member.owner?.name || 'New member',
    Owner: member.owner?.name ?? '—',
    Status: MEMBER_STATUS_LABEL[member.status] ?? member.status,
    Documents: documentsChipLabel(member.documentsSummary),
    Due: dueDateLabel(member.documentsSummary),
    'Branch Count': formatCount(live?.branches, all?.branches),
    'Deal Count': formatCount(live?.deals, all?.deals),
    'Therapist Count': formatCount(live?.therapists, all?.therapists),
    'Product Count': formatCount(live?.products, all?.products),
  };
}

/** Member list. Presenter only: paging, search and the fetch belong to the parent. */
export function MemberList({ members, onSelect, total, page, pageSize, loading, onParamsChange }: MemberListProps) {
  const tableRef = useRef<HTMLElement>(null);
  const rows = useMemo(() => JSON.stringify(members.map(toRow)), [members]);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const onParams = (e: Event) => {
      const detail = (e as CustomEvent<SkyDataTableParamsDetail>).detail;
      onParamsChange({ page: detail.page, pageSize: detail.pageSize, search: detail.search });
    };
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; row: Record<string, unknown> }>).detail;
      if (detail.action !== 'select') return;
      const id = detail.row['Member ID'];
      if (typeof id === 'string' && id) onSelect(id);
    };
    el.addEventListener('sky-dt-params-change', onParams);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParams);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
  }, [onParamsChange, onSelect]);

  return (
    <sky-data-table
      ref={tableRef as RefObject<HTMLElement>}
      caption="Members"
      columns={COLUMNS}
      rows={rows}
      total={total}
      page={page}
      page-size={pageSize}
      loading={loading}
      searchable
      search-placeholder="Search members…"
      actions={ACTIONS}
    />
  );
}

export default MemberList;
```

- [ ] **Step 4: Rewrite `members.tsx`** (keeps the member self-service branch; the admin branch gains filters)

Keep `useMyVendor` and `SelfVendorManagement` exactly as they are except for the two edits in Task 20 step 3. Replace `VendorManagement` and `AdminVendorManagement` with:

```tsx
export function MemberManagement() {
  const { token, can } = useAuth();
  if (can('members', 'view')) return <AdminMemberManagement canCreate={can('members', 'create')} />;
  if (can('members', 'custom')) return <SelfVendorManagement token={token} />;
  return <p className="empty-state">You do not have access to Member Management.</p>;
}

type ListFilter = 'all' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'documents' | 'review';

const FILTER_ITEMS = [
  { value: 'all', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'documents', label: 'Documents incomplete' },
  { value: 'review', label: 'Ready for suspension review' },
];

function filterToQuery(filter: ListFilter): Pick<MemberListFilter, 'status' | 'documents' | 'reviewFlag'> {
  if (filter === 'ACTIVE' || filter === 'INACTIVE' || filter === 'SUSPENDED') return { status: filter };
  if (filter === 'documents') return { documents: 'incomplete' };
  if (filter === 'review') return { reviewFlag: 'true' };
  return {};
}

function AdminMemberManagement({ canCreate }: { canCreate: boolean }) {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [members, setMembers] = useState<Vendor[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [params, setParams] = useState({ page: 1, pageSize: 10, search: '' });
  const [filter, setFilter] = useState<ListFilter>('all');

  const openMember = useCallback((id: string) => navigate(`/account/members/${id}`), [navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      const { data, meta } = await listMembers(token, {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
        ...filterToQuery(filter),
      });
      setMembers(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setListError(err instanceof ApiRequestError ? err.message : 'Could not load members.');
    } finally {
      setLoading(false);
    }
  }, [token, params, filter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="admin-page admin-page--wide">
      <title>Member Management · MSD</title>
      <header className="page-head">
        <div>
          <h1>Member Management</h1>
          <p>Open a member to review their profile, documents and catalog.</p>
        </div>
        <div className="page-head__actions">
          {canCreate && (
            <FilledButton onClick={() => navigate('/account/members/new')}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              Add member
            </FilledButton>
          )}
        </div>
      </header>

      <section className="panel" aria-label="Members">
        <h2>Members ({total})</h2>
        <ChipNav
          items={FILTER_ITEMS}
          value={filter}
          onSelect={(value) => {
            setFilter(value as ListFilter);
            setParams((p) => ({ ...p, page: 1 }));
          }}
          ariaLabel="Filter members"
        />
        {listError && <p className="error-state" role="alert">{listError}</p>}
        <MemberList
          members={members}
          onSelect={openMember}
          total={total}
          page={params.page}
          pageSize={params.pageSize}
          loading={loading}
          onParamsChange={setParams}
        />
      </section>
    </div>
  );
}

export default MemberManagement;
```

Fix the imports at the top: `listMembers`, `type MemberListFilter` from `'../../../../api/rbac/members'`; `ChipNav` from `'../../../components/chip-nav/chip-nav'`; `MemberList` from `'./member-list'`; keep the `vendors` API imports `getMyVendor`, `listCategories`, `updateMyVendor`, `type Category`, `type Vendor`, `type VendorFields` (drop `createMyVendor`, `submitMyVendor`, `listVendors`).

- [ ] **Step 5: Run `npx vitest run src/app/pages/account/members/member-list.test.tsx`, expect PASS. Commit**

```bash
git add apps/msd/src
git commit -m "feat(msd): Rebuild the All members list with lifecycle filters"
```

---

### Task 19: Add member

**Files:** Create `members/member-new-page.tsx`, `members/member-new-page.test.tsx`; delete `vendor-new-page.tsx` (+ its imports in `routes.tsx` change to `MemberNewPage`).

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiRequestError } from '../../../../api/rbac/client';
import { MemberNewPage } from './member-new-page';

const createMemberMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => useAuthMock() }));
vi.mock('../../../../api/rbac/members', () => ({ createMember: (...a: unknown[]) => createMemberMock(...a) }));

function type(label: string, value: string) {
  const field = screen.getByLabelText(label) as HTMLInputElement;
  field.value = value;
  fireEvent.input(field);
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/account/members/new']}>
      <Routes>
        <Route path="/account/members/new" element={<MemberNewPage />} />
        <Route path="/account/members/:id" element={<p>detail-page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue({ token: 't', can: () => true });
});

describe('MemberNewPage', () => {
  it('shows an access message without members:create', () => {
    useAuthMock.mockReturnValue({ token: 't', can: () => false });
    renderPage();
    expect(screen.getByText(/do not have access/i)).toBeTruthy();
  });

  it('shows field errors and does not call the API when the form is empty', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /create member/i }));
    expect(await screen.findByText(/enter the business name/i)).toBeTruthy();
    expect(createMemberMock).not.toHaveBeenCalled();
  });

  it('creates the member then opens the detail page', async () => {
    createMemberMock.mockResolvedValue({ data: { id: 'm1' } });
    renderPage();
    type('Business name', 'Glow Studio');
    type('Owner first name', 'Asha');
    type('Owner last name', 'Rao');
    type('Owner email', 'asha@glow.test');
    type('Owner mobile number', '9876543210');
    fireEvent.click(screen.getByRole('button', { name: /create member/i }));
    await waitFor(() => expect(screen.getByText('detail-page')).toBeTruthy());
    expect(createMemberMock).toHaveBeenCalledWith('t', {
      businessName: 'Glow Studio',
      ownerFirstName: 'Asha',
      ownerLastName: 'Rao',
      ownerEmail: 'asha@glow.test',
      ownerMobile: '9876543210',
    });
  });

  it('puts a duplicate email error on the email field', async () => {
    createMemberMock.mockRejectedValue(
      new ApiRequestError('CONFLICT', 'exists', 409, { fields: { ownerEmail: 'This email already belongs to another account.' } }),
    );
    renderPage();
    type('Business name', 'Glow Studio');
    type('Owner first name', 'Asha');
    type('Owner last name', 'Rao');
    type('Owner email', 'asha@glow.test');
    type('Owner mobile number', '9876543210');
    fireEvent.click(screen.getByRole('button', { name: /create member/i }));
    expect(await screen.findByText(/email already belongs/i)).toBeTruthy();
  });
});
```

If `getByLabelText` cannot see `OutlinedTextField` labels under jsdom (the shared-ui wrappers render custom elements), query by `document.querySelector('md-outlined-text-field[label="Business name"]')` and set `.value`, then dispatch `input`. Use whichever works; the existing `vendor-profile-form.test.tsx` shows the working pattern, mirror it.

- [ ] **Step 2: Implement `member-new-page.tsx`**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilledButton, OutlinedTextField } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { createMember, type MemberCreateInput } from '../../../../api/rbac/members';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useSetBreadcrumbs } from '../../../admin/breadcrumb-context';

type FieldErrors = Partial<Record<keyof MemberCreateInput, string>>;

const EMPTY: MemberCreateInput = { businessName: '', ownerFirstName: '', ownerLastName: '', ownerEmail: '', ownerMobile: '' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_RE = /^[6-9]\d{9}$/;

export function validateMember(input: MemberCreateInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.businessName.trim()) errors.businessName = 'Enter the business name.';
  if (!input.ownerFirstName.trim()) errors.ownerFirstName = 'Enter the owner first name.';
  if (!input.ownerLastName.trim()) errors.ownerLastName = 'Enter the owner last name.';
  if (!EMAIL_RE.test(input.ownerEmail.trim())) errors.ownerEmail = 'Enter a valid email address.';
  if (!MOBILE_RE.test(input.ownerMobile.trim())) errors.ownerMobile = 'Enter a valid 10-digit mobile number.';
  return errors;
}

/** Add member: the short form. The rest of the profile is completed on the detail page. */
export function MemberNewPage() {
  const { token, can } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<MemberCreateInput>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useSetBreadcrumbs([{ label: 'Members' }, { label: 'All Member', to: '/account/members' }, { label: 'Add member' }]);

  if (!can('members', 'create')) {
    return <p className="empty-state">You do not have access to add a member.</p>;
  }

  const set = (key: keyof MemberCreateInput) => (e: Event) => {
    setForm((prev) => ({ ...prev, [key]: (e.target as HTMLInputElement).value }));
  };

  const submit = async () => {
    const found = validateMember(form);
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      const { data } = await createMember(token, {
        businessName: form.businessName.trim(),
        ownerFirstName: form.ownerFirstName.trim(),
        ownerLastName: form.ownerLastName.trim(),
        ownerEmail: form.ownerEmail.trim(),
        ownerMobile: form.ownerMobile.trim(),
      });
      navigate(`/account/members/${data.id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError) {
        const fields = (err.details as { fields?: FieldErrors } | undefined)?.fields;
        if (fields) setErrors(fields);
        else setFormError(err.message);
      } else {
        setFormError('Could not create the member. Try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof MemberCreateInput, label: string, extra: Record<string, unknown> = {}) => (
    <div className="vendor-field">
      <OutlinedTextField label={label} value={form[key]} onInput={set(key)} error={Boolean(errors[key])} required {...extra} />
      {errors[key] && (
        <p className="error-state" role="alert">
          {errors[key]}
        </p>
      )}
    </div>
  );

  return (
    <div className="admin-page admin-page--wide">
      <title>Add member · MSD</title>
      <header className="page-head">
        <div>
          <h1>Add member</h1>
          <p>Create the member's login. They are active straight away and get a welcome message. You complete the rest of the profile next.</p>
        </div>
      </header>

      {formError && <p className="error-state" role="alert">{formError}</p>}

      <section className="panel" aria-label="Member details">
        {field('businessName', 'Business name')}
        {field('ownerFirstName', 'Owner first name', { autocomplete: 'given-name' })}
        {field('ownerLastName', 'Owner last name', { autocomplete: 'family-name' })}
        {field('ownerEmail', 'Owner email', { type: 'email', autocomplete: 'email' })}
        {field('ownerMobile', 'Owner mobile number', { type: 'tel', inputMode: 'numeric', maxLength: 10, autocomplete: 'tel-national' })}
        <FilledButton disabled={saving} onClick={submit}>
          Create member
        </FilledButton>
      </section>
    </div>
  );
}

export default MemberNewPage;
```

- [ ] **Step 3: Wire the route and delete the old page**

```bash
cd apps/msd/src/app
git rm pages/account/members/vendor-new-page.tsx
sed -i "s#import { VendorNewPage } from './pages/account/members/vendor-new-page';#import { MemberNewPage } from './pages/account/members/member-new-page';#; s#<VendorNewPage />#<MemberNewPage />#" routes.tsx
```

- [ ] **Step 4: Run the test, expect PASS. Commit**

```bash
git add apps/msd/src
git commit -m "feat(msd): Replace the add vendor pipeline with the short add member form"
```

---

### Task 20: Member detail page and tabs

**Files:**
- Create: `members/member-header-actions.tsx`, `members/member-header-actions.test.tsx`, `members/member-documents-tab.tsx`, `members/member-documents-tab.test.tsx`, `members/member-activity-tab.tsx`, `members/member-detail-page.tsx`, `members/member-detail-page.test.tsx`
- Delete: `vendor-detail-page.tsx`, `vendor-detail-page.test.tsx`, `vendor-detail-customers.tsx`, `vendor-detail-orders.tsx`, `vendor-pipeline.tsx`, `vendor-pipeline.test.tsx`, `vendor-wizard-*.tsx` and tests, `vendor-setup.ts` (keep `formatCount`, see step 1), `vendor-setup.test.ts`

- [ ] **Step 1: Keep `formatCount`**

`member-list.tsx` imports `formatCount` from `./vendor-setup`. Move it:

```bash
cd apps/msd/src/app/pages/account/members
cat > format-count.ts <<'EOF'
/** "5 of 18" when some items are not live, "18" when all are, "0" when none exist. */
export function formatCount(live: number | undefined, total: number | undefined): string {
  const all = total ?? 0;
  if (live === undefined || live === all) return String(all);
  return `${live} of ${all}`;
}
EOF
sed -i "s#from './vendor-setup'#from './format-count'#" member-list.tsx
```

- [ ] **Step 2: Write the failing header actions test**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemberHeaderActions } from './member-header-actions';

function renderActions(props: Partial<React.ComponentProps<typeof MemberHeaderActions>> = {}) {
  const onChange = vi.fn().mockResolvedValue(undefined);
  const onDelete = vi.fn().mockResolvedValue(undefined);
  render(
    <MemberHeaderActions
      status="ACTIVE"
      canStatusChange
      canDelete
      reasonPrefill=""
      onChangeStatus={onChange}
      onDelete={onDelete}
      {...props}
    />,
  );
  return { onChange, onDelete };
}

describe('MemberHeaderActions', () => {
  it('shows Make inactive and Suspend for an Active member', () => {
    renderActions();
    expect(screen.getByRole('button', { name: /make inactive/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /suspend/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
  });

  it('shows Reactivate and Delete for a Suspended member when the viewer may delete', () => {
    renderActions({ status: 'SUSPENDED' });
    expect(screen.getByRole('button', { name: /reactivate/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /delete/i })).toBeTruthy();
  });

  it('shows nothing for a viewer without status permission', () => {
    renderActions({ canStatusChange: false, canDelete: false });
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('keeps Confirm disabled until the reason has 10 characters', async () => {
    const { onChange } = renderActions();
    fireEvent.click(screen.getByRole('button', { name: /suspend/i }));
    const confirm = screen.getByRole('button', { name: /confirm suspend/i }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    const reason = document.querySelector('[data-testid="status-reason"]') as HTMLTextAreaElement;
    reason.value = 'Documents not completed';
    fireEvent.input(reason);
    await waitFor(() => expect((screen.getByRole('button', { name: /confirm suspend/i }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /confirm suspend/i }));
    expect(onChange).toHaveBeenCalledWith('SUSPENDED', 'Documents not completed');
  });

  it('prefills the suspend reason when the review flag is set', () => {
    renderActions({ reasonPrefill: 'Documents not completed' });
    fireEvent.click(screen.getByRole('button', { name: /suspend/i }));
    const reason = document.querySelector('[data-testid="status-reason"]') as HTMLTextAreaElement;
    expect(reason.value).toBe('Documents not completed');
  });
});
```

As in Task 19, if `FilledButton` custom elements are not exposed to `getByRole`, query `document.querySelectorAll('md-filled-button, md-text-button')` by text; mirror `vendor-detail-page.test.tsx`.

- [ ] **Step 3: Implement `member-header-actions.tsx`**

```tsx
import { useRef, useState, type RefObject } from 'react';
import { FilledButton, OutlinedButton, OutlinedTextField, TextButton } from '@skylabs-monorepo/shared-ui/react';
import type { MemberStatus } from '../../../../api/rbac/vendors';
import { availableStatusActions, type StatusAction } from './member-status';

interface Props {
  status: MemberStatus;
  canStatusChange: boolean;
  canDelete: boolean;
  /** Prefill for the Suspend reason, "Documents not completed" when the review flag is set. */
  reasonPrefill: string;
  onChangeStatus: (status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED', reason: string) => Promise<void>;
  onDelete: (reason: string) => Promise<void>;
}

const COPY: Record<StatusAction, { button: string; confirm: string; title: string; body: string }> = {
  deactivate: {
    button: 'Make inactive',
    confirm: 'Confirm make inactive',
    title: 'Make this member inactive',
    body: 'The member can still log in and look at everything, but cannot change anything. Their items are hidden from the website.',
  },
  suspend: {
    button: 'Suspend',
    confirm: 'Confirm suspend',
    title: 'Suspend this member',
    body: 'The member cannot log in and everything they own disappears from the website. They get an email and an SMS with this reason and the steps to come back.',
  },
  reactivate: {
    button: 'Reactivate',
    confirm: 'Confirm reactivate',
    title: 'Reactivate this member',
    body: 'The member can log in again and everything on the website comes back as it was. They get an email and an SMS.',
  },
  delete: {
    button: 'Delete',
    confirm: 'Confirm delete',
    title: 'Delete this member',
    body: 'A member with no orders is removed for good. A member with orders is archived: hidden everywhere, records kept.',
  },
};

const MIN = 10;
const MAX = 500;

export function MemberHeaderActions({ status, canStatusChange, canDelete, reasonPrefill, onChangeStatus, onDelete }: Props) {
  const actions = availableStatusActions(status, { canStatusChange, canDelete });
  const [pending, setPending] = useState<StatusAction | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reasonRef = useRef<HTMLElement>(null);

  if (actions.length === 0) return null;

  const open = (action: StatusAction) => {
    setError('');
    setReason(action === 'suspend' ? reasonPrefill : '');
    setPending(action);
    queueMicrotask(() => (reasonRef.current as HTMLElement | null)?.focus());
  };

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    setError('');
    try {
      const text = reason.trim();
      if (pending === 'delete') await onDelete(text);
      else await onChangeStatus(pending === 'deactivate' ? 'INACTIVE' : pending === 'suspend' ? 'SUSPENDED' : 'ACTIVE', text);
      setPending(null);
      setReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const valid = reason.trim().length >= MIN && reason.trim().length <= MAX;
  const copy = pending ? COPY[pending] : null;

  return (
    <div className="member-actions">
      <div className="page-head__actions">
        {actions.map((action) =>
          action === 'delete' || action === 'suspend' ? (
            <OutlinedButton key={action} onClick={() => open(action)}>
              {COPY[action].button}
            </OutlinedButton>
          ) : (
            <FilledButton key={action} onClick={() => open(action)}>
              {COPY[action].button}
            </FilledButton>
          ),
        )}
      </div>

      {copy && pending && (
        <sky-feature-card color="surface-high" variant="outlined" icon="info" icon-style="surface" headline={copy.title} text={copy.body}>
          <OutlinedTextField
            ref={reasonRef as RefObject<never>}
            data-testid="status-reason"
            label={`Reason (${MIN} to ${MAX} characters)`}
            type="textarea"
            rows={3}
            required
            value={reason}
            onInput={(e: Event) => setReason((e.target as HTMLTextAreaElement).value)}
          />
          {error && (
            <p className="error-state" role="alert">
              {error}
            </p>
          )}
          <FilledButton slot="actions" disabled={busy || !valid} onClick={confirm}>
            {copy.confirm}
          </FilledButton>
          <TextButton
            slot="actions"
            onClick={() => {
              setPending(null);
              setReason('');
            }}
          >
            Cancel
          </TextButton>
        </sky-feature-card>
      )}
    </div>
  );
}

export default MemberHeaderActions;
```

- [ ] **Step 4: Implement `member-documents-tab.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { FilledButton, OutlinedButton, OutlinedTextField, TextButton } from '@skylabs-monorepo/shared-ui/react';
import type { VendorDocumentType } from '../../../../api/rbac/vendors';
import {
  deleteMemberDocument,
  listMemberDocuments,
  reviewMemberDocument,
  uploadMemberDocument,
  type MemberDocumentRow,
  type MemberDocumentStatus,
} from '../../../../api/rbac/members';
import { ApiRequestError } from '../../../../api/rbac/client';

const TYPES: { type: VendorDocumentType; label: string; numberLabel: string }[] = [
  { type: 'AADHAAR', label: 'Aadhaar card', numberLabel: 'Aadhaar number' },
  { type: 'PAN', label: 'PAN card', numberLabel: 'PAN number' },
  { type: 'GST', label: 'GST registration', numberLabel: 'GST number' },
];

const STATUS_LABEL: Record<MemberDocumentStatus | 'MISSING', string> = {
  MISSING: 'Missing',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
};
const STATUS_VARIANT: Record<MemberDocumentStatus | 'MISSING', 'primary' | 'secondary' | 'tertiary' | 'error'> = {
  MISSING: 'tertiary',
  SUBMITTED: 'secondary',
  APPROVED: 'primary',
  REJECTED: 'error',
  EXPIRED: 'error',
};

interface Props {
  token: string | null;
  memberId: string;
  canEdit: boolean;
  canApprove: boolean;
  canReject: boolean;
  onChanged: () => void;
}

export function MemberDocumentsTab({ token, memberId, canEdit, canApprove, canReject, onChanged }: Props) {
  const [rows, setRows] = useState<MemberDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [numbers, setNumbers] = useState<Partial<Record<VendorDocumentType, string>>>({});
  const [rejecting, setRejecting] = useState<VendorDocumentType | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await listMemberDocuments(token, memberId);
      setRows(data);
      setError('');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load documents.');
    } finally {
      setLoading(false);
    }
  }, [token, memberId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (done: string, action: () => Promise<unknown>) => {
    setError('');
    setMessage('');
    try {
      await action();
      setMessage(done);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'That did not work. Try again.');
    }
  };

  const upload = (type: VendorDocumentType, file: File | undefined) => {
    if (!file) return;
    void run('Document uploaded for the member.', () => uploadMemberDocument(token, memberId, type, file, file.name, numbers[type]));
  };

  if (loading) return <p className="loading-state">Loading documents…</p>;

  return (
    <div className="admin-tab-panel" aria-label="Documents">
      {message && <p className="field-hint" role="status">{message}</p>}
      {error && <p className="error-state" role="alert">{error}</p>}

      <ul className="document-list">
        {TYPES.map(({ type, label, numberLabel }) => {
          const row = rows.find((r) => r.documentType === type);
          const state: MemberDocumentStatus | 'MISSING' = row?.status ?? 'MISSING';
          return (
            <li key={type} className="document-row">
              <div>
                <h3>{label}</h3>
                <sky-badge variant={STATUS_VARIANT[state]}>{STATUS_LABEL[state]}</sky-badge>
                {row?.numberMasked && <p>{row.numberMasked}</p>}
                {row?.uploadedOnBehalf && <p className="field-hint">Uploaded by staff for the member</p>}
                {row?.status === 'REJECTED' && row.rejectionReason && <p className="error-state">Rejected: {row.rejectionReason}</p>}
                {row?.originalFilename && <p className="field-hint">{row.originalFilename}</p>}
              </div>

              {canEdit && (
                <div className="document-row__upload">
                  <OutlinedTextField
                    label={numberLabel}
                    value={numbers[type] ?? ''}
                    onInput={(e: Event) => setNumbers((n) => ({ ...n, [type]: (e.target as HTMLInputElement).value }))}
                  />
                  <label className="field-hint">
                    {row ? 'Replace file' : 'Upload file'}
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      onChange={(e) => upload(type, e.target.files?.[0])}
                    />
                  </label>
                  {row && row.status !== 'APPROVED' && (
                    <TextButton onClick={() => run('Document removed.', () => deleteMemberDocument(token, memberId, type))}>Remove</TextButton>
                  )}
                </div>
              )}

              {row?.status === 'SUBMITTED' && (canApprove || canReject) && (
                <div className="document-row__review">
                  {canApprove && (
                    <FilledButton onClick={() => run('Document approved.', () => reviewMemberDocument(token, memberId, type, { decision: 'APPROVED' }))}>
                      Approve
                    </FilledButton>
                  )}
                  {canReject && <OutlinedButton onClick={() => { setRejecting(type); setRejectReason(''); }}>Reject</OutlinedButton>}
                </div>
              )}

              {rejecting === type && (
                <div className="document-row__reject">
                  <OutlinedTextField
                    label="Rejection reason (10 to 500 characters)"
                    type="textarea"
                    rows={3}
                    value={rejectReason}
                    onInput={(e: Event) => setRejectReason((e.target as HTMLTextAreaElement).value)}
                  />
                  <FilledButton
                    disabled={rejectReason.trim().length < 10}
                    onClick={() =>
                      run('Document rejected.', async () => {
                        await reviewMemberDocument(token, memberId, type, { decision: 'REJECTED', reason: rejectReason.trim() });
                        setRejecting(null);
                      })
                    }
                  >
                    Confirm reject
                  </FilledButton>
                  <TextButton onClick={() => setRejecting(null)}>Cancel</TextButton>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default MemberDocumentsTab;
```

- [ ] **Step 5: Write the failing documents tab test**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemberDocumentsTab } from './member-documents-tab';

const listMock = vi.fn();
vi.mock('../../../../api/rbac/members', () => ({
  listMemberDocuments: (...a: unknown[]) => listMock(...a),
  uploadMemberDocument: vi.fn(),
  deleteMemberDocument: vi.fn(),
  reviewMemberDocument: vi.fn(),
}));

const ROWS = [
  { id: 'd1', documentType: 'PAN', status: 'SUBMITTED', numberMasked: 'ABXXXXX34F', rejectionReason: null, uploadedOnBehalf: true, originalFilename: 'pan.pdf' },
  { id: 'd2', documentType: 'GST', status: 'REJECTED', numberMasked: '27ABCDE1234F1Z5', rejectionReason: 'Scan is blurry', uploadedOnBehalf: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  listMock.mockResolvedValue({ data: ROWS });
});

describe('MemberDocumentsTab', () => {
  it('shows a row per required document with status, masked number and who uploaded', async () => {
    render(<MemberDocumentsTab token="t" memberId="m1" canEdit canApprove canReject onChanged={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('PAN card')).toBeTruthy());
    expect(screen.getByText('Aadhaar card')).toBeTruthy();
    expect(screen.getByText('ABXXXXX34F')).toBeTruthy();
    expect(screen.getByText(/uploaded by staff for the member/i)).toBeTruthy();
    expect(screen.getByText(/scan is blurry/i)).toBeTruthy();
    expect(document.querySelectorAll('sky-badge').length).toBe(3);
  });

  it('read only viewers see no upload or review controls', async () => {
    render(<MemberDocumentsTab token="t" memberId="m1" canEdit={false} canApprove={false} canReject={false} onChanged={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('PAN card')).toBeTruthy());
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByText('Approve')).toBeNull();
  });
});
```

- [ ] **Step 6: Implement `member-activity-tab.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { getMemberActivity, type ActivityItem } from '../../../../api/rbac/members';
import { ApiRequestError } from '../../../../api/rbac/client';

export function MemberActivityTab({ token, memberId, refreshKey }: { token: string | null; memberId: string; refreshKey: number }) {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    getMemberActivity(token, memberId)
      .then(({ data }) => live && setItems(data))
      .catch((err) => live && setError(err instanceof ApiRequestError ? err.message : 'Could not load activity.'));
    return () => {
      live = false;
    };
  }, [token, memberId, refreshKey]);

  if (error) return <p className="error-state" role="alert">{error}</p>;
  if (!items) return <p className="loading-state">Loading activity…</p>;
  if (items.length === 0) return <p className="empty-state">No activity yet.</p>;

  return (
    <ol className="admin-tab-panel activity-list" aria-label="Activity">
      {items.map((item, index) => (
        <li key={`${item.at}-${index}`}>
          <p>{item.summary}</p>
          {item.detail && <p className="field-hint">Reason: {item.detail}</p>}
          <p className="field-hint">{new Date(item.at).toLocaleString('en-GB')}</p>
        </li>
      ))}
    </ol>
  );
}

export default MemberActivityTab;
```

- [ ] **Step 7: Implement `member-detail-page.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getMember, changeMemberStatus, deleteMember } from '../../../../api/rbac/members';
import type { Vendor } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useSetBreadcrumbs } from '../../../admin/breadcrumb-context';
import { ChipNav } from '../../../components/chip-nav/chip-nav';
import { BranchesListPage } from './branches-list-page';
import { DealsListPage } from './deals-list-page';
import { TherapistsListPage } from './therapists-list-page';
import { ProductsListPage } from './products-list-page';
import { VendorProfileForm } from './vendor-profile-form';
import { updateVendor } from '../../../../api/rbac/vendors';
import { MemberHeaderActions } from './member-header-actions';
import { MemberDocumentsTab } from './member-documents-tab';
import { MemberActivityTab } from './member-activity-tab';
import { MEMBER_STATUS_LABEL, documentsChipLabel, dueDateLabel, statusBadgeVariant } from './member-status';

const TABS = [
  { value: 'profile', label: 'Profile' },
  { value: 'documents', label: 'Documents' },
  { value: 'branches', label: 'Branches' },
  { value: 'deals', label: 'Deals' },
  { value: 'therapists', label: 'Therapists' },
  { value: 'products', label: 'Products' },
  { value: 'activity', label: 'Activity' },
];
type Tab = 'profile' | 'documents' | 'branches' | 'deals' | 'therapists' | 'products' | 'activity';

/** One member's page: `/account/members/:memberId[/:tab]`. */
export function MemberDetailPage() {
  const { memberId, section } = useParams<{ memberId: string; section?: string }>();
  const navigate = useNavigate();
  const { token, can } = useAuth();

  const canView = can('members', 'view');
  const canEdit = can('members', 'edit');
  const canApprove = can('members', 'approve');
  const canReject = can('members', 'reject');
  const canStatusChange = can('members', 'status_change');
  const canDelete = can('members', 'delete');

  const tab: Tab = TABS.some((t) => t.value === section) ? (section as Tab) : 'profile';

  const [member, setMember] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [activityKey, setActivityKey] = useState(0);
  const statusRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!memberId) return;
      if (!silent) setLoading(true);
      try {
        const { data } = await getMember(token, memberId);
        setMember(data);
        setLoadError('');
      } catch (err) {
        if (!silent) setLoadError(err instanceof ApiRequestError ? err.message : 'Could not load this member.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [token, memberId],
  );

  useEffect(() => {
    load();
  }, [load]);

  const name = member ? member.businessName || member.owner?.name || 'New member' : 'Member';
  useSetBreadcrumbs([
    { label: 'Members' },
    { label: 'All Member', to: '/account/members' },
    { label: name },
  ]);

  if (!canView) return <p className="empty-state">You do not have access to Member Management.</p>;
  if (loading) {
    return (
      <div className="admin-page admin-page--wide">
        <p className="loading-state">Loading member…</p>
      </div>
    );
  }
  if (loadError || !member) {
    return (
      <div className="admin-page admin-page--wide">
        <p className="error-state" role="alert">{loadError || 'Member not found.'}</p>
        <Link to="/account/members">Back to all members</Link>
      </div>
    );
  }

  const refreshed = async (done: string) => {
    setMessage(done);
    setError('');
    setActivityKey((k) => k + 1);
    await load(true);
  };

  const onChangeStatus = async (status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED', reason: string) => {
    await changeMemberStatus(token, member.id, status, reason);
    await refreshed(
      status === 'SUSPENDED' ? 'Member suspended. They were told by email and SMS.' : status === 'INACTIVE' ? 'Member is inactive and view only.' : 'Member is active again.',
    );
  };

  const onDelete = async (reason: string) => {
    const { data } = await deleteMember(token, member.id, reason);
    navigate('/account/members', { replace: true, state: { notice: data.outcome === 'ARCHIVED' ? 'Member archived. Records are kept.' : 'Member deleted.' } });
  };

  const saveProfile = async (input: Parameters<typeof updateVendor>[2]) => {
    setSaving(true);
    setError('');
    try {
      await updateVendor(token, member.id, input);
      await refreshed('Profile saved.');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save the profile.');
    } finally {
      setSaving(false);
    }
  };

  const summary = member.documentsSummary;
  const due = dueDateLabel(summary);
  const reviewFlagged = Boolean(member.reviewFlaggedAt);

  return (
    <div className="admin-page admin-page--wide">
      <title>{`${name} · MSD`}</title>
      <header className="page-head">
        <div>
          <h1 ref={statusRef}>{name}</h1>
          <p>
            <sky-badge variant={statusBadgeVariant(member.status)}>{MEMBER_STATUS_LABEL[member.status]}</sky-badge>{' '}
            <sky-badge variant={summary?.complete ? 'primary' : 'tertiary'}>{documentsChipLabel(summary)}</sky-badge>
            {due && <span className="field-hint"> {due}</span>}
          </p>
          {reviewFlagged && member.status !== 'SUSPENDED' && (
            <p>
              <sky-badge variant="error">Ready for suspension review</sky-badge>
            </p>
          )}
        </div>
        <MemberHeaderActions
          status={member.status}
          canStatusChange={canStatusChange}
          canDelete={canDelete}
          reasonPrefill={reviewFlagged ? 'Documents not completed' : ''}
          onChangeStatus={onChangeStatus}
          onDelete={onDelete}
        />
      </header>

      {member.status === 'SUSPENDED' && (
        <p className="error-state" role="status">
          This member cannot log in and the website hides their profile, branches, deals, therapists and products.
          {member.statusReason ? ` Reason: ${member.statusReason}` : ''}
        </p>
      )}
      {member.status === 'INACTIVE' && (
        <p className="field-hint" role="status">
          This member is inactive. They can look at everything but cannot change anything, and their items are hidden from the website.
        </p>
      )}
      {message && <p className="field-hint" role="status">{message}</p>}
      {error && <p className="error-state" role="alert">{error}</p>}

      <ChipNav
        items={TABS}
        value={tab}
        onSelect={(value) => navigate(`/account/members/${member.id}/${value}`)}
        ariaLabel="Member sections"
      />

      {tab === 'profile' && (
        <div className="admin-tab-panel" aria-label="Profile">
          <VendorProfileForm
            vendor={member}
            canEdit={canEdit}
            canReviewKyc={false}
            saving={saving}
            token={token}
            sections={['business', 'owner', 'address', 'bank']}
            onSave={saveProfile}
          />
        </div>
      )}

      {tab === 'documents' && (
        <MemberDocumentsTab
          token={token}
          memberId={member.id}
          canEdit={canEdit}
          canApprove={canApprove}
          canReject={canReject}
          onChanged={() => refreshed('Documents updated.')}
        />
      )}

      {tab === 'branches' && (
        <div className="admin-tab-panel" aria-label="Branches">
          <BranchesListPage token={token} vendorId={member.id} canEdit={canEdit} />
        </div>
      )}
      {tab === 'deals' && (
        <div className="admin-tab-panel" aria-label="Deals">
          <DealsListPage token={token} vendorId={member.id} canEdit={canEdit} canDelete={canDelete} />
        </div>
      )}
      {tab === 'therapists' && (
        <div className="admin-tab-panel" aria-label="Therapists">
          <TherapistsListPage token={token} vendorId={member.id} canEdit={canEdit} canDelete={canDelete} />
        </div>
      )}
      {tab === 'products' && (
        <div className="admin-tab-panel" aria-label="Products">
          <ProductsListPage token={token} vendorId={member.id} canEdit={canEdit} canDelete={canDelete} />
        </div>
      )}

      {tab === 'activity' && <MemberActivityTab token={token} memberId={member.id} refreshKey={activityKey} />}
    </div>
  );
}

export default MemberDetailPage;
```

Check `updateVendor`'s real signature in `api/rbac/vendors.ts` (`grep -n "export function updateVendor"`) and match the call. If the form's `sections` prop type is `VendorFormSection[]`, confirm `'business' | 'owner' | 'address' | 'bank'` are valid values (`grep -n "VendorFormSection" vendor-profile-form.tsx`).

- [ ] **Step 8: Write the failing detail page test**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Vendor } from '../../../../api/rbac/vendors';
import { BreadcrumbProvider } from '../../../admin/breadcrumb-context';
import { MemberDetailPage } from './member-detail-page';

const getMemberMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => useAuthMock() }));
vi.mock('../../../../api/rbac/members', () => ({
  getMember: (...a: unknown[]) => getMemberMock(...a),
  changeMemberStatus: vi.fn(),
  deleteMember: vi.fn(),
  listMemberDocuments: vi.fn().mockResolvedValue({ data: [] }),
  getMemberActivity: vi.fn().mockResolvedValue({ data: [] }),
}));
vi.mock('./branches-list-page', () => ({ BranchesListPage: () => <p>branches-tab</p> }));
vi.mock('./deals-list-page', () => ({ DealsListPage: () => <p>deals-tab</p> }));
vi.mock('./therapists-list-page', () => ({ TherapistsListPage: () => <p>therapists-tab</p> }));
vi.mock('./products-list-page', () => ({ ProductsListPage: () => <p>products-tab</p> }));
vi.mock('./vendor-profile-form', () => ({ VendorProfileForm: () => <p>profile-form</p> }));

const MEMBER = {
  id: 'm1',
  businessName: 'Vitality Wellness',
  status: 'ACTIVE',
  statusReason: null,
  reviewFlaggedAt: null,
  owner: { id: 'o1', name: 'Arjun', status: 'active', roles: [] },
  documentsSummary: { complete: false, missing: ['PAN'], rejected: [], dueAt: '2026-10-20T00:00:00Z', overdue: false },
} as unknown as Vendor;

function renderAt(path: string) {
  render(
    <BreadcrumbProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/account/members/:memberId" element={<MemberDetailPage />} />
          <Route path="/account/members/:memberId/:section" element={<MemberDetailPage />} />
        </Routes>
      </MemoryRouter>
    </BreadcrumbProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getMemberMock.mockResolvedValue({ data: MEMBER });
  useAuthMock.mockReturnValue({ token: 't', can: () => true });
});

describe('MemberDetailPage', () => {
  it('shows the status chip, the documents chip and the due date in the header', async () => {
    renderAt('/account/members/m1');
    await waitFor(() => expect(screen.getByText('Vitality Wellness')).toBeTruthy());
    const badges = [...document.querySelectorAll('sky-badge')].map((b) => b.textContent);
    expect(badges).toContain('Active');
    expect(badges).toContain('Documents incomplete');
    expect(screen.getByText(/Due 20 Oct 2026/)).toBeTruthy();
  });

  it('opens the profile tab by default and the deals tab from the URL', async () => {
    renderAt('/account/members/m1');
    await waitFor(() => expect(screen.getByText('profile-form')).toBeTruthy());
    renderAt('/account/members/m1/deals');
    await waitFor(() => expect(screen.getByText('deals-tab')).toBeTruthy());
  });

  it('explains a suspended member', async () => {
    getMemberMock.mockResolvedValue({ data: { ...MEMBER, status: 'SUSPENDED', statusReason: 'Documents not completed' } });
    renderAt('/account/members/m1');
    await waitFor(() => expect(screen.getByText(/cannot log in/i)).toBeTruthy());
    expect(screen.getByText(/Documents not completed/)).toBeTruthy();
  });

  it('shows the review badge only while the member is not suspended', async () => {
    getMemberMock.mockResolvedValue({ data: { ...MEMBER, reviewFlaggedAt: '2026-10-14T00:00:00Z' } });
    renderAt('/account/members/m1');
    await waitFor(() => expect(screen.getByText('Ready for suspension review')).toBeTruthy());
  });

  it('shows an access message without members:view', async () => {
    useAuthMock.mockReturnValue({ token: 't', can: () => false });
    renderAt('/account/members/m1');
    expect(screen.getByText(/do not have access/i)).toBeTruthy();
  });
});
```

- [ ] **Step 9: Point the route at the new page and delete dead files**

```bash
cd apps/msd/src/app
sed -i "s#import { VendorDetailPage } from './pages/account/members/vendor-detail-page';#import { MemberDetailPage } from './pages/account/members/member-detail-page';#; s#<VendorDetailPage />#<MemberDetailPage />#g; s#/account/members/:vendorId/:section#/account/members/:memberId/:section#; s#path=\"/account/members/:vendorId\"#path=\"/account/members/:memberId\"#" routes.tsx
cd pages/account/members
git rm -q vendor-detail-page.tsx vendor-detail-page.test.tsx vendor-detail-customers.tsx vendor-detail-orders.tsx vendor-pipeline.tsx vendor-pipeline.test.tsx vendor-setup.ts vendor-setup.test.ts vendor-wizard-*.tsx
grep -rn "vendor-setup\|vendor-pipeline\|vendor-wizard\|vendor-detail-" .. ../../../.. --include=*.ts --include=*.tsx | head
```

Expected: no remaining import. The branch, deal, therapist and product form routes keep `:vendorId` as their param name (the form pages read `useParams().vendorId`); only the detail routes changed. Do not rename those params.

- [ ] **Step 10: Run the new tests and the whole msd suite**

```bash
cd apps/msd && npx vitest run src/app/pages/account/members
cd ../.. && npx nx run msd:lint && npx nx run msd:test
```

Expected: new tests PASS; failures limited to the known `app.spec.tsx` (1) and `otp.test.tsx` (2). Fix any test that still references removed vendor pipeline exports by deleting it if it only covered removed behavior.

- [ ] **Step 11: Commit**

```bash
git add apps/msd/src
git commit -m "feat(msd): Rebuild member detail with status actions, documents and activity"
```

---

### Task 21: Inactive banner and self-service cleanup

**Files:**
- Modify: `apps/msd/src/app/layouts/admin-layout.tsx`, `apps/msd/src/app/pages/account/members/members.tsx`, `apps/msd/src/app/pages/account/members/vendor-profile-form.tsx`
- Create: `apps/msd/src/app/layouts/admin-layout.member-banner.test.tsx`

- [ ] **Step 1: Write the failing banner test**

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { MemberStatusBanner } from './admin-layout';

describe('MemberStatusBanner', () => {
  it('tells an inactive member the account is view only', () => {
    render(<MemoryRouter><MemberStatusBanner status="INACTIVE" /></MemoryRouter>);
    expect(screen.getByRole('status').textContent).toMatch(/inactive and view only/i);
  });

  it('renders nothing for an active member or a non member', () => {
    const { container, rerender } = render(<MemoryRouter><MemberStatusBanner status="ACTIVE" /></MemoryRouter>);
    expect(container.textContent).toBe('');
    rerender(<MemoryRouter><MemberStatusBanner status={undefined} /></MemoryRouter>);
    expect(container.textContent).toBe('');
  });
});
```

- [ ] **Step 2: Implement in `admin-layout.tsx`**

Export a small component and render it under the preview banner:

```tsx
/** Shown on every console screen while the signed in member's account is inactive. */
export function MemberStatusBanner({ status }: { status?: string }) {
  if (status !== 'INACTIVE') return null;
  return (
    <p className="field-hint" role="status">
      Your account is inactive and view only. You can look at everything, but you cannot change anything. Contact support to reactivate it.
    </p>
  );
}
```

and inside the layout JSX, next to the `isPreviewing` banner: `<MemberStatusBanner status={bootstrap?.member?.status} />`.

- [ ] **Step 3: Remove the submit-for-verification wiring from the self-service page**

In `members.tsx` `useMyVendor`: delete `createMyVendor` and `submitMyVendor` use. The hook's `save` always calls `updateMyVendor`. Remove `notFound` branches that offered "create your profile" (a member always exists now) and replace the not found case with the message `Your member profile was not found. Please contact support.` In `SelfVendorManagement` change the subtitle to `Status: ${MEMBER_STATUS_LABEL[vendor.status]}` and remove the `onSubmitForVerification={submit}` prop. In `vendor-profile-form.tsx` delete the "Submit for verification" button block and the `onSubmitForVerification` prop, and the KYC section's `canReviewKyc` review buttons (`onKycReview`).

- [ ] **Step 4: Run lint, tsc and tests**

```bash
cd apps/msd && npx tsc -p tsconfig.app.json --noEmit
cd ../.. && npx nx run msd:lint && npx nx run msd:test
```

Fix `vendor-profile-form.test.tsx` cases that exercised submit or KYC review by deleting them.

- [ ] **Step 5: Commit**

```bash
git add apps/msd/src
git commit -m "feat(msd): Show the inactive banner and remove submit for verification"
```

---

## PART C: VERIFY AND TRACK

### Task 22: Full verification, docs and task list

**Files:** Modify `docs/msd/ADMIN_RBAC_TASKS.md`, `docs/msd/ADMIN_RBAC_MASTER_PLAN.md`, `docs/superpowers/specs/2026-10-15-staff-member-management-design.md`, `CLAUDE.md`, `TASK.md`.

- [ ] **Step 1: Run the whole gate**

```bash
npx nx run-many -t lint test build --projects=shared-types,shared-permissions,shared-menu,shared-auth,msd,msd-api
npx prisma validate --schema=apps/msd-api/prisma/schema.prisma
```

Expected: green apart from the known failures listed in Rules. Record the counts.

- [ ] **Step 2: Rehearse the migration when Postgres is available** (skip and say so if it is not)

```bash
# 1. restore a Neon copy into a local database, set DATABASE_URL in apps/msd-api/.env.local
npx tsx apps/msd-api/prisma/member-status-report.ts
npx prisma migrate deploy --schema=apps/msd-api/prisma/schema.prisma
npx tsx apps/msd-api/prisma/member-status-report.ts   # statuses now ACTIVE, INACTIVE, SUSPENDED only
npx prisma db seed --schema=apps/msd-api/prisma/schema.prisma
npx prisma db seed --schema=apps/msd-api/prisma/schema.prisma   # second run must change nothing
```

Then check drift: `npx prisma migrate diff --from-migrations apps/msd-api/prisma/migrations --to-schema-datamodel apps/msd-api/prisma/schema.prisma --shadow-database-url <empty db url> --script` prints nothing.

- [ ] **Step 3: Update `docs/msd/ADMIN_RBAC_TASKS.md`**

Tick `[x]` for the tasks this slice completes: P1-02, P1-03, P2-03, P2-04, P3-01, P3-02, P3-03, P3-04, P3-06, P3-07, P3-08, P3-09, P3-10, P3-11 (welcome sent on create), P3-12, P3-13, P3-17, P3-18, P3-19, P3-21, P5-01, P5-02, P5-05, P5-07, P5-09, P5-11, P6-03 (minimal), P10-05 (members routes), P10-11, P10-12, P10-13, P10-14, P10-15, P10-16, P10-17, P10-18 and the partial ones P5-06, P5-08, P10-03, P10-04, P10-19 marked "partly" in their Done when text. P3-05 (service rename) stays open: the service files keep `vendor` names. P3-20 becomes "env vars `SUPPORT_EMAIL` and `SUPPORT_PHONE`" (done). Recompute the progress table and the by-area and by-size lines. Add new tasks at the end of their phases for what this slice deliberately left:
- P3-22 BE: rename `vendor.service.ts`, `vendors.routes.ts` and `Vendor*` Zod schemas to member names (S).
- P5-14 BE: signed URL download for documents (replaces returning `storageKey`) (M).
- P6-08 BE: durable retry for failed member notices (S).
- P4-13 BE: grant `members:view` and `members:edit` with own scope to role `member`, then retire `members:custom` (M).

- [ ] **Step 4: Record the deviations**

In the spec file section 3 add a "Deviations during planning" list with the four items from the top of this plan. In `ADMIN_RBAC_MASTER_PLAN.md` section 4.2 change S4 and S5 to "done" and add decision row D22: "Support contact is env vars until SystemSetting exists."

- [ ] **Step 5: Update `CLAUDE.md` and `TASK.md`**

`CLAUDE.md`: in "Default roles" replace `vendor` with `member` and add `support`; in the permission model examples use `members:*`; replace the "Vendors" module wording in Repo State with "Members (+ KYC documents, branches, therapists)". `TASK.md`: add a line under done for the member lifecycle slice and point to the plan.

- [ ] **Step 6: Commit** (docs only, one commit)

```bash
git add docs CLAUDE.md TASK.md
git commit -m "docs(msd): Record member management slice and task list status"
```

---

## Self-review against the spec

| Spec requirement | Task |
|---|---|
| Full rename `Vendor` to `Member`, same tables | 2, 3 |
| `MemberStatus`, backfill D1, reason for migrated REJECTED | 2 |
| Document status, masked number, hash, encrypted number, uploader fields | 2, 9, 10 |
| `MemberStatusHistory` | 2, 8, 12 |
| Roles `member` and `support`, `members` key and matrix row | 4 |
| Status machine and reasons 10 to 500 | 5, 8 |
| Suspend revokes sessions, hides, notifies by email and SMS | 6, 8, 14 |
| Suspended login and OTP refused with reason and steps | 7 |
| Inactive read only, GET open, logout and refresh exempt | 7 |
| Delete only from Suspended, hard delete or archive | 8 |
| Short add form, ACTIVE on create, 14 day timer, welcome message | 11, 13, 19 |
| `/members` routes, `/vendors` alias with Deprecation header | 13 |
| Remove approve, reject, submit, public register | 11, 13 |
| Documents checklist, upload on behalf, approve and reject with reason, support sees no files | 10, 13, 20 |
| Storefront hides suspended and inactive, restores on reactivate | 14 (guard test, city list fix) |
| List filters, chips, due date, review flag badge | 11, 18, 20 |
| Detail tabs and header actions | 20 |
| Inactive banner | 21 |
| Task list re-check | 22 |
| Seed aligned (roles, grants, demo members) | 4, 15 |

Known gaps recorded as tasks: own scope for role `member` (P4-13), signed URLs (P5-14), notice retry queue (P6-08), service file rename (P3-22).
