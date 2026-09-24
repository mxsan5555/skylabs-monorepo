import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { OutlinedTextField } from '@skylabs-monorepo/shared-ui/react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import type { AuditLogEntry } from '@skylabs-monorepo/shared-types';
import { listAuditLogs } from '../../../../api/rbac/audit-logs';
import { ApiRequestError } from '../../../../api/rbac/client';

const PAGE_SIZE = 25;

const COLUMNS = JSON.stringify([
  { key: 'When', label: 'When' },
  { key: 'Actor', label: 'Actor' },
  { key: 'Action', label: 'Action' },
  { key: 'Target', label: 'Target' },
  { key: 'IP', label: 'IP' },
]);

/** Read-only audit trail for every RBAC mutation (role/user changes, impersonation starts).
 *  Filterable by target user id (a specific-id lookup, kept as its own labelled field rather
 *  than `<sky-data-table>`'s built-in full-text `searchable` box) with page/page-size handled by
 *  the table's own built-in pagination (`sky-dt-params-change`) instead of hand-rolled
 *  Previous/Next buttons. */
export function AuditLogs() {
  const { token } = useAuth();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [targetUserId, setTargetUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listAuditLogs(token, {
        targetUserId: targetUserId || undefined,
        page,
        pageSize,
      });
      setEntries(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load audit logs.');
    } finally {
      setLoading(false);
    }
  }, [token, targetUserId, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(
    () =>
      JSON.stringify(
        entries.map((entry) => ({
          When: new Date(entry.createdAt).toLocaleString(),
          Actor: entry.actorUserId,
          Action: entry.action,
          Target: `${entry.targetType} · ${entry.targetId}`,
          IP: entry.ip ?? '—',
        })),
      ),
    [entries],
  );

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const onParamsChange = (e: Event) => {
      const detail = (e as CustomEvent<SkyDataTableParamsDetail>).detail;
      setPage(detail.page);
      setPageSize(detail.pageSize);
    };
    el.addEventListener('sky-dt-params-change', onParamsChange);
    return () => el.removeEventListener('sky-dt-params-change', onParamsChange);
  }, []);

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

        {error && <p className="error-state">{error}</p>}

        <sky-data-table
          ref={tableRef as RefObject<HTMLElement>}
          caption="Audit Logs"
          columns={COLUMNS}
          rows={rows}
          total={total}
          page={page}
          page-size={pageSize}
          loading={loading}
        />
      </div>
    </div>
  );
}

export default AuditLogs;
