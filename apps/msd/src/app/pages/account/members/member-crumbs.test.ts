import { describe, it, expect } from 'vitest';
import { MEMBERS_TRAIL, memberTrail } from './member-crumbs';

/** P10-47: one source for the Members breadcrumbs, so the label can't drift between pages. */
describe('member breadcrumbs', () => {
  it('starts every member page with Members > All members', () => {
    expect(MEMBERS_TRAIL).toEqual([{ label: 'Members' }, { label: 'All members', to: '/account/members' }]);
  });

  it('adds the member, linked to its page, and falls back to "Member" until the name loads', () => {
    expect(memberTrail('v1', 'Vitality Wellness')).toEqual([
      ...MEMBERS_TRAIL,
      { label: 'Vitality Wellness', to: '/account/members/v1' },
    ]);
    expect(memberTrail('v1', null)[2]).toEqual({ label: 'Member', to: '/account/members/v1' });
  });
});
