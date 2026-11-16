/** Formats paise as INR — shared by the Fee/Earnings/Trips pages. */
export function money(paise: number | null | undefined): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format((paise ?? 0) / 100);
}
