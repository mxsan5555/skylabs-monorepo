import { describe, it, expect } from 'vitest';
import { canTransition, assertTransition, REASON_MIN, REASON_MAX } from './member-status-machine';

type S = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVED';
const CASES: Array<[S, S, boolean]> = [
  ['ACTIVE', 'INACTIVE', true],
  ['ACTIVE', 'SUSPENDED', false],
  ['ACTIVE', 'ACTIVE', false],
  ['ACTIVE', 'ARCHIVED', false],
  ['INACTIVE', 'ACTIVE', true],
  ['INACTIVE', 'SUSPENDED', true],
  ['INACTIVE', 'INACTIVE', false],
  ['SUSPENDED', 'ACTIVE', true],
  ['SUSPENDED', 'INACTIVE', false],
  ['SUSPENDED', 'SUSPENDED', false],
  ['ARCHIVED', 'ACTIVE', false],
  ['ARCHIVED', 'INACTIVE', true],
  ['ARCHIVED', 'SUSPENDED', false],
];

describe('member status machine', () => {
  it.each(CASES)('%s -> %s is %s', (from, to, allowed) => {
    expect(canTransition(from, to)).toBe(allowed);
  });

  it('throws CONFLICT for a refused transition', () => {
    expect(() => assertTransition('SUSPENDED', 'INACTIVE')).toThrowError(/Suspended to Inactive/);
  });

  it('explains the journey when an active member is suspended (item 6)', () => {
    expect(() => assertTransition('ACTIVE', 'SUSPENDED')).toThrowError(/Make the member inactive first/);
  });

  it('exposes the reason length limits', () => {
    expect(REASON_MIN).toBe(10);
    expect(REASON_MAX).toBe(500);
  });
});
