import { ApiError } from '../lib/http';

export type MemberStatusValue = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVED';

/** Statuses an admin can set. ARCHIVED is reached only through a delete, which always archives. */
export type SettableMemberStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export const REASON_MIN = 10;
export const REASON_MAX = 500;

/** The journey (item 6): Active, then Inactive, then Suspended, then Delete (archive, never an
 *  erase). Every step can come back: Inactive and Suspended reactivate, Archived restores to
 *  Inactive, from where an admin reactivates once the member is ready. */
const ALLOWED: Record<MemberStatusValue, readonly MemberStatusValue[]> = {
  ACTIVE: ['INACTIVE'],
  INACTIVE: ['ACTIVE', 'SUSPENDED'],
  SUSPENDED: ['ACTIVE'],
  ARCHIVED: ['INACTIVE'],
};

/** Why a step is refused, when the journey has a clear next step to point at. */
const NEXT_STEP: Partial<Record<`${MemberStatusValue}>${MemberStatusValue}`, string>> = {
  'ACTIVE>SUSPENDED': 'Make the member inactive first. The order is Active, Inactive, Suspended, then Delete.',
  'ARCHIVED>ACTIVE': 'Restore the member to Inactive first, then reactivate.',
};

const LABEL: Record<MemberStatusValue, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  SUSPENDED: 'Suspended',
  ARCHIVED: 'Archived',
};

export function canTransition(from: MemberStatusValue, to: MemberStatusValue): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: MemberStatusValue, to: MemberStatusValue): void {
  if (!canTransition(from, to)) {
    throw new ApiError('CONFLICT', NEXT_STEP[`${from}>${to}`] ?? `A member cannot move from ${LABEL[from]} to ${LABEL[to]}.`);
  }
}
