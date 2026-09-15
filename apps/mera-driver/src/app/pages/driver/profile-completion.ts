import type { DriverSelf } from '../../core/drivers/driver-self-api.service';

export interface CompletionSection {
  key: string;
  label: string;
  complete: boolean;
}

export interface ProfileCompletion {
  percentage: number;
  completedCount: number;
  totalCount: number;
  sections: CompletionSection[];
  incompleteSections: CompletionSection[];
  /** 'incomplete' below 50%, 'almost-complete' below 100%, 'complete' at 100%. */
  status: 'incomplete' | 'almost-complete' | 'complete';
}

function has(value: string | null | undefined): boolean {
  return !!value && value.trim().length > 0;
}

/**
 * The single source of truth for "how complete is this driver's profile" — reused by the
 * completion card and (if needed elsewhere) any other view. Built entirely from fields
 * already on `DriverSelf` (the real `/drivers/me` response shape) — no invented fields, and
 * never counts a staff-only field (`status`/`verificationNotes` aren't even present on this
 * type, since the driver-facing API omits them from the self-edit surface).
 *
 * Each section is all-or-nothing complete (every required field in it must be filled) —
 * matches the "N of M sections complete" framing the profile page shows.
 */
export function calculateProfileCompletion(driver: DriverSelf): ProfileCompletion {
  const sections: CompletionSection[] = [
    {
      key: 'basic',
      label: 'Basic Information',
      complete: has(driver.firstName) && has(driver.phone) && has(driver.dob) && has(driver.gender) && has(driver.address),
    },
    {
      key: 'kyc',
      label: 'KYC / Driver Information',
      complete: has(driver.dlNo) && has(driver.licenseDetails) && driver.documents.length > 0,
    },
    {
      key: 'languages',
      label: 'Languages',
      complete: driver.languages.length > 0,
    },
    {
      key: 'bank',
      label: 'Bank / Payout Details',
      complete: has(driver.bankName) && has(driver.bankAccountNo) && has(driver.ifscCode),
    },
  ];

  const completedCount = sections.filter((s) => s.complete).length;
  const totalCount = sections.length;
  const percentage = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);
  const status = percentage === 100 ? 'complete' : percentage >= 50 ? 'almost-complete' : 'incomplete';

  return {
    percentage,
    completedCount,
    totalCount,
    sections,
    incompleteSections: sections.filter((s) => !s.complete),
    status,
  };
}
