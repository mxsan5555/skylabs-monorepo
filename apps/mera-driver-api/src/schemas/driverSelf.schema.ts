import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { CreateDriverSchema } from './business.schema';

extendZodWithOpenApi(z);

/**
 * The broad self-editable allow-list a driver may set on their own record via
 * `PATCH /drivers/me` — everything a driver would reasonably self-attest (profile, DL
 * number/dates, bank/payout details) EXCEPT the fields that are always staff-only:
 * `status`/`policeVerifiedStatus`/`policeVerifiedNo` (verification outcomes, never
 * self-set), `sourceType` (internal lead-tracking), and `driverType`/`jobType`/`experience`/
 * `currentSalary`/`expectedSalary`/`amount`/`paymentReceiptDate` (internal HR/payroll
 * fields staff enters during onboarding, not something a driver retroactively edits).
 * `verificationNotes` isn't in `CreateDriverSchema` at all, so it's excluded by omission.
 *
 * Derived from `CreateDriverSchema` via `.omit()` rather than duplicated by hand, so it
 * automatically inherits the same field types/validation and any future additions there.
 */
export const UpdateOwnDriverSchema = CreateDriverSchema.omit({
  status: true,
  policeVerifiedStatus: true,
  policeVerifiedNo: true,
  sourceType: true,
  driverType: true,
  jobType: true,
  experience: true,
  currentSalary: true,
  expectedSalary: true,
  amount: true,
  paymentReceiptDate: true,
  // Onboarding-wizard bookkeeping — admin-console-only concept, not part of the driver's
  // own self-service surface.
  stepCompleted: true,
})
  .partial()
  .extend({
    languages: z.array(z.string()).optional(),
  })
  .openapi('UpdateOwnDriver');
