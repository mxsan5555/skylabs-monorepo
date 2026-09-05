import type { LoginHistoryEntry } from '@skylabs-monorepo/shared-types';

interface Props {
  entries: LoginHistoryEntry[];
  loading: boolean;
  error: string;
}

export function LoginHistoryPanel({ entries, loading, error }: Props) {
  if (loading) return <p className="loading-state">Loading login history…</p>;
  if (error) return <p className="error-state">{error}</p>;
  if (entries.length === 0) return <p className="empty-state">No login attempts recorded yet.</p>;

  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Method</th>
            <th scope="col">Result</th>
            <th scope="col">IP</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td>{new Date(entry.createdAt).toLocaleString()}</td>
              <td>{entry.method}</td>
              <td>{entry.success ? 'Success' : 'Failed'}</td>
              <td>{entry.ip ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
