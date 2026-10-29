import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS, isAuditAction } from './audit';

/** P2-11: one list of audit actions; the type makes every `writeAuditLog` call use one of them. */
describe('AUDIT_ACTIONS', () => {
  it('holds each action once', () => {
    expect(new Set(AUDIT_ACTIONS).size).toBe(AUDIT_ACTIONS.length);
  });

  it('uses dotted lower-case names', () => {
    expect(AUDIT_ACTIONS.filter((a) => !/^[a-z][a-z_]*(\.[a-z_]+)+$/.test(a))).toEqual([]);
  });

  it('keeps the stored names the logs already hold', () => {
    expect(AUDIT_ACTIONS).toEqual(expect.arrayContaining(['member.status.changed', 'product.status_change', 'impersonate.start']));
  });
});

describe('isAuditAction', () => {
  it('accepts a known action and refuses anything else', () => {
    expect(isAuditAction('member.status.changed')).toBe(true);
    expect(isAuditAction('member.status.change')).toBe(false);
    expect(isAuditAction('')).toBe(false);
  });
});
