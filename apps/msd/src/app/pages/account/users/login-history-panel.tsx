import { useMemo } from 'react';
import type { LoginHistoryEntry } from '@skylabs-monorepo/shared-types';

interface Props {
  entries: LoginHistoryEntry[];
  loading: boolean;
  error: string;
}

const COLUMNS = JSON.stringify([
  { key: 'When', label: 'When' },
  { key: 'Method', label: 'Method' },
  { key: 'Result', label: 'Result', type: 'status', statusMap: { Success: 'success', Failed: 'error' } },
  { key: 'IP', label: 'IP' },
]);

/** Read-only, no toolbar (no search/filter/export) — same minimal `<sky-data-table>` config as
 *  the Showcase's own "Data Table — Minimal" demo (`/showcase#data-table-minimal-sort-only`). */
export function LoginHistoryPanel({ entries, loading, error }: Props) {
  const rows = useMemo(
    () =>
      JSON.stringify(
        entries.map((entry) => ({
          When: new Date(entry.createdAt).toLocaleString(),
          Method: entry.method,
          Result: entry.success ? 'Success' : 'Failed',
          IP: entry.ip ?? '—',
        })),
      ),
    [entries],
  );

  if (error) return <p className="error-state">{error}</p>;

  return (
    <sky-data-table
      caption="Login history"
      columns={COLUMNS}
      rows={rows}
      total={entries.length}
      page-size={10}
      loading={loading}
    />
  );
}
