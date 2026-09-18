import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { CreateCustomerSchema } from './business.schema';

extendZodWithOpenApi(z);

/**
 * The self-editable allow-list a customer may set on their own record via
 * `PATCH /customers/me` — profile/contact/address fields only. Excludes the fields that are
 * always staff-only: `verificationStatus`/`accountStatus` (verification/portal-login-gate
 * outcomes, never self-set — mirrors `Driver.status`/`accountStatus` staying staff-only),
 * `registrationSource` (internal lead-tracking, mirrors `Driver.sourceType`), and `notes`
 * (internal staff notes).
 *
 * Derived from `CreateCustomerSchema` via `.omit()` rather than duplicated by hand, so it
 * automatically inherits the same field types/validation and any future additions there —
 * same technique as `UpdateOwnDriverSchema`.
 */
export const UpdateOwnCustomerSchema = CreateCustomerSchema.omit({
  verificationStatus: true,
  accountStatus: true,
  registrationSource: true,
  notes: true,
})
  .partial()
  .openapi('UpdateOwnCustomer');
