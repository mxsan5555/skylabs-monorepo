import { createElement, useEffect, useId, useState, type ChangeEvent } from 'react';
import { ChipNav } from '../../../components/chip-nav/chip-nav';
import { searchStateItems, type StateItem, type StateItemType } from '../../../../api/rbac/home-hero';
import { formatINR } from '../../../../utils/format';

const TYPE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'deal', label: 'Deals' },
  { value: 'product', label: 'Products' },
];

const TYPE_LABEL: Record<StateItemType, string> = { deal: 'Deal', product: 'Product' };

export interface StateItemPickerProps {
  token: string | null;
  /** Which console's search route to call (each checks its own permission). */
  base: '/home-hero' | '/promotions';
  /** The chosen state; `null` searches every state (Global/Default). */
  state: string | null;
  onPick: (item: StateItem) => void;
  /** Items already in the slider: listed, but not offered again. */
  excludeIds?: string[];
  pickLabel?: string;
}

/**
 * Search the chosen state's deals and products and pick one (docs/msd/PLANNING.md §6, §7).
 * Shared by the Home hero and CTA banner consoles. Raw M3 elements so tests can drive them.
 */
export function StateItemPicker({ token, base, state, onPick, excludeIds = [], pickLabel = 'Add' }: StateItemPickerProps) {
  const [type, setType] = useState<StateItemType | 'all'>('all');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const statusId = useId();

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      searchStateItems(token, base, { state, q, type, pageSize: 8 })
        .then(({ data }) => {
          if (!cancelled) setResults(data ?? []);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token, base, state, type, query]);

  const where = state ?? 'all states';
  const status = loading
    ? 'Searching…'
    : query.trim()
      ? `${results.length} ${results.length === 1 ? 'result' : 'results'} in ${where}`
      : '';

  return (
    <div className="form-grid">
      <ChipNav
        items={TYPE_FILTERS}
        value={type}
        onSelect={(value) => setType(value as StateItemType | 'all')}
        ariaLabel="Item type"
      />
      {createElement('md-outlined-text-field', {
        type: 'search',
        label: `Search deals and products in ${where}`,
        'supporting-text': 'Title, member or branch',
        'aria-describedby': statusId,
        onInput: (e: ChangeEvent<HTMLElement & { value: string }>) => setQuery(e.currentTarget.value),
      })}
      <p id={statusId} className="field-hint" role="status" aria-live="polite">
        {status}
      </p>
      {results.length > 0 && (
        <ul className="entity-list">
          {results.map((item) => {
            const added = excludeIds.includes(item.id);
            return (
              <li key={`${item.type}-${item.id}`}>
                <div className="entity-list__item">
                  <span className="role-list__name">
                    <sky-badge size="small">{TYPE_LABEL[item.type]}</sky-badge> {item.title}
                    <span className="field-hint">
                      {' '}
                      · {item.memberName}
                      {item.branchName ? ` · ${item.branchName}` : ''} · {formatINR(Number(item.price))}
                      {!item.eligible && ' · not visible to customers yet (inactive item, member or branch)'}
                    </span>
                  </span>
                  {added ? (
                    <span className="field-hint">Already added</span>
                  ) : (
                    createElement(
                      'md-outlined-button',
                      { 'aria-label': `${pickLabel} ${item.title}`, onClick: () => onPick(item) },
                      pickLabel,
                    )
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
