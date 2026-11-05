import { createElement, useCallback, useEffect, useState, type DragEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  MIN_ELIGIBLE_ITEMS_PER_TAG_SECTION,
  TAG_TITLES,
  addHomeTagSectionItem,
  listHomeTagSectionItems,
  listHomeTagSections,
  removeHomeTagSectionItem,
  reorderHomeTagSectionItems,
  setHomeTagSectionEnabled,
  stateFromSlug,
  type HomeTagSectionItem,
  type HomeTagSectionTag,
} from '../../../../api/rbac/home-tag-sections';
import { ApiRequestError } from '../../../../api/rbac/client';
import { showSnackbar } from '../../../../snackbar/snackbar';
import { formatINR } from '../../../../utils/format';
import { ItemThumb, StateItemPicker } from './state-item-picker';
import { GLOBAL_LABEL } from './state-picker';
import type { StateItem } from '../../../../api/rbac/home-hero';
import './home-hero-builder.css';

const errorText = (err: unknown, fallback: string) => (err instanceof ApiRequestError ? err.message : fallback);

/** Moves the item at `from` to `to` and returns a new array (same helper as the hero builder). */
function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Builder for one Home Tag Section (docs/msd/PLANNING.md §7.1): the ordered deals beside the Add
 * panel, same no-dialog layout as the Home hero builder. Deals only — the admin picks the tag
 * themselves, it is never computed. Opening a never-enabled tag creates its (disabled) section
 * row so items can be curated before switching it on.
 */
export function HomeTagSectionsBuilder() {
  const { state: slug = 'global', tag = 'NEW' } = useParams();
  const state = stateFromSlug(slug);
  const label = state ?? GLOBAL_LABEL;
  const tagKey = tag as HomeTagSectionTag;
  const tagTitle = TAG_TITLES[tagKey] ?? tag;
  const { token, can } = useAuth();
  const canCreate = can('masters.home-tag-sections', 'create');
  const canEdit = can('masters.home-tag-sections', 'edit');
  const canDelete = can('masters.home-tag-sections', 'delete');

  const [sectionId, setSectionId] = useState<string | null>(null);
  const [items, setItems] = useState<HomeTagSectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: sections } = await listHomeTagSections(token, state);
      const existingId = sections.find((s) => s.tag === tagKey)?.id ?? null;
      const id = existingId ?? (await setHomeTagSectionEnabled(token, state, tagKey, false)).data.id;
      setSectionId(id);
      const { data } = await listHomeTagSectionItems(token, id);
      setItems([...data].sort((a, b) => a.sortOrder - b.sortOrder));
    } catch (err) {
      setError(errorText(err, 'Could not load this section.'));
    } finally {
      setLoading(false);
    }
  }, [token, state, tagKey]);

  useEffect(() => {
    load();
  }, [load]);

  const saveOrder = async (next: HomeTagSectionItem[], previous: HomeTagSectionItem[], message: string) => {
    if (!sectionId) return;
    setItems(next);
    setAnnouncement(message);
    try {
      await reorderHomeTagSectionItems(token, sectionId, next.map((i) => i.id));
    } catch (err) {
      setItems(previous);
      showSnackbar(errorText(err, 'Could not save the new order.'), { variant: 'error' });
    }
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const next = moveItem(items, from, to);
    saveOrder(next, items, `Moved ${items[from].deal.title} to position ${to + 1} of ${items.length}.`);
  };

  const add = async (item: StateItem) => {
    if (!sectionId) return;
    try {
      const { data } = await addHomeTagSectionItem(token, sectionId, item.id);
      setItems((prev) => [...prev, data]);
      showSnackbar(`Added ${item.title} to ${label}'s ${tagTitle} section.`, { variant: 'success' });
    } catch (err) {
      showSnackbar(errorText(err, 'Could not add this deal.'), { variant: 'error' });
    }
  };

  const remove = async (item: HomeTagSectionItem, index: number) => {
    try {
      await removeHomeTagSectionItem(token, item.id);
      const remaining = items.filter((i) => i.id !== item.id);
      setItems(remaining);
      showSnackbar(`Removed ${item.deal.title}.`, {
        actionLabel: 'Undo',
        onAction: async () => {
          if (!sectionId) return;
          try {
            const { data } = await addHomeTagSectionItem(token, sectionId, item.dealId);
            const restored = [...remaining];
            restored.splice(index, 0, data);
            await saveOrder(restored, remaining, `Restored ${item.deal.title}.`);
          } catch (err) {
            showSnackbar(errorText(err, 'Could not restore this deal.'), { variant: 'error' });
          }
        },
      });
    } catch (err) {
      showSnackbar(errorText(err, 'Could not remove this deal.'), { variant: 'error' });
    }
  };

  const eligibleCount = items.filter((i) => i.itemEligible).length;
  const isLive = eligibleCount >= MIN_ELIGIBLE_ITEMS_PER_TAG_SECTION;
  const itemIds = items.map((i) => i.dealId);

  const onDrop = (e: DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex !== null) move(dragIndex, index);
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <div className="admin-page admin-page--wide">
      <title>{`${tagTitle} · ${label} · Home Tag Sections · MSD`}</title>
      <header className="page-head">
        <div>
          {createElement(
            'md-text-button',
            { className: 'hero-builder__back', href: `/account/masters/home-tag-sections/${slug}` },
            createElement('md-icon', { slot: 'icon', 'aria-hidden': 'true' }, 'arrow_back'),
            `${label} sections`,
          )}
          <h1>{tagTitle} · {label}</h1>
        </div>
      </header>

      <div className="hero-builder__progress">
        <p className="hero-builder__progress-label" id="tag-section-progress">
          {isLive ? `Live · ${eligibleCount} visible deal${eligibleCount === 1 ? '' : 's'}` : 'Not live yet · needs at least 1 visible deal'}
        </p>
        <p className="hero-builder__progress-note">
          {isLive
            ? `Visitors in ${label} see this section once it is enabled.`
            : 'Add at least one deal customers can currently see, then enable this section from the state page.'}
        </p>
      </div>

      {error && <p className="error-state" role="alert">{error}</p>}
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

      <div className="hero-builder__panes">
        <section className="hero-builder__pane" aria-labelledby="items-heading">
          <div className="hero-builder__pane-head">
            <h2 id="items-heading">Deals ({items.length})</h2>
            {canEdit && items.length > 1 && <p className="hero-builder__hint">Drag to reorder, or use the arrows.</p>}
          </div>

          {loading && createElement('md-linear-progress', { indeterminate: true, 'aria-label': 'Loading deals' })}

          {!loading && items.length === 0 && (
            <div className="slide-list__empty">
              {createElement('md-icon', { 'aria-hidden': 'true' }, 'local_offer')}
              <p>No deals yet. {canCreate ? 'Add one or more deals from the panel.' : ''}</p>
            </div>
          )}

          {items.length > 0 && (
            <ol className="slide-list">
              {items.map((item, index) => {
                const classes = [
                  'slide-card',
                  dragIndex === index && 'slide-card--dragging',
                  overIndex === index && dragIndex !== index && 'slide-card--over',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <li
                    key={item.id}
                    className={classes}
                    draggable={canEdit}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      setDragIndex(index);
                    }}
                    onDragOver={(e) => {
                      if (dragIndex === null) return;
                      e.preventDefault();
                      setOverIndex(index);
                    }}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setOverIndex(null);
                    }}
                    onDrop={(e) => onDrop(e, index)}
                  >
                    <span className="slide-card__handle" aria-hidden="true">
                      {canEdit && createElement('md-icon', null, 'drag_indicator')}
                    </span>
                    <span className="slide-card__pos" aria-hidden="true">{index + 1}</span>
                    <ItemThumb image={item.image} type="deal" />
                    <span className="slide-card__text">
                      <span className="slide-card__title">{item.deal.title}</span>
                      <span className="slide-card__meta">
                        {item.deal.vendor.businessName} · {item.deal.branch.name} · {formatINR(Number(item.price))}
                        {item.deal.discountPercent ? ` · ${item.deal.discountPercent}% off` : ''}
                      </span>
                      {item.ineligibleReason && (
                        <span className="slide-card__reason">Hidden from customers: {item.ineligibleReason}</span>
                      )}
                    </span>
                    <span className="slide-card__actions">
                      {canEdit &&
                        createElement(
                          'md-icon-button',
                          { 'aria-label': `Move ${item.deal.title} up`, disabled: index === 0, onClick: () => move(index, index - 1) },
                          createElement('md-icon', null, 'arrow_upward'),
                        )}
                      {canEdit &&
                        createElement(
                          'md-icon-button',
                          {
                            'aria-label': `Move ${item.deal.title} down`,
                            disabled: index === items.length - 1,
                            onClick: () => move(index, index + 1),
                          },
                          createElement('md-icon', null, 'arrow_downward'),
                        )}
                      {canDelete &&
                        createElement(
                          'md-icon-button',
                          { 'aria-label': `Remove ${item.deal.title}`, onClick: () => remove(item, index) },
                          createElement('md-icon', null, 'delete'),
                        )}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {canCreate && sectionId && (
          <aside className="hero-builder__pane hero-builder__add" aria-labelledby="add-heading">
            <StateItemPicker
              token={token}
              base="/home-tag-sections"
              state={state}
              dealsOnly
              excludeIds={itemIds}
              onPick={add}
              heading={
                <div className="hero-builder__pane-head">
                  <h2 id="add-heading">Add from {label}</h2>
                </div>
              }
            />
          </aside>
        )}
      </div>
    </div>
  );
}

export default HomeTagSectionsBuilder;
