/** The storefront's one display locale. Fixed (not the browser's) so prerendered HTML and the
 *  hydrated client format numbers and dates the same way. */
export const LOCALE = 'en-IN';

export const formatINR = (n: number): string =>
  `₹${n.toLocaleString(LOCALE)}`;

/** ISO date -> "14 October 2026". */
export const formatLongDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(LOCALE, { dateStyle: 'long' });

export const pluralize = (count: number, singular: string, plural = `${singular}s`): string =>
  count === 1 ? singular : plural;

export const inputValue = (e: Event): string =>
  (e.target as unknown as { value: string }).value;

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Indian 10-digit mobile number. */
export const MOBILE_REGEX = /^[6-9]\d{9}$/;

/** "20:00" -> "08:00 PM" (zero-padded hour, matching this app's own "10:00 AM - 08:00 PM"
 *  convention) — Branch.openingHours stores plain 24-hour "HH:MM" strings; this is the only place
 *  that ever converts one to a 12-hour display, so every branch-hours render (the public vendor
 *  storefront page) goes through it rather than each call site rolling its own string-replace.
 *  Returns the raw input unchanged if it isn't a valid HH:MM string. */
export function formatTime12h(time: string): string {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) return time;
  const hour24 = Number(match[1]);
  const minute = match[2];
  const period = hour24 < 12 ? 'AM' : 'PM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${String(hour12).padStart(2, '0')}:${minute} ${period}`;
}

/** "2 min ago" / "3 hours ago" / "5 days ago" — used by notification-bell.tsx and the
 *  /account/notifications page (the only two relative-timestamp displays in this app so far). */
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `${diffHours} ${pluralize(diffHours, 'hour')} ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} ${pluralize(diffDays, 'day')} ago`;
}

/** Fills `{key}` placeholders in content.json copy ("Add {title} to cart"). Unknown keys stay as
 *  written, so a missing value is visible instead of silently blank. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}
