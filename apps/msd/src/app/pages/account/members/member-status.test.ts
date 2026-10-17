import { describe, it, expect } from 'vitest';
import {
  MEMBER_STATUS_LABEL,
  statusBadgeVariant,
  documentsChipLabel,
  dueDateLabel,
  availableStatusActions,
} from './member-status';

describe('member status helpers', () => {
  it('labels the three lifecycle states plus archived', () => {
    expect(MEMBER_STATUS_LABEL).toEqual({ ACTIVE: 'Active', INACTIVE: 'Inactive', SUSPENDED: 'Suspended', ARCHIVED: 'Archived' });
  });

  it('colours Active primary and Suspended error', () => {
    expect(statusBadgeVariant('ACTIVE')).toBe('primary');
    expect(statusBadgeVariant('SUSPENDED')).toBe('error');
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

  it('actions follow the lifecycle and the viewer permissions', () => {
    const all = { canStatusChange: true, canDelete: true };
    expect(availableStatusActions('ACTIVE', all)).toEqual(['deactivate', 'suspend']);
    expect(availableStatusActions('INACTIVE', all)).toEqual(['reactivate', 'suspend']);
    expect(availableStatusActions('SUSPENDED', all)).toEqual(['reactivate', 'delete']);
    expect(availableStatusActions('ARCHIVED', all)).toEqual([]);
    expect(availableStatusActions('SUSPENDED', { canStatusChange: true, canDelete: false })).toEqual(['reactivate']);
    expect(availableStatusActions('ACTIVE', { canStatusChange: false, canDelete: false })).toEqual([]);
  });
});
