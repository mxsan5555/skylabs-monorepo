import type { Crumb } from '../../../admin/breadcrumb-context';

/** The start of every Members breadcrumb trail (P10-47: one source, so the label can't drift). */
export const MEMBERS_TRAIL: Crumb[] = [{ label: 'Members' }, { label: 'All members', to: '/account/members' }];

/** Members > All members > the member, linked to its page. `name` is null until it loads. */
export function memberTrail(memberId: string | undefined, name: string | null): Crumb[] {
  return [...MEMBERS_TRAIL, { label: name ?? 'Member', to: `/account/members/${memberId}` }];
}
