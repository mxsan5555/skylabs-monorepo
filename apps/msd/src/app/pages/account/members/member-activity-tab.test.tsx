import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiRequestError } from '../../../../api/rbac/client';
import { MemberActivityTab } from './member-activity-tab';

const activityMock = vi.fn();
vi.mock('../../../../api/rbac/members', () => ({
  getMemberActivity: (...a: unknown[]) => activityMock(...a),
}));

const ITEMS = [
  { kind: 'status', at: '2026-10-14T10:00:00.000Z', summary: 'Suspended by Priya', detail: 'Documents not completed' },
  { kind: 'document', at: '2026-10-13T09:00:00.000Z', summary: 'PAN card approved', detail: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  activityMock.mockResolvedValue({ data: ITEMS });
});

describe('MemberActivityTab', () => {
  it('shows a loading state first', () => {
    activityMock.mockReturnValue(new Promise(vi.fn()));
    render(<MemberActivityTab token="t" memberId="m1" refreshKey={0} />);
    expect(screen.getByText(/loading activity/i)).toBeTruthy();
  });

  it('lists each item with its reason and a machine readable time', async () => {
    render(<MemberActivityTab token="t" memberId="m1" refreshKey={0} />);
    expect(await screen.findByText('Suspended by Priya')).toBeTruthy();
    expect(screen.getByText('Reason: Documents not completed')).toBeTruthy();
    expect(screen.getByText('PAN card approved')).toBeTruthy();
    expect(screen.getAllByText(/^Reason:/)).toHaveLength(1);
    expect(document.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-14T10:00:00.000Z');
    expect(activityMock).toHaveBeenCalledWith('t', 'm1');
  });

  it('shows an empty state', async () => {
    activityMock.mockResolvedValue({ data: [] });
    render(<MemberActivityTab token="t" memberId="m1" refreshKey={0} />);
    expect(await screen.findByText('No activity yet.')).toBeTruthy();
  });

  it('shows the server message as an alert', async () => {
    activityMock.mockRejectedValue(new ApiRequestError('SERVER', 'Activity is not available.', 500));
    render(<MemberActivityTab token="t" memberId="m1" refreshKey={0} />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/not available/i);
  });

  it('reloads when the refresh key changes', async () => {
    const { rerender } = render(<MemberActivityTab token="t" memberId="m1" refreshKey={0} />);
    await screen.findByText('Suspended by Priya');
    rerender(<MemberActivityTab token="t" memberId="m1" refreshKey={1} />);
    await waitFor(() => expect(activityMock).toHaveBeenCalledTimes(2));
  });
});
