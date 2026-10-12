import { describe, expect, it } from 'vitest';
import { currentLicence } from './licence-policy.service';

describe('Saved licence validity', () => {
  const today = new Date('2026-09-30T23:59:59Z');
  it('includes the expiry date and rejects yesterday', () => {
    expect(currentLicence('2026-09-30', today)).toBe(true);
    expect(currentLicence('2026-09-29', today)).toBe(false);
  });
  it('requires a real calendar date in the saved form format', () => {
    for (const value of [null, '', '30-09-2027', '2027-02-29', '2027-13-01', '2027-04-31']) expect(currentLicence(value, today)).toBe(false);
    expect(currentLicence('2028-02-29', today)).toBe(true);
  });
});
