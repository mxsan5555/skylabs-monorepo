import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  MIN_ELIGIBLE_SLIDES,
  listHomeHeroOverview,
  sliderPath,
  type SliderOverviewRow,
} from '../../../../api/rbac/home-hero';
import { ApiRequestError } from '../../../../api/rbac/client';
import { ChoiceMenu } from '../../../components/choice-menu/choice-menu';
import { GLOBAL_LABEL, useBranchStates } from './state-picker';

const STATUS_LABEL = { LIVE: 'Live', DRAFT: 'Draft', EMPTY: 'Empty' } as const;

const COLUMNS = JSON.stringify([
  { key: 'Slider', label: 'Slider' },
  { key: 'Status', label: 'Status', type: 'status', statusMap: { Live: 'success', Draft: 'warning', Empty: 'neutral' } },
  { key: 'Visible slides', label: `Visible slides (${MIN_ELIGIBLE_SLIDES} to go live)` },
  { key: 'Deals', label: 'Deals' },
  { key: 'Products', label: 'Products' },
  { key: 'Last change', label: 'Last change' },
]);

const ACTIONS = JSON.stringify([{ icon: 'edit', label: 'Open builder', event: 'open' }]);

/** One overview row in the table's own shape. */
export function toOverviewRow(row: SliderOverviewRow) {
  return {
    Slider: row.state ?? GLOBAL_LABEL,
    Status: STATUS_LABEL[row.status],
    'Visible slides': `${row.eligibleCount} of ${row.minimumRequired}`,
    Deals: row.deals,
    Products: row.products,
    'Last change': row.updatedAt ? new Date(row.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—',
  };
}

/**
 * Home hero overview (`masters.home-hero`; docs/msd/PLANNING.md §7, D28): one row per slider,
 * Global / Default first, so the team sees which states are live, in draft or empty. Each row opens
 * that slider's builder; New state slider starts one for a state that has none yet.
 */
export function HomeHeroManagement() {
  const { token, can } = useAuth();
  const navigate = useNavigate();
  const canCreate = can('masters.home-hero', 'create');
  const states = useBranchStates();
  const [rows, setRows] = useState<SliderOverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await listHomeHeroOverview(token);
      setRows(data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load the sliders.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const tableRows = useMemo(() => JSON.stringify(rows.map(toOverviewRow)), [rows]);
  const withoutSlider = states.filter((state) => !rows.some((row) => row.state === state));

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const onRowAction = (e: Event) => {
      const { rowIndex } = (e as CustomEvent<{ rowIndex: number }>).detail;
      const row = rows[rowIndex];
      if (row) navigate(sliderPath(row.state));
    };
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => el.removeEventListener('sky-dt-row-action', onRowAction);
  }, [rows, navigate]);

  const live = rows.filter((r) => r.status === 'LIVE').length;

  return (
    <div className="admin-page admin-page--wide">
      <title>Home Hero · MSD</title>
      <header className="page-head">
        <div>
          <h1>Home Hero</h1>
          <p>
            Each state can have its own home page slider of deals and products. A slider goes live with {MIN_ELIGIBLE_SLIDES}{' '}
            visible slides; until then that state&apos;s visitors see the {GLOBAL_LABEL} slider.
          </p>
        </div>
        {canCreate && withoutSlider.length > 0 && (
          <div className="page-head__actions">
            <ChoiceMenu
              trigger="text"
              icon="add"
              label="New state slider"
              menuLabel="Choose a state"
              options={withoutSlider.map((state) => ({ value: state, label: state }))}
              value=""
              onChange={(state) => navigate(sliderPath(state))}
            />
          </div>
        )}
      </header>

      {error && <p className="error-state" role="alert">{error}</p>}

      <sky-data-table
        ref={tableRef as RefObject<HTMLElement>}
        caption={loading ? 'Sliders' : `Sliders · ${live} live of ${rows.length}`}
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

export default HomeHeroManagement;
