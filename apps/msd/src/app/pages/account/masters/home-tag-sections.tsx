import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  listHomeTagSectionOverview,
  statePath,
  type HomeTagSectionOverviewRow,
} from '../../../../api/rbac/home-tag-sections';
import { ApiRequestError } from '../../../../api/rbac/client';
import { ChoiceMenu } from '../../../components/choice-menu/choice-menu';
import { GLOBAL_LABEL, useBranchStates } from './state-picker';

const COLUMNS = JSON.stringify([
  { key: 'State', label: 'State' },
  { key: 'Sections enabled', label: 'Sections enabled (of 4)' },
  { key: 'Live', label: 'Live now' },
  { key: 'Last change', label: 'Last change' },
]);

const ACTIONS = JSON.stringify([{ icon: 'edit', label: 'Open', event: 'open' }]);

export function toOverviewRow(row: HomeTagSectionOverviewRow) {
  return {
    State: row.state ?? GLOBAL_LABEL,
    'Sections enabled': `${row.sectionsEnabled} of 4`,
    Live: row.liveSections,
    'Last change': row.updatedAt ? new Date(row.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—',
  };
}

/**
 * Home Tag Sections overview (`masters.home-tag-sections`; docs/msd/PLANNING.md §7.1): one row
 * per state, Global / Default first. Opening a state shows its 4 fixed tag rows (New, Deal, Hot
 * Deal, Expire soon) with an Enabled switch each — same overview-then-detail shape as Home Hero.
 */
export function HomeTagSectionsManagement() {
  const { token, can } = useAuth();
  const navigate = useNavigate();
  const canCreate = can('masters.home-tag-sections', 'create');
  const states = useBranchStates();
  const [rows, setRows] = useState<HomeTagSectionOverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await listHomeTagSectionOverview(token);
      setRows(data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load the states.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const tableRows = useMemo(() => JSON.stringify(rows.map(toOverviewRow)), [rows]);
  const withoutRows = states.filter((state) => !rows.some((row) => row.state === state));

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const onRowAction = (e: Event) => {
      const { rowIndex } = (e as CustomEvent<{ rowIndex: number }>).detail;
      const row = rows[rowIndex];
      if (row) navigate(statePath(row.state));
    };
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => el.removeEventListener('sky-dt-row-action', onRowAction);
  }, [rows, navigate]);

  return (
    <div className="admin-page admin-page--wide">
      <title>Home Tag Sections · MSD</title>
      <header className="page-head">
        <div>
          <h1>Home Tag Sections</h1>
          <p>
            Four home page rails — New, Deal, Hot Deal and Expire soon — per state. Each tag is a
            deal list you pick and order yourself; a rail only reaches customers once it is enabled
            and has at least one deal they can currently see.
          </p>
        </div>
        {canCreate && withoutRows.length > 0 && (
          <div className="page-head__actions">
            <ChoiceMenu
              trigger="text"
              icon="add"
              label="New state"
              menuLabel="Choose a state"
              options={withoutRows.map((state) => ({ value: state, label: state }))}
              value=""
              onChange={(state) => navigate(statePath(state))}
            />
          </div>
        )}
      </header>

      {error && <p className="error-state" role="alert">{error}</p>}

      <sky-data-table
        ref={tableRef as RefObject<HTMLElement>}
        caption={loading ? 'States' : `States · ${rows.length}`}
        columns={COLUMNS}
        rows={tableRows}
        total={rows.length}
        page={1}
        page-size={Math.max(rows.length, 10)}
        loading={loading}
        actions={ACTIONS}
      />
    </div>
  );
}

export default HomeTagSectionsManagement;
