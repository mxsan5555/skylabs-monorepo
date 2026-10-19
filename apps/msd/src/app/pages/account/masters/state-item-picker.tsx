import { createElement, useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { ChipNav } from '../../../components/chip-nav/chip-nav';
import { searchStateItems, type StateItem, type StateItemType } from '../../../../api/rbac/home-hero';
import { resolveMediaUrl } from '../../../../api/media';
import { formatINR } from '../../../../utils/format';
import './state-item-picker.css';

const TYPE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'deal', label: 'Deals' },
  { value: 'product', label: 'Products' },
];

const TYPE_LABEL: Record<StateItemType, string> = { deal: 'Deal', product: 'Product' };
const PAGE = 12;

/** Square thumbnail for a deal or product; a neutral icon when there is no image. */
export function ItemThumb({ image, type }: { image: string | null; type: StateItemType }) {
  return (
    <span className="item-thumb" aria-hidden="true">
      {image ? (
        <img src={resolveMediaUrl(image)} alt="" loading="lazy" decoding="async" width={48} height={48} />
      ) : (
        createElement('md-icon', null, type === 'deal' ? 'spa' : 'inventory_2')
      )}
    </span>
  );
}

export interface StateItemPickerProps {
  token: string | null;
  /** Which console's search route to call (each checks its own permission). */
  base: '/home-hero' | '/promotions';
  /** The chosen state; `null` searches every state (Global/Default). */
  state: string | null;
  onPick: (item: StateItem) => void | Promise<void>;
  /** Items already chosen: shown with `pickedLabel` instead of the pick button. */
  excludeIds?: string[];
  pickLabel?: string;
  pickedLabel?: string;
  /** Optional heading rendered above the controls. */
  heading?: ReactNode;
}

/**
 * Browse and pick a state's deals and products (docs/msd/PLANNING.md §6, §7). Lists the state's
 * items at once, newest first; the search narrows the list, it is not required. "Only visible to
 * customers" is on by default. Shared by the Home hero builder and the CTA banner form. Raw M3
 * elements so tests can drive them.
 */
export function StateItemPicker({
  token,
  base,
  state,
  onPick,
  excludeIds = [],
  pickLabel = 'Add',
  pickedLabel = 'Added',
  heading,
}: StateItemPickerProps) {
  const [type, setType] = useState<StateItemType | 'all'>('all');
  const [query, setQuery] = useState('');
  const [eligibleOnly, setEligibleOnly] = useState(true);
  const [pageSize, setPageSize] = useState(PAGE);
  const [results, setResults] = useState<StateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const statusId = useId();
  const firstLoad = useRef(true);

  useEffect(() => {
    let cancelled = false;
    // The first list loads at once; typing waits 250 ms so each keystroke is not a request.
    const delay = firstLoad.current ? 0 : 250;
    firstLoad.current = false;
    const timer = setTimeout(() => {
      setLoading(true);
      searchStateItems(token, base, { state, q: query.trim(), type, pageSize, eligibleOnly })
        .then(({ data }) => {
          if (!cancelled) setResults(data ?? []);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token, base, state, type, query, pageSize, eligibleOnly]);

  // A new filter starts from the first page again.
  const resetPaging = () => setPageSize(PAGE);
  const where = state ?? 'all states';
  const q = query.trim();
  const status = loading
    ? 'Loading…'
    : results.length === 0
      ? q
        ? `Nothing in ${where} matches “${q}”.`
        : `No ${eligibleOnly ? 'visible ' : ''}deals or products in ${where} yet.`
      : `${results.length}${results.length === pageSize ? '+' : ''} ${results.length === 1 ? 'item' : 'items'} in ${where}`;

  const pick = async (item: StateItem) => {
    setBusyId(item.id);
    try {
      await onPick(item);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="item-browser" aria-describedby={statusId}>
      {heading}
      <div className="item-browser__controls">
        <ChipNav
          items={TYPE_FILTERS}
          value={type}
          onSelect={(value) => {
            setType(value as StateItemType | 'all');
            resetPaging();
          }}
          ariaLabel="Item type"
        />
        <label className="item-browser__toggle">
          {createElement('md-switch', {
            selected: eligibleOnly,
            onChange: (e: ChangeEvent<HTMLElement & { selected: boolean }>) => {
              setEligibleOnly(e.currentTarget.selected);
              resetPaging();
            },
          })}
          Only visible to customers
        </label>
      </div>
      {createElement('md-outlined-text-field', {
        className: 'item-browser__search',
        type: 'search',
        label: `Search ${where}`,
        placeholder: 'Title, member or branch',
        onInput: (e: ChangeEvent<HTMLElement & { value: string }>) => {
          setQuery(e.currentTarget.value);
          resetPaging();
        },
      })}
      {loading && createElement('md-linear-progress', { indeterminate: true, 'aria-hidden': 'true' })}
      <p id={statusId} className="item-browser__status" role="status" aria-live="polite">
        {status}
      </p>
      {results.length > 0 && (
        <ul className="item-browser__list">
          {results.map((item) => {
            const picked = excludeIds.includes(item.id);
            return (
              <li key={`${item.type}-${item.id}`} className="item-browser__row">
                <ItemThumb image={item.image} type={item.type} />
                <span className="item-browser__text">
                  <span className="item-browser__title">{item.title}</span>
                  <span className="item-browser__meta">
                    {TYPE_LABEL[item.type]} · {item.memberName}
                    {item.branchName ? ` · ${item.branchName}` : ''} · {formatINR(Number(item.price))}
                  </span>
                  {!item.eligible && <span className="item-browser__meta item-browser__hidden">Hidden from customers</span>}
                </span>
                {picked ? (
                  <span className="item-browser__done">
                    {createElement('md-icon', { 'aria-hidden': 'true' }, 'check')}
                    {pickedLabel}
                  </span>
                ) : (
                  createElement(
                    'md-outlined-button',
                    {
                      'aria-label': `${pickLabel} ${item.title}`,
                      disabled: busyId === item.id,
                      onClick: () => pick(item),
                    },
                    pickLabel,
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!loading && results.length === pageSize &&
        createElement(
          'md-text-button',
          { className: 'item-browser__more', onClick: () => setPageSize((n) => n + PAGE) },
          'Show more',
        )}
    </section>
  );
}
