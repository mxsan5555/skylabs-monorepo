import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { Vendor } from '../../../../api/rbac/vendors';
import { MemberList, formatCount } from './member-list';

const MEMBER = {
  id: 'm1',
  businessName: 'Vitality Wellness & Beauty',
  status: 'ACTIVE',
  owner: { id: 'o1', name: 'Arjun Malhotra', status: 'active', roles: [] },
  _count: { branches: 9, deals: 18, products: 18, therapists: 12 },
  liveCounts: { branches: 9, deals: 5, products: 18, therapists: 12 },
  documentsSummary: { complete: false, missing: ['PAN'], rejected: [], dueAt: '2026-10-20T00:00:00Z', overdue: false },
} as unknown as Vendor;

function table(): HTMLElement {
  const el = document.querySelector('sky-data-table');
  if (!el) throw new Error('sky-data-table not found');
  return el as HTMLElement;
}

function renderList(members: Vendor[], onSelect = vi.fn()) {
  render(
    <MemberList
      members={members}
      onSelect={onSelect}
      total={members.length}
      page={1}
      pageSize={10}
      loading={false}
      onParamsChange={vi.fn()}
    />,
  );
}


describe('formatCount', () => {
  it('reads "live of all" when only some items are live', () => {
    expect(formatCount(5, 18)).toBe('5 of 18');
  });

  it('reads the total when all items are live or live is unknown', () => {
    expect(formatCount(18, 18)).toBe('18');
    expect(formatCount(undefined, 18)).toBe('18');
    expect(formatCount(undefined, undefined)).toBe('0');
  });
});

describe('MemberList', () => {
  it('declares the member columns', () => {
    renderList([]);
    const columns = JSON.parse(table().getAttribute('columns') ?? '[]') as { label: string }[];
    expect(columns.map((c) => c.label)).toEqual(['Business', 'Owner', 'Status', 'Documents', 'Due', 'Branches', 'Deals', 'Therapists', 'Products']);
  });

  it('shows a readable status, documents chip, due date and live counts', () => {
    renderList([MEMBER]);
    const [row] = JSON.parse(table().getAttribute('rows') ?? '[]') as Record<string, string>[];
    expect(row.Status).toBe('Active');
    expect(row.Documents).toBe('Documents incomplete');
    expect(row.Due).toBe('Due 20 Oct 2026');
    expect(row['Deal Count']).toBe('5 of 18');
  });

  it('gives each status and documents state its own tonal colour', () => {
    renderList([MEMBER]);
    const columns = JSON.parse(table().getAttribute('columns') ?? '[]') as { key: string; statusStyle?: string; statusMap?: Record<string, string> }[];
    const status = columns.find((c) => c.key === 'Status');
    const documents = columns.find((c) => c.key === 'Documents');
    expect(status?.statusStyle).toBe('tonal');
    expect(status?.statusMap).toEqual({ Active: 'success', Inactive: 'neutral', Suspended: 'error', Archived: 'neutral' });
    expect(documents?.statusMap).toEqual({ 'Documents complete': 'success', 'Documents incomplete': 'warning' });
  });

  it('groups every filter in one select: status, documents, review', () => {
    renderList([]);
    expect(table().getAttribute('filter-label')).toBe('Filter');
    const options = JSON.parse(table().getAttribute('filter-options') ?? '[]') as { group: string; label: string }[];
    expect(options.map((o) => `${o.group}: ${o.label}`)).toEqual([
      'Status: Active',
      'Status: Inactive',
      'Status: Suspended',
      'Documents: Documents incomplete',
      'Review: Ready for suspension review',
    ]);
  });

  it('opens a member from the row action', () => {
    const onSelect = vi.fn();
    renderList([MEMBER], onSelect);
    fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action: 'select', row: { 'Member ID': 'm1' } } }));
    expect(onSelect).toHaveBeenCalledWith('m1');
  });
});
