import { useCallback, useEffect, useState } from 'react';
import { OutlinedButton, OutlinedTextField } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import type { AuditLogEntry } from '@skylabs-monorepo/shared-types';
import { listAuditLogs } from '../../../../api/rbac/audit-logs';
import { ApiRequestError } from '../../../../api/rbac/client';

const PAGE_SIZE = 25;

/** Read-only audit trail for every RBAC mutation (role/user changes, impersonation starts). Filterable by target user id. */
export function AuditLogs() {
  const { token } = useAuth();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [targetUserId, setTargetUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listAuditLogs(token, {
        targetUserId: targetUserId || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setEntries(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load audit logs.');
    } finally {
      setLoading(false);
    }
  }, [token, targetUserId, page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="admin-page admin-page--wide">
      <title>Audit Logs · MSD</title>
      <header className="page-head">
        <div>
          <h1>Audit Logs</h1>
          <p>Every role, user, and impersonation change made in this console.</p>
        </div>
      </header>

      <div className="panel">
        <div className="form-grid">
          <OutlinedTextField
            label="Filter by target user ID"
            value={targetUserId}
            onInput={(e: Event) => {
              setPage(1);
              setTargetUserId((e.target as HTMLInputElement).value);
            }}
          />
        </div>

        {loading ? (
          <p className="loading-state">Loading audit logs…</p>
        ) : error ? (
          <p className="error-state">{error}</p>
        ) : entries.length === 0 ? (
          <p className="empty-state">No audit log entries match.</p>
        ) : (
          <>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Actor</th>
                    <th scope="col">Action</th>
                    <th scope="col">Target</th>
                    <th scope="col">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{new Date(entry.createdAt).toLocaleString()}</td>
                      <td>{entry.actorUserId}</td>
                      <td>{entry.action}</td>
                      <td>
                        {entry.targetType} · {entry.targetId}
                      </td>
                      <td>{entry.ip ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="form-actions">
              <OutlinedButton disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </OutlinedButton>
              <span className="field-hint">
                Page {page} of {totalPages}
              </span>
              <OutlinedButton disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </OutlinedButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default AuditLogs;
