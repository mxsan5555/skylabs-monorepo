/** Saved licence dates use the existing date form's YYYY-MM-DD representation.
 * Validity includes the expiry date. Unknown date formats require human correction. */
export function currentLicence(expiry: string | null | undefined, now = new Date()): boolean {
  if (!expiry || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return false;
  const date = new Date(`${expiry}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === expiry && expiry >= now.toISOString().slice(0,10);
}
