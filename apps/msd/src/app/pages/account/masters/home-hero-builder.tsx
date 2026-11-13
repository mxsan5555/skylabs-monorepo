import { createElement, useCallback, useEffect, useState, type ChangeEvent, type DragEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  MIN_ELIGIBLE_SLIDES,
  createHomeHeroSlide,
  deleteHomeHeroSlide,
  listHomeHeroSlides,
  reorderHomeHeroSlides,
  setHomeHeroSlideStatus,
  slideTitle,
  stateFromSlug,
  type HomeHeroSlide,
  type StateItem,
} from '../../../../api/rbac/home-hero';
import { ApiRequestError } from '../../../../api/rbac/client';
import { ChipNav } from '../../../components/chip-nav/chip-nav';
import { showSnackbar } from '../../../../snackbar/snackbar';
import { useMediaQuery } from '../../../../hooks/use-media-query';
import { formatINR } from '../../../../utils/format';
import { ItemThumb, StateItemPicker } from './state-item-picker';
import { GLOBAL_LABEL } from './state-picker';
import './home-hero-builder.css';

const errorText = (err: unknown, fallback: string) => (err instanceof ApiRequestError ? err.message : fallback);

/** Moves the item at `from` to `to` and returns a new array. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Visible to customers now: the slide is on and its deal or product passes the storefront bar. */
const isLiveSlide = (slide: HomeHeroSlide) => slide.isActive && slide.itemEligible;

/**
 * Builder for one Home hero slider (docs/msd/PLANNING.md §7, D28): the ordered slides beside the
 * Add panel, no dialogs. Slides reorder by drag or the move buttons and save at once; removing a
 * slide offers Undo instead of a confirmation.
 */
export function HomeHeroBuilder() {
  const { state: slug = 'global' } = useParams();
  const state = stateFromSlug(slug);
  const label = state ?? GLOBAL_LABEL;
  const { token, can } = useAuth();
  const canCreate = can('masters.home-hero', 'create');
  const canEdit = can('masters.home-hero', 'edit');
  const canDelete = can('masters.home-hero', 'delete');
  const wide = useMediaQuery('(min-width: 1024px)', true);

  const [slides, setSlides] = useState<HomeHeroSlide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'slides' | 'add'>('slides');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await listHomeHeroSlides(token, { state, page: 1, pageSize: 100 });
      setSlides([...data].sort((a, b) => a.sortOrder - b.sortOrder));
    } catch (err) {
      setError(errorText(err, 'Could not load this slider.'));
    } finally {
      setLoading(false);
    }
  }, [token, state]);

  useEffect(() => {
    load();
  }, [load]);

  const saveOrder = async (next: HomeHeroSlide[], previous: HomeHeroSlide[], message: string) => {
    setSlides(next);
    setAnnouncement(message);
    try {
      await reorderHomeHeroSlides(token, state, next.map((s) => s.id));
    } catch (err) {
      setSlides(previous);
      showSnackbar(errorText(err, 'Could not save the new order.'), { variant: 'error' });
    }
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= slides.length || from === to) return;
    const next = moveItem(slides, from, to);
    saveOrder(next, slides, `Moved ${slideTitle(slides[from])} to position ${to + 1} of ${slides.length}.`);
  };

  const add = async (item: StateItem) => {
    try {
      const { data } = await createHomeHeroSlide(token, { itemType: item.type, itemId: item.id, state, sortOrder: slides.length });
      setSlides((prev) => [...prev, data]);
      showSnackbar(`Added ${item.title} to the ${label} slider.`, { variant: 'success' });
    } catch (err) {
      showSnackbar(errorText(err, 'Could not add this item.'), { variant: 'error' });
    }
  };

  const remove = async (slide: HomeHeroSlide, index: number) => {
    try {
      await deleteHomeHeroSlide(token, slide.id);
      const remaining = slides.filter((s) => s.id !== slide.id);
      setSlides(remaining);
      showSnackbar(`Removed ${slideTitle(slide)}.`, {
        actionLabel: 'Undo',
        onAction: async () => {
          try {
            const { data } = await createHomeHeroSlide(token, {
              itemType: slide.itemType,
              itemId: (slide.dealId ?? slide.productId) as string,
              state,
              sortOrder: index,
            });
            const restored = [...remaining];
            restored.splice(index, 0, { ...data, isActive: slide.isActive });
            if (!slide.isActive) await setHomeHeroSlideStatus(token, data.id, false);
            await saveOrder(restored, remaining, `Restored ${slideTitle(slide)}.`);
          } catch (err) {
            showSnackbar(errorText(err, 'Could not restore this slide.'), { variant: 'error' });
          }
        },
      });
    } catch (err) {
      showSnackbar(errorText(err, 'Could not remove this slide.'), { variant: 'error' });
    }
  };

  const toggle = async (slide: HomeHeroSlide, isActive: boolean) => {
    setSlides((prev) => prev.map((s) => (s.id === slide.id ? { ...s, isActive } : s)));
    try {
      await setHomeHeroSlideStatus(token, slide.id, isActive);
    } catch (err) {
      setSlides((prev) => prev.map((s) => (s.id === slide.id ? { ...s, isActive: !isActive } : s)));
      showSnackbar(errorText(err, 'Could not change this slide.'), { variant: 'error' });
    }
  };

  const liveCount = slides.filter(isLiveSlide).length;
  const isLive = liveCount >= MIN_ELIGIBLE_SLIDES;
  const progressLabel = isLive
    ? `Live · ${liveCount} visible ${liveCount === 1 ? 'slide' : 'slides'}`
    : `Draft · ${MIN_ELIGIBLE_SLIDES - liveCount} more visible ${MIN_ELIGIBLE_SLIDES - liveCount === 1 ? 'slide' : 'slides'} to go live`;
  const progressNote = isLive
    ? state
      ? `Visitors in ${state} see this slider.`
      : 'Visitors whose state has no live slider, or whose location is unknown, see this slider.'
    : state
      ? `Until then, visitors in ${state} see the ${GLOBAL_LABEL} slider.`
      : 'Until then, the home page shows the best-discount deal instead of a slider.';

  const showSlides = wide || tab === 'slides';
  const showAdd = canCreate && (wide || tab === 'add');
  const itemIds = slides.map((s) => s.dealId ?? s.productId ?? '');

  const onDrop = (e: DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex !== null) move(dragIndex, index);
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <div className="admin-page admin-page--wide">
      <title>{`${label} slider · Home Hero · MSD`}</title>
      <header className="page-head">
        <div>
          {createElement(
            'md-text-button',
            { className: 'hero-builder__back', href: '/account/masters/home-hero' },
            createElement('md-icon', { slot: 'icon', 'aria-hidden': 'true' }, 'arrow_back'),
            'All sliders',
          )}
          <h1>{label} slider</h1>
        </div>
      </header>

      <div className="hero-builder__progress">
        <p className="hero-builder__progress-label" id="hero-progress">{progressLabel}</p>
        {createElement('md-linear-progress', {
          value: Math.min(liveCount / MIN_ELIGIBLE_SLIDES, 1),
          'aria-labelledby': 'hero-progress',
        })}
        <p className="hero-builder__progress-note">{progressNote}</p>
      </div>

      {error && <p className="error-state" role="alert">{error}</p>}
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

      {!wide && canCreate && (
        <div className="hero-builder__tabs">
          <ChipNav
            items={[
              { value: 'slides', label: `Slides (${slides.length})` },
              { value: 'add', label: 'Add items' },
            ]}
            value={tab}
            onSelect={(value) => setTab(value as 'slides' | 'add')}
            ariaLabel="Builder view"
          />
        </div>
      )}

      <div className="hero-builder__panes">
        {showSlides && (
          <section className="hero-builder__pane" aria-labelledby="slides-heading">
            <div className="hero-builder__pane-head">
              <h2 id="slides-heading">Slides</h2>
              {canEdit && slides.length > 1 && <p className="hero-builder__hint">Drag to reorder, or use the arrows.</p>}
            </div>

            {loading && createElement('md-linear-progress', { indeterminate: true, 'aria-label': 'Loading slides' })}

            {!loading && slides.length === 0 && (
              <div className="slide-list__empty">
                {createElement('md-icon', { 'aria-hidden': 'true' }, 'view_carousel')}
                <p>
                  No slides yet. {canCreate ? `Add ${MIN_ELIGIBLE_SLIDES} or more deals and products from ${wide ? 'the panel on the right' : 'Add items'}.` : ''}
                </p>
              </div>
            )}

            {slides.length > 0 && (
              <ol className="slide-list">
                {slides.map((slide, index) => {
                  const title = slideTitle(slide);
                  const member = slide.deal?.vendor.businessName ?? slide.product?.vendor.businessName ?? '';
                  const classes = [
                    'slide-card',
                    !slide.isActive && 'slide-card--off',
                    dragIndex === index && 'slide-card--dragging',
                    overIndex === index && dragIndex !== index && 'slide-card--over',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <li
                      key={slide.id}
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
                      <ItemThumb image={slide.image} type={slide.itemType} />
                      <span className="slide-card__text">
                        <span className="slide-card__title">{title}</span>
                        <span className="slide-card__meta">
                          {slide.itemType === 'deal' ? 'Deal' : 'Product'} · {member}
                          {slide.deal ? ` · ${slide.deal.branch.name}` : ''}
                          {slide.price ? ` · ${formatINR(Number(slide.price))}` : ''}
                        </span>
                        {slide.ineligibleReason && (
                          <span className="slide-card__reason">Hidden from customers: {slide.ineligibleReason}</span>
                        )}
                      </span>
                      <span className="slide-card__actions">
                        {canEdit &&
                          createElement('md-switch', {
                            selected: slide.isActive,
                            'aria-label': `Show ${title} in the slider`,
                            onChange: (e: ChangeEvent<HTMLElement & { selected: boolean }>) => toggle(slide, e.currentTarget.selected),
                          })}
                        {canEdit &&
                          createElement(
                            'md-icon-button',
                            { 'aria-label': `Move ${title} up`, disabled: index === 0, onClick: () => move(index, index - 1) },
                            createElement('md-icon', null, 'arrow_upward'),
                          )}
                        {canEdit &&
                          createElement(
                            'md-icon-button',
                            {
                              'aria-label': `Move ${title} down`,
                              disabled: index === slides.length - 1,
                              onClick: () => move(index, index + 1),
                            },
                            createElement('md-icon', null, 'arrow_downward'),
                          )}
                        {canDelete &&
                          createElement(
                            'md-icon-button',
                            { 'aria-label': `Remove ${title}`, onClick: () => remove(slide, index) },
                            createElement('md-icon', null, 'delete'),
                          )}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        )}

        {showAdd && (
          <aside className="hero-builder__pane hero-builder__add" aria-labelledby="add-heading">
            <StateItemPicker
              token={token}
              base="/home-hero"
              state={state}
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

export default HomeHeroBuilder;
