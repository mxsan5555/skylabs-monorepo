import type { DeviceSession } from '@skylabs-monorepo/shared-types';

interface Props {
  sessions: DeviceSession[];
  loading: boolean;
  error: string;
}

export function SessionsPanel({ sessions, loading, error }: Props) {
  if (loading) return <p className="loading-state">Loading sessions…</p>;
  if (error) return <p className="error-state">{error}</p>;
  if (sessions.length === 0) return <p className="empty-state">No active or past sessions.</p>;

  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Device</th>
            <th scope="col">IP</th>
            <th scope="col">Created</th>
            <th scope="col">Expires</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr key={session.id}>
              <td>{session.deviceInfo ?? '—'}</td>
              <td>{session.ip ?? '—'}</td>
              <td>{new Date(session.createdAt).toLocaleString()}</td>
              <td>{new Date(session.expiresAt).toLocaleString()}</td>
              <td>
                <span className={`status-pill ${session.revokedAt ? 'status-pill--blocked' : 'status-pill--active'}`}>
                  {session.revokedAt ? 'Revoked' : 'Active'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
