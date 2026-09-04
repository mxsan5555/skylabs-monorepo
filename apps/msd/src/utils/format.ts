export const formatINR = (n: number): string =>
  `₹${n.toLocaleString('en-IN')}`;

export const pluralize = (count: number, singular: string, plural = `${singular}s`): string =>
  count === 1 ? singular : plural;

export const inputValue = (e: Event): string =>
  (e.target as unknown as { value: string }).value;

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
