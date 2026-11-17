import { createElement, useState, type ReactNode } from 'react';
import { useMediaQuery } from '../../../hooks/use-media-query';
import { useVisitorLocation } from '../../../location/location-context';
import type { PagedList } from '../../../hooks/use-paged-list';
import { PageSection } from '../page-section/page-section';
import { ListingToolbar } from '../listing-toolbar/listing-toolbar';
import { ChoiceMenu } from '../choice-menu/choice-menu';
import { ViewSwitch, type ViewOption } from '../view-switch/view-switch';
import { SidebarLayout } from '../sidebar-layout/sidebar-layout';
import { FilterPanel, type ListingFacets } from '../filter-panel/filter-panel';
import { CardGrid } from '../card-grid/card-grid';
import { DealMap, type DealMapPoint } from '../deal-map/deal-map';
import { LoadMore } from '../load-more/load-more';
import { CityPickerDialog } from '../city-picker-dialog/city-picker-dialog';
import type { PriceRange } from '../price-range-field/price-range-field';
import { FILTER_PARAMS, type ListingParams } from './listing-params';
import { listingCopy } from './listing-cards';
import content from '../../../content.json';

const t = content.category;

export interface ListingBodyProps {
  /** Picks the filter sections (`FilterPanel kind`); `all` = explore's mixed list. */
  kind: 'deals' | 'products' | 'therapists' | 'all';
  /** Accessible name of the results band. */
  ariaLabel: string;
  params: ListingParams;
  facets: ListingFacets | null;
  /** Sort choices this page offers right now (e.g. Distance only with coordinates). */
  sortOptions: { value: string; label: string }[];
  /** The active sort, or undefined for relevance. */
  sort?: string;
  list: Pick<PagedList<unknown>, 'status' | 'items' | 'total' | 'hasMore' | 'loadingMore' | 'error' | 'loadMore'>;
  cards: ReactNode;
  /** Deal map markers; the Map view is offered only when there are some. */
  mapPoints?: DealMapPoint[];
  /** Products only: the Category facet (the all-products page). */
  withCategoryFacet?: boolean;
}

/**
 * Results band shared by every listing page (PLANNING §4 "Listing pages share the category
 * layout"): toolbar (Filters, List/Grid/Map, Sort), the filter panel beside the cards (a modal
 * side sheet under 840px), the card grid or deal map, and infinite scroll. All state is in the
 * URL through `params`; pages own their data, heading and chip row.
 */
export function ListingBody({
  kind,
  ariaLabel,
  params,
  facets,
  sortOptions,
  sort,
  list,
  cards,
  mapPoints = [],
  withCategoryFacet = false,
}: ListingBodyProps) {
  const { city: visitorCity, coords } = useVisitorLocation();
  const hasCoords = coords?.latitude != null && coords?.longitude != null;
  const desktop = useMediaQuery('(min-width: 840px)', true);
  const [panelOpen, setPanelOpen] = useState<boolean | null>(null);
  const filtersOpen = panelOpen ?? desktop;
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const { setParams, view, minPrice, maxPrice, radius, vendorIds, branchIds, tags, categoryIds } = params;
  const located = kind !== 'products';
  const copy = listingCopy(kind);

  const activeFilters = [
    located && hasCoords && radius != null,
    minPrice != null || maxPrice != null,
    kind !== 'all' && vendorIds.length > 0,
    (kind === 'deals' || kind === 'therapists') && branchIds.length > 0,
    (kind === 'deals' || kind === 'products') && tags.length > 0,
    withCategoryFacet && categoryIds.length > 0,
  ].filter(Boolean).length;

  const priceBounds = facets?.price
    ? {
        min: Math.floor(facets.price.min / t.filters.step) * t.filters.step,
        max: Math.ceil(facets.price.max / t.filters.step) * t.filters.step,
        step: t.filters.step,
      }
    : { min: t.filters.min, max: t.filters.max, step: t.filters.step };
  const joinIds = (ids: string[]) => (ids.length ? ids.join(',') : undefined);

  const showMap = mapPoints.length > 0;
  const showingMap = view === 'map' && showMap;
  const viewOptions: ViewOption[] = [
    { value: 'list', label: t.view.list, icon: 'view_list' },
    { value: 'grid', label: t.view.grid, icon: 'grid_view' },
    ...(showMap ? [{ value: 'map', label: t.view.map, icon: 'map' }] : []),
  ];
  const sortOption = sortOptions.find((o) => o.value === (sort ?? 'relevance')) ?? sortOptions[0];

  const filtersToggle = createElement(
    'md-text-button',
    { 'aria-expanded': String(filtersOpen), onClick: () => setPanelOpen(!filtersOpen) },
    createElement('md-icon', { slot: 'icon', 'aria-hidden': 'true' }, 'tune'),
    desktop
      ? filtersOpen
        ? t.toolbar.hideFilters
        : t.toolbar.showFilters
      : activeFilters
        ? t.toolbar.filtersActive.replace('{count}', String(activeFilters))
        : t.toolbar.filters,
  );

  const fallback =
    list.status === 'loading' ? (
      <p className="loading-state">{copy.loading}</p>
    ) : list.status === 'error' ? (
      <p className="error-state" role="alert">
        {list.error}
      </p>
    ) : list.items.length === 0 ? (
      <sky-info-card icon="sentiment_dissatisfied" heading={copy.empty.heading} subheading={copy.empty.subheading} />
    ) : undefined;

  const shownOnMap = mapPoints.length;
  return (
    <PageSection tone="tint" stack aria-label={ariaLabel}>
      <ListingToolbar
        ariaLabel={t.toolbar.label}
        start={filtersToggle}
        end={
          <>
            <ViewSwitch
              label={t.view.label}
              options={viewOptions}
              value={showingMap ? 'map' : view === 'map' ? 'grid' : view}
              onChange={(v) => setParams({ view: v === 'grid' ? undefined : v })}
            />
            {sortOption && (
              <ChoiceMenu
                trigger="text"
                icon="swap_vert"
                label={t.toolbar.sort.replace('{label}', sortOption.label)}
                menuLabel={t.toolbar.sortMenu}
                options={sortOptions}
                value={sortOption.value}
                onChange={(value) => setParams({ sort: value === 'relevance' ? undefined : value })}
              />
            )}
          </>
        }
      />
      <SidebarLayout
        open={filtersOpen}
        onClose={() => setPanelOpen(false)}
        sidebarLabel={t.filterPanel.title}
        closeLabel={t.filterPanel.close}
        sidebar={
          <FilterPanel
            kind={kind}
            facets={facets}
            location={{ city: visitorCity, hasCoords }}
            onChangeLocation={() => {
              if (!desktop) setPanelOpen(false);
              setCityPickerOpen(true);
            }}
            radiusKm={radius}
            onRadius={(km) => setParams({ radius: km != null ? String(km) : undefined })}
            price={{ min: minPrice, max: maxPrice }}
            priceBounds={priceBounds}
            onPrice={({ min, max }: PriceRange) =>
              setParams({ min: min != null ? String(min) : undefined, max: max != null ? String(max) : undefined })
            }
            vendorIds={vendorIds}
            onVendors={(ids) => setParams({ vendor: joinIds(ids) })}
            branchIds={branchIds}
            onBranches={(ids) => setParams({ branch: joinIds(ids) })}
            tags={tags}
            onTags={(values) => setParams({ tag: joinIds(values) })}
            {...(withCategoryFacet ? { categoryIds, onCategories: (ids: string[]) => setParams({ cat: joinIds(ids) }) } : {})}
            onClearAll={() => setParams(Object.fromEntries(FILTER_PARAMS.map((k) => [k, undefined])))}
            copy={t.filterPanel}
          />
        }
      >
        {showingMap ? (
          <>
            <DealMap points={mapPoints} ariaLabel={t.map.label} loadingLabel={t.map.loading} />
            {list.items.length > shownOnMap && (
              <p className="body-medium">
                {list.items.length - shownOnMap === 1
                  ? t.map.missingOne
                  : t.map.missing.replace('{count}', String(list.items.length - shownOnMap))}
              </p>
            )}
          </>
        ) : (
          <CardGrid layout={view === 'list' ? 'list' : 'grid'} fallback={fallback}>
            {cards}
          </CardGrid>
        )}
        {list.status === 'ready' && list.items.length > 0 && (
          <LoadMore
            hasMore={list.hasMore}
            loading={list.loadingMore}
            error={list.error}
            status={t.loadMore.status.replace('{shown}', String(list.items.length)).replace('{total}', String(list.total))}
            onLoadMore={list.loadMore}
            copy={t.loadMore}
          />
        )}
      </SidebarLayout>
      {cityPickerOpen && <CityPickerDialog onClose={() => setCityPickerOpen(false)} />}
    </PageSection>
  );
}
