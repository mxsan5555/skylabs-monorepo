import { createElement, useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  listHomeTagSections,
  setHomeTagSectionEnabled,
  sectionPath,
  stateFromSlug,
  type HomeTagSectionRow,
} from '../../../../api/rbac/home-tag-sections';
import { ApiRequestError } from '../../../../api/rbac/client';
import { showSnackbar } from '../../../../snackbar/snackbar';
import { GLOBAL_LABEL } from './state-picker';

const STATUS_LABEL: Record<HomeTagSectionRow['status'], string> = {
  LIVE: 'Live',
  DRAFT: 'Draft',
  DISABLED: 'Disabled',
};

const errorText = (err: unknown, fallback: string) => (err instanceof ApiRequestError ? err.message : fallback);

/**
 * One state's 4 fixed tag rows (docs/msd/PLANNING.md §7.1) — New, Deal, Hot Deal, Expire soon,
 * always all 4 even for a state never touched before. Enabling a row upserts it immediately;
 * "Open builder" goes to that one tag's ordered deal list.
 */
export function HomeTagSectionsStatePage() {
  const { state: slug = 'global' } = useParams();
  const state = stateFromSlug(slug);
  const label = state ?? GLOBAL_LABEL;
  const navigate = useNavigate();
  const { token, can } = useAuth();
  const canEdit = can('masters.home-tag-sections', 'edit');

  const [rows, setRows] = useState<HomeTagSectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await listHomeTagSections(token, state);
      setRows(data);
    } catch (err) {
      setError(errorText(err, 'Could not load this state.'));
    } finally {
      setLoading(false);
    }
  }, [token, state]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (row: HomeTagSectionRow, isEnabled: boolean) => {
    setRows((prev) => prev.map((r) => (r.tag === row.tag ? { ...r, isEnabled } : r)));
    try {
      const { data } = await setHomeTagSectionEnabled(token, state, row.tag, isEnabled);
      setRows((prev) =>
        prev.map((r) =>
          r.tag === row.tag
            ? { ...r, id: data.id, isEnabled: data.isEnabled, status: isEnabled ? (r.eligibleCount > 0 ? 'LIVE' : 'DRAFT') : 'DISABLED' }
            : r,
        ),
      );
      showSnackbar(`${row.title} ${isEnabled ? 'enabled' : 'disabled'} for ${label}.`, { variant: 'success' });
    } catch (err) {
      setRows((prev) => prev.map((r) => (r.tag === row.tag ? { ...r, isEnabled: !isEnabled } : r)));
      showSnackbar(errorText(err, 'Could not change this section.'), { variant: 'error' });
    }
  };

  return (
    <div className="admin-page admin-page--wide">
      <title>{`${label} · Home Tag Sections · MSD`}</title>
      <header className="page-head">
        <div>
          {createElement(
            'md-text-button',
            { className: 'hero-builder__back', href: '/account/masters/home-tag-sections' },
            createElement('md-icon', { slot: 'icon', 'aria-hidden': 'true' }, 'arrow_back'),
            'All states',
          )}
          <h1>{label}</h1>
          <p>Turn a tag on, then open its builder to pick and order deals for it.</p>
        </div>
      </header>

      {error && <p className="error-state" role="alert">{error}</p>}
      {loading ? (
        <p className="loading-state">Loading sections…</p>
      ) : (
        <ul className="entity-list">
          {rows.map((row) => (
            <li key={row.tag} className="widget-assign-row">
              <label className="widget-assign-row__label">
                {createElement('md-switch', {
                  selected: row.isEnabled,
                  disabled: !canEdit,
                  'aria-label': `Enable ${row.title} for ${label}`,
                  onChange: (e: ChangeEvent<HTMLElement & { selected: boolean }>) => toggle(row, e.currentTarget.selected),
                })}
                {row.title}
              </label>
              <span className="widget-assign-row__order">
                {STATUS_LABEL[row.status]} · {row.eligibleCount} of {row.itemCount} deal{row.itemCount === 1 ? '' : 's'} visible to customers
              </span>
              {createElement(
                'md-outlined-button',
                { onClick: () => navigate(sectionPath(state, row.tag)) },
                `Open ${row.title} builder`,
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default HomeTagSectionsStatePage;
