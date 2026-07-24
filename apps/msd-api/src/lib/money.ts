/** Storage is a single Int (paise), INR-only for launch — this wraps it back into
 *  the `{ amount, currency }` shape the API contract (docs/api-schema/msd) documents. */
export function money(paise: number) {
  return { amount: paise, currency: 'INR' as const };
}
