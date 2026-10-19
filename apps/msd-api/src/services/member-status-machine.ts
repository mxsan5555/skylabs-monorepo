import { ApiError } from '../lib/http';

export type MemberStatusValue = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVED';

/** Statuses an admin can set. ARCHIVED is reached only through a delete of a member with orders. */
export type SettableMemberStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export const REASON_MIN = 10;
export const REASON_MAX = 500;

const ALLOWED: Record<MemberStatusValue, readonly MemberStatusValue[]> = {
  ACTIVE: ['INACTIVE', 'SUSPENDED'],
  INACTIVE: ['ACTIVE', 'SUSPENDED'],
  SUSPENDED: ['ACTIVE'],
  ARCHIVED: [],
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
    throw new ApiError('CONFLICT', `A member cannot move from ${LABEL[from]} to ${LABEL[to]}.`);
  }
}
