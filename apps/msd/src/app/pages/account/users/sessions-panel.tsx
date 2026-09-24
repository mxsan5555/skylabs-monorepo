import { useMemo } from 'react';
import type { DeviceSession } from '@skylabs-monorepo/shared-types';

interface Props {
  sessions: DeviceSession[];
  loading: boolean;
  error: string;
}

const COLUMNS = JSON.stringify([
  { key: 'Device', label: 'Device' },
  { key: 'IP', label: 'IP' },
  { key: 'Created', label: 'Created' },
  { key: 'Expires', label: 'Expires' },
  { key: 'Status', label: 'Status', type: 'status', statusMap: { Active: 'success', Revoked: 'error' } },
]);

/** Read-only, no toolbar (no search/filter/export) — same minimal `<sky-data-table>` config as
 *  the Showcase's own "Data Table — Minimal" demo (`/showcase#data-table-minimal-sort-only`). */
export function SessionsPanel({ sessions, loading, error }: Props) {
  const rows = useMemo(
    () =>
      JSON.stringify(
        sessions.map((session) => ({
          Device: session.deviceInfo ?? '—',
          IP: session.ip ?? '—',
          Created: new Date(session.createdAt).toLocaleString(),
          Expires: new Date(session.expiresAt).toLocaleString(),
          Status: session.revokedAt ? 'Revoked' : 'Active',
        })),
      ),
    [sessions],
  );

  if (error) return <p className="error-state">{error}</p>;

  return (
    <sky-data-table
      caption="Sessions"
      columns={COLUMNS}
      rows={rows}
      total={sessions.length}
      page-size={10}
      loading={loading}
    />
  );
}
