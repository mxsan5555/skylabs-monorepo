import type { Deal, DealCancellationPolicy, DealPackage } from '../../../../api/rbac/vendors';

/** Console labels for deals (docs/msd/PLANNING.md §2.7). */

export const CANCELLATION_OPTIONS: { value: DealCancellationPolicy; label: string }[] = [
  { value: 'FREE_24H', label: 'Free cancellation up to 24 hours before' },
  { value: 'FREE_48H', label: 'Free cancellation up to 48 hours before' },
  { value: 'NON_REFUNDABLE', label: 'Non-refundable' },
];

/** "60 min", "60 min · 2 people", or the package name when set. */
export function packageLabel(pkg: Pick<DealPackage, 'name' | 'durationMinutes' | 'persons'>): string {
  const base = pkg.name?.trim() || `${pkg.durationMinutes} min`;
  return pkg.persons > 1 ? `${base} · ${pkg.persons} people` : base;
}

/** Whole percent off, rounded down (same rule as the API); null without a higher original. */
export function percentOff(price: number, original: number | null | undefined): number | null {
  if (original == null || original <= price || original <= 0) return null;
  return Math.floor(((original - price) / original) * 100);
}

/** "From ₹1,499" over active packages; "—" with none. */
export function fromPriceLabel(deal: Pick<Deal, 'packages'>): string {
  const prices = (deal.packages ?? []).filter((p) => p.isActive).map((p) => Number(p.sellingPrice));
  if (prices.length === 0) return '—';
  const from = `₹${Math.min(...prices).toLocaleString('en-IN')}`;
  return prices.length > 1 ? `From ${from}` : from;
}

/** `YYYY-MM-DD` for a date input from an ISO timestamp (local day). */
export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ISO timestamp for a date input: start of the day, or end of the day for a sale end. */
export function fromDateInput(value: string, endOfDay = false): string | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
