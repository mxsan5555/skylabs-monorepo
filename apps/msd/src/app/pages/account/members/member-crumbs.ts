import type { Crumb } from '../../../admin/breadcrumb-context';

/** The start of every Vendors breadcrumb trail (P10-47: one source, so the label can't drift). */
export const MEMBERS_TRAIL: Crumb[] = [{ label: 'Vendors' }, { label: 'All vendors', to: '/account/members' }];

/** Vendors > All vendors > the vendor, linked to its page. `name` is null until it loads. */
export function memberTrail(memberId: string | undefined, name: string | null): Crumb[] {
  return [...MEMBERS_TRAIL, { label: name ?? 'Vendor', to: `/account/members/${memberId}` }];
}
