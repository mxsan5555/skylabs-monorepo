import { describe, it, expect } from 'vitest';
import {
  MEMBER_STATUS_LABEL,
  MEMBER_STATUS_TONE,
  documentsChipLabel,
  documentsChipTone,
  canBeReminded,
  reminderOutcome,
  ACTIVITY_DETAIL_LABEL,
  dueDateLabel,
  availableStatusActions,
} from './member-status';

describe('member status helpers', () => {
  it('labels the three lifecycle states plus archived', () => {
    expect(MEMBER_STATUS_LABEL).toEqual({ ACTIVE: 'Active', INACTIVE: 'Inactive', SUSPENDED: 'Suspended', ARCHIVED: 'Archived' });
  });

  it('gives each lifecycle state its own tone', () => {
    expect(MEMBER_STATUS_TONE).toEqual({ ACTIVE: 'success', INACTIVE: 'neutral', SUSPENDED: 'error', ARCHIVED: 'neutral' });
  });

  it('documents chip tone', () => {
    expect(documentsChipTone({ complete: true, missing: [], rejected: [], dueAt: null, overdue: false })).toBe('success');
    expect(documentsChipTone(undefined)).toBe('warning');
  });

  it('documents chip', () => {
    expect(documentsChipLabel({ complete: true, missing: [], rejected: [], dueAt: null, overdue: false })).toBe('Documents complete');
    expect(documentsChipLabel({ complete: false, missing: ['PAN'], rejected: [], dueAt: null, overdue: false })).toBe('Documents incomplete');
    expect(documentsChipLabel(undefined)).toBe('Documents incomplete');
  });

  it('due date label', () => {
    const summary = { complete: false, missing: ['PAN' as const], rejected: [], dueAt: '2026-10-20T00:00:00Z', overdue: false };
    expect(dueDateLabel(summary)).toBe('Due 20 Oct 2026');
    expect(dueDateLabel({ ...summary, overdue: true })).toBe('Overdue since 20 Oct 2026');
    expect(dueDateLabel({ ...summary, complete: true })).toBe('');
  });

  /** Item 6: Active, Inactive, Suspended, Delete; the next blocked step shows with its reason. */
  it('actions follow the journey and the viewer permissions', () => {
    const all = { canStatusChange: true, canDelete: true };
    expect(availableStatusActions('ACTIVE', all)).toEqual([
      { action: 'deactivate' },
      { action: 'suspend', blockedBy: 'Make the member inactive first.' },
    ]);
    expect(availableStatusActions('INACTIVE', all)).toEqual([
      { action: 'reactivate' },
      { action: 'suspend' },
      { action: 'delete', blockedBy: 'Suspend the member first.' },
    ]);
    expect(availableStatusActions('SUSPENDED', all)).toEqual([{ action: 'reactivate' }, { action: 'delete' }]);
    expect(availableStatusActions('ARCHIVED', all)).toEqual([{ action: 'restore' }]);
    expect(availableStatusActions('SUSPENDED', { canStatusChange: true, canDelete: false })).toEqual([{ action: 'reactivate' }]);
    expect(availableStatusActions('INACTIVE', { canStatusChange: true, canDelete: false })).toEqual([
      { action: 'reactivate' },
      { action: 'suspend' },
    ]);
    expect(availableStatusActions('ACTIVE', { canStatusChange: false, canDelete: false })).toEqual([]);
    expect(availableStatusActions('ARCHIVED', { canStatusChange: false, canDelete: true })).toEqual([]);
  });
});

describe('reminder helpers', () => {
  const incomplete = { complete: false, missing: ['PAN' as const], rejected: [], dueAt: null, overdue: false };
  const complete = { ...incomplete, complete: true, missing: [] };

  it('allows Remind now only for active or inactive members with documents still needed', () => {
    expect(canBeReminded('ACTIVE', incomplete)).toBe(true);
    expect(canBeReminded('INACTIVE', incomplete)).toBe(true);
    expect(canBeReminded('SUSPENDED', incomplete)).toBe(false);
    expect(canBeReminded('ARCHIVED', incomplete)).toBe(false);
    expect(canBeReminded('ACTIVE', complete)).toBe(false);
  });

  it('describes what reached the member', () => {
    expect(reminderOutcome({ emailStatus: 'SENT', smsStatus: 'SENT', sentAt: 'x' })).toBe('Reminder sent by email and SMS.');
    expect(reminderOutcome({ emailStatus: 'FAILED', smsStatus: 'SENT', sentAt: 'x' })).toBe('Reminder sent by SMS.');
    expect(reminderOutcome({ emailStatus: null, smsStatus: 'FAILED', sentAt: null })).toMatch(/could not be delivered/);
  });

  it('labels reminder details as the documents asked for', () => {
    expect(ACTIVITY_DETAIL_LABEL.reminder).toBe('Documents asked for');
    expect(ACTIVITY_DETAIL_LABEL.status).toBe('Reason');
  });
});
