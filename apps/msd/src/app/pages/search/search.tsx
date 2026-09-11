import { useEffect, useRef, useState } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import {
  OutlinedTextField,
  OutlinedSelect,
  SelectOption,
  ChipSet,
  FilterChip,
  Icon,
  IconButton,
  FilledTonalButton,
  Dialog,
  FilledButton,
  TextButton,
  Slider,
  Radio,
  Divider,
} from '@skylabs-monorepo/shared-ui/react';
import { SkyProductCardWC } from '../../components/sky-product-card-wc';
import { DealAddToCartDialog } from '../../components/deal-add-to-cart-dialog';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  listCatalogCategories,
  listCatalogDeals,
  listCatalogLocations,
  type CatalogCategoryWithChildren,
  type CatalogDeal,
  type CatalogLocation,
} from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { formatINR } from '../../../utils/format';
import { resolveDealMedia, primaryImage } from '../../../utils/media';
import { useCurrentLocation } from '../../../hooks/useCurrentLocation';
import content from '../../../content.json';
import './search.css';
import { Map } from '../../components/map';

const { search: searchContent } = content;

type View = 'list' | 'grid' | 'map';
type ActiveDialog = 'price' | 'category' | 'location' | null;

/**
 * Customer catalogue search / explore page — reads the real public catalogue
 * (`GET /catalog/categories`, `GET /catalog/deals`) instead of the mock
 * `DEALS`/`CATEGORIES` fixtures. The URL (`q`, `category`, `sort`) is the
 * source of truth: it's read on mount (so refresh / back-forward restore
 * state) and written on every filter change, merging into whatever params
 * are already present rather than replacing them wholesale.
 *
 * Filters with no real-data equivalent — price level ($/$$/$$$), features,
 * and distance — are removed rather than fed fake data, per the "never
 * fabricate" rule. The Map view is restored and plots each deal's real
 * `branch.latitude`/`longitude` (now exposed by the public catalogue API) —
 * most branches have no coordinates set yet, so a deal is only plotted when
 * its branch's lat/lng are both non-null; if none of the current results
 * have coordinates, the map falls back to the existing empty state instead
 * of guessing a location.
 */
export function Search() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>('list');
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  // ── Filter state (mirrors the URL; kept in sync both ways) ─────────────
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [selectedCategory, setSelectedCategory] = useState(params.get('category') ?? '');
  const [suggested, setSuggested] = useState(params.get('sort') === 'discount');
  const [selectedState, setSelectedState] = useState(params.get('state') ?? '');
  const [selectedCity, setSelectedCity] = useState(params.get('city') ?? '');
  // Only the upper bound is adjustable (single-thumb slider, matching the
  // real UI below) — the lower bound is never sent to the API since no
  // control ever changes it.
  const [priceMax, setPriceMax] = useState(searchContent.filters.price.max);

  const priceDialogRef = useRef<MdDialog>(null);
  const categoryDialogRef = useRef<MdDialog>(null);
  const locationDialogRef = useRef<MdDialog>(null);
  useEffect(() => {
    if (activeDialog === 'price') {
      priceDialogRef.current?.show();
    }

    if (activeDialog === 'category') {
      categoryDialogRef.current?.show();
    }

    if (activeDialog === 'location') {
      locationDialogRef.current?.show();
    }
  }, [activeDialog]);
  // Browser back/forward (or a fresh load) changes `params` out from under
  // us — resync local filter state from the URL whenever that happens. Our
  // own `updateParams()` calls also flow back through here, which is a
  // no-op since the values already match.
  useEffect(() => {
    setQuery(params.get('q') ?? '');
    setSelectedCategory(params.get('category') ?? '');
    setSuggested(params.get('sort') === 'discount');
    setSelectedState(params.get('state') ?? '');
    setSelectedCity(params.get('city') ?? '');
  }, [params]);

  function updateParams(patch: Record<string, string | undefined>) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === '') next.delete(key);
        else next.set(key, value);
      }
      return next;
    });
  }

  // ── Categories (for the category picker dialog) ────────────────────────
  const [categories, setCategories] = useState<CatalogCategoryWithChildren[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  useEffect(() => {
    listCatalogCategories()
      .then(({ data }) => setCategories(data))
      .catch(() => setCategories([]))
      .finally(() => setCategoriesLoading(false));
  }, []);

  const selectedCategoryEntry = categories.find((c) => c.slug === selectedCategory);

  // ── Locations (for the State/City picker dialog) — distinct {state, city} pairs from active
  // branches, not the full static `india-locations.ts` list, so the picker only ever offers
  // combinations that can actually return results. ─────────────────────────────────────────
  const [locations, setLocations] = useState<CatalogLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(true);

  useEffect(() => {
    listCatalogLocations()
      .then(({ data }) => setLocations(data))
      .catch(() => setLocations([]))
      .finally(() => setLocationsLoading(false));
  }, []);

  const availableStates = Array.from(new Set(locations.map((l) => l.state))).sort();
  const citiesForSelectedState = Array.from(
    new Set(locations.filter((l) => l.state === selectedState).map((l) => l.city)),
  ).sort();

  // ── Deals (real, server-filtered/sorted) ────────────────────────────────
  const [deals, setDeals] = useState<CatalogDeal[]>([]);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [dealsError, setDealsError] = useState('');
  const { coords } = useCurrentLocation();

  useEffect(() => {
    // Wait for categories to resolve slug → id before fetching, so a
    // `?category=<slug>` in the URL isn't dropped on the first request.
    if (categoriesLoading) return;
    setDealsLoading(true);
    setDealsError('');
    listCatalogDeals({
      search: query || undefined,
      categoryId: selectedCategoryEntry?.id,
      sort: suggested ? 'discount' : undefined,
      maxPrice: priceMax < searchContent.filters.price.max ? priceMax : undefined,
      state: selectedState || undefined,
      city: selectedCity || undefined,
      pageSize: 100,
      latitude: coords?.latitude,
      longitude: coords?.longitude,
    })
      .then(({ data }) => setDeals(data))
      .catch((err) => setDealsError(err instanceof ApiRequestError ? err.message : searchContent.errors.loadDeals))
      .finally(() => setDealsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, selectedCategoryEntry?.id, suggested, priceMax, selectedState, selectedCity, categoriesLoading, coords?.latitude, coords?.longitude]);

  function selectCategory(slug: string) {
    setSelectedCategory(slug);
    updateParams({ category: slug || undefined });
  }

  function toggleSuggested() {
    const next = !suggested;
    setSuggested(next);
    updateParams({ sort: next ? 'discount' : undefined });
  }

  function selectState(state: string) {
    setSelectedState(state);
    setSelectedCity('');
    updateParams({ state: state || undefined, city: undefined });
  }

  function selectCity(city: string) {
    setSelectedCity(city);
    updateParams({ city: city || undefined });
  }

  function clearLocation() {
    setSelectedState('');
    setSelectedCity('');
    updateParams({ state: undefined, city: undefined });
  }

  function clearAllFilters() {
    setQuery('');
    setPriceMax(searchContent.filters.price.max);
    setSuggested(false);
    setSelectedCategory('');
    setSelectedState('');
    setSelectedCity('');
    setParams({});
  }
  const hasActiveFilters =
    suggested || selectedCategory !== '' || priceMax < searchContent.filters.price.max || selectedState !== '';

  const { toggle: wishlistToggle, has: wishlistHas } = useWishlist();

  const requireAuthOrRedirect = () => {
    if (isAuthenticated) return true;
    navigate(`/sign-in?next=${encodeURIComponent('/explore')}`);
    return false;
  };

  // ── Map view — only deals whose branch has real, non-fabricated coordinates ──
  const dealsWithCoords = deals.filter(
    (deal): deal is CatalogDeal & { branch: { latitude: string; longitude: string } } =>
      deal.branch?.latitude != null && deal.branch?.longitude != null
  );
  const mappableDeals = dealsWithCoords.map((deal) => ({
    id: deal.id,
    lat: Number(deal.branch.latitude),
    lng: Number(deal.branch.longitude),
    price: Number(deal.salePrice),
  }));

  return (
    <div className="search-page">
      <title>{content.meta.explore.title}</title>
      <meta name="description" content={content.meta.explore.description} />
      <meta name="robots" content="noindex" />
      {/* ── Search bar ─────────────────────────────────────────────────── */}
      <div className="search-page__bar-wrap">
        <div className="search-page__bar">
          <form
            role="search"
            aria-label={searchContent.ariaLabel}
            className="search-page__form"
            onSubmit={(e) => {
              e.preventDefault();
              updateParams({ q: query || undefined });
            }}
          >
            <OutlinedTextField
              className="search-page__field"
              label={searchContent.placeholder}
              value={query}
              onInput={(e) =>
                setQuery((e.target as unknown as { value: string }).value)
              }
            >
              <Icon slot="leading-icon" aria-hidden="true">search</Icon>
            </OutlinedTextField>
          </form>
          {/* View toggle */}
          <div className="search-page__view-toggle" role="group" aria-label={searchContent.view.groupLabel}>
            <IconButton
              aria-label={searchContent.view.list}
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
              className={view === 'list' ? 'search-page__view-btn--active' : ''}
            >
              <Icon aria-hidden="true">view_list</Icon>
            </IconButton>
            <IconButton
              aria-label={searchContent.view.grid}
              aria-pressed={view === 'grid'}
              onClick={() => setView('grid')}
              className={view === 'grid' ? 'search-page__view-btn--active' : ''}
            >
              <Icon aria-hidden="true">grid_view</Icon>
            </IconButton>
            <IconButton
              aria-label={searchContent.view.map}
              aria-pressed={view === 'map'}
              onClick={() => setView('map')}
              className={view === 'map' ? 'search-page__view-btn--active' : ''}
            >
              <Icon aria-hidden="true">map</Icon>
            </IconButton>
          </div>
        </div>
        {/* ── Filter chips ──────────────────────────────────────────────── */}
        <div className="search-page__chips">
          <ChipSet>
            {/* Price */}
            <FilterChip
              label={
                priceMax < searchContent.filters.price.max
                  ? searchContent.filters.price.activeLabel.replace(
                    '{price}',
                    formatINR(priceMax)
                  )
                  : searchContent.filters.price.label
              }
              selected={priceMax < searchContent.filters.price.max}
              onClick={() => setActiveDialog('price')}
            >
              <Icon slot="icon" aria-hidden="true">payments</Icon>
            </FilterChip>

            {/* Suggested */}
            <FilterChip
              label={searchContent.filters.suggested.label}
              selected={suggested}
              onClick={toggleSuggested}
            >
              <Icon slot="icon" aria-hidden="true">auto_awesome</Icon>
            </FilterChip>
            {/* Category */}
            <FilterChip
              label={selectedCategoryEntry?.name ?? searchContent.filters.category.label}
              selected={!!selectedCategory}
              onClick={() => setActiveDialog('category')}
            >
              <Icon slot="icon" aria-hidden="true">category</Icon>
            </FilterChip>
            {/* Location */}
            <FilterChip
              label={
                selectedCity
                  ? `${selectedCity}, ${selectedState}`
                  : selectedState || searchContent.filters.location.label
              }
              selected={!!selectedState}
              onClick={() => setActiveDialog('location')}
            >
              <Icon slot="icon" aria-hidden="true">location_on</Icon>
            </FilterChip>
          </ChipSet>
          {hasActiveFilters && (
            <TextButton onClick={clearAllFilters} className="search-page__clear">
              <Icon slot="icon" aria-hidden="true">close</Icon>
              {searchContent.filters.clearAll}
            </TextButton>
          )}
        </div>
      </div>
      {/* ── Results header ─────────────────────────────────────────────── */}
      <div className="search-page__content">
        <p
          className="search-page__count"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {dealsLoading ? '…' : `${deals.length} ${searchContent.resultLabel}`}
        </p>

        {actionMessage && <p className="field-hint" role="status">{actionMessage}</p>}
        {actionError && <p className="error-state" role="alert">{actionError}</p>}

        {dealsLoading ? (
          <p className="loading-state"> {searchContent.loading.deals}</p>
        ) : dealsError ? (
          <p className="error-state" role="alert">{dealsError}</p>
        ) : deals.length === 0 ? (
          <p className="search-page__empty">{searchContent.noResults}</p>
        ) : (
          <>
            {/* ── List view ───────────────────────────────────────────── */}
            {view === 'list' && (
              <section aria-label={searchContent.results.listAriaLabel}>
                <ul className="search-results-list">
                  {deals.map((deal) => {
                    const heading = deal.title;
                    const image = primaryImage(resolveDealMedia(deal));
                    const imageAlt = heading;
                    return (
                      <li key={deal.id} className="search-results-list__item">
                        <article className="search-result-card">
                          <Link
                            to={`/deal/${deal.id}`}
                            className="search-result-card__img-link"
                            tabIndex={-1}
                            aria-hidden="true"
                          >
                            {image && (
                              <img
                                className="search-result-card__img"
                                src={image}
                                alt={imageAlt}
                                width={140}
                                height={140}
                                loading="lazy"
                              />
                            )}
                          </Link>
                          <div className="search-result-card__body">
                            <div className="search-result-card__top">
                              <div>
                                <h3 className="search-result-card__title">
                                  <Link to={`/deal/${deal.id}`}>{heading}</Link>
                                </h3>
                                {deal.vendor?.businessName && (
                                  <p className="search-result-card__provider">
                                    {deal.vendor.slug ? (
                                      <Link to={`/vendor/${deal.vendor.slug}`}>{deal.vendor.businessName}</Link>
                                    ) : (
                                      deal.vendor.businessName
                                    )}
                                  </p>
                                )}
                              </div>
                            </div>
                            <p className="search-result-card__desc">
                              {deal.shortDescription ?? deal.description}
                            </p>
                            <div className="search-result-card__meta">
                              <span className="search-result-card__price">
                                {formatINR(Number(deal.salePrice))}
                              </span>
                            </div>
                            <div className="search-result-card__actions">
                              <DealAddToCartDialog
                                deal={deal}
                                onAdded={(label) => setActionMessage(`Added "${label}" to your cart.`)}
                                renderTrigger={(open) => (
                                  <FilledTonalButton
                                    onClick={() => {
                                      if (requireAuthOrRedirect()) open();
                                    }}
                                  >
                                    Add to Cart
                                  </FilledTonalButton>
                                )}
                              />
                              <IconButton
                                aria-label={
                                  wishlistHas(deal.id)
                                    ? searchContent.labels.removeWishlist
                                    : searchContent.labels.saveWishlist
                                }
                                onClick={() => wishlistToggle(deal.id)}
                              >
                                <Icon aria-hidden="true">
                                  {wishlistHas(deal.id) ? 'favorite' : 'favorite_border'}
                                </Icon>
                              </IconButton>
                            </div>
                          </div>
                        </article>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* ── Grid view ───────────────────────────────────────────── */}
            {view === 'grid' && (
              <section aria-label={searchContent.results.gridAriaLabel}>
                <ul className="search-results-grid">
                  {deals.map((deal) => (
                    <li key={deal.id}>
                      <SkyProductCardWC
                        image={primaryImage(resolveDealMedia(deal))}
                        imageAlt={deal.title}
                        badge={searchContent.labels.service}
                        tag={deal.popularTags?.[0]?.name}
                        heading={deal.title}
                        eyebrow={[deal.vendor?.businessName, deal.branch?.name].filter(Boolean).join(' · ')}
                        eyebrowHref={deal.vendor?.slug ? `/vendor/${deal.vendor.slug}` : undefined}
                        location={deal.branch?.city ?? undefined}
                        distance={deal.distanceKm != null ? `${(Math.round(deal.distanceKm * 10) / 10)} km` : undefined}
                        priceNote={deal.durationMinutes ? `${deal.durationMinutes}${searchContent.labels.durationSuffix}` : undefined}
                        price={formatINR(Number(deal.salePrice))}
                        originalPrice={
                          deal.originalPrice && Number(deal.originalPrice) !== Number(deal.salePrice)
                            ? formatINR(Number(deal.originalPrice))
                            : undefined
                        }
                        favorite={true}
                        favoriteActive={wishlistHas(deal.id)}
                        href={`/deal/${deal.id}`}
                        onFavorite={() => wishlistToggle(deal.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* ── Map view ────────────────────────────────────────────── */}
            {view === 'map' && (
              <section aria-label={searchContent.results.mapAriaLabel} className="search-map">
                {mappableDeals.length === 0 ? (
                  <p className="search-page__empty">{searchContent.noResults}</p>
                ) : (
                  <>
                    <div className="search-map__canvas" role="img" aria-label={searchContent.results.mapImageLabel}>
                      <Map deals={mappableDeals} />
                    </div>
                    <div className="search-map__sidebar">
                      <p className="search-map__sidebar-count">{mappableDeals.length}  {searchContent.results.mapResultsSuffix}</p>
                      <ul className="search-map__list">
                        {dealsWithCoords
                          .slice(0, 5)
                          .map((deal) => {
                            const heading = deal.title;
                            const image = primaryImage(resolveDealMedia(deal));
                            const imageAlt = heading;
                            return (
                              <li key={deal.id} className="search-map__list-item">
                                <Link to={`/deal/${deal.id}`} className="search-map__list-link">
                                  {image && (
                                    <img src={image} alt={imageAlt} width={64} height={64} loading="lazy" />
                                  )}
                                  <span>
                                    <strong>{heading}</strong>
                                    {deal.vendor?.businessName && <small>{deal.vendor.businessName}</small>}
                                    <small>{formatINR(Number(deal.salePrice))}</small>
                                  </span>
                                </Link>
                              </li>
                            );
                          })}
                      </ul>
                    </div>
                  </>
                )}
              </section>
            )}
          </>
        )}
      </div>
      {/* ── Price Dialog ───────────────────────────────────────────────── */}
      <Dialog
        ref={priceDialogRef}
        onClose={() => setActiveDialog(null)}
      >
        <span slot="headline"> {searchContent.filters.price.dialogTitle}</span>
        <div slot="content" className="filter-dialog">
          <p className="filter-dialog__label">
            {searchContent.filters.price.priceUpTo} {formatINR(priceMax)}
          </p>
          <Slider
            min={searchContent.filters.price.min}
            max={searchContent.filters.price.max}
            value={priceMax}
            step={500}
            onInput={(e) => setPriceMax((e.target as unknown as { value: number }).value)}
          />
        </div>
        <div slot="actions">
          <TextButton onClick={() => setPriceMax(searchContent.filters.price.max)}>
            {searchContent.filters.price.clear}
          </TextButton>
          <FilledButton onClick={() => setActiveDialog(null)}> {searchContent.filters.price.apply}</FilledButton>
        </div>
      </Dialog>

      {/* ── Category Dialog ────────────────────────────────────────────── */}
      <Dialog
        ref={categoryDialogRef}
        onClose={() => setActiveDialog(null)}
      >
        <span slot="headline"> {searchContent.filters.category.dialogTitle}</span>
        <div slot="content" className="filter-dialog">
          <div role="radiogroup" aria-label={searchContent.filters.category.ariaLabel} className="filter-dialog__checks">
            <label className="filter-dialog__check-opt">
              <Radio
                name="category"
                value=""
                checked={selectedCategory === ''}
                onChange={() => selectCategory('')}
              />
              <span>{searchContent.filters.category.all}</span>
            </label>
            {categoriesLoading ? (
              <p className="loading-state">
                {searchContent.loading.categories}
              </p>
            ) : (
              categories.map((cat) => (
                <label key={cat.id} className="filter-dialog__check-opt">
                  <Radio
                    name="category"
                    value={cat.slug}
                    checked={selectedCategory === cat.slug}
                    onChange={() => selectCategory(cat.slug)}
                  />
                  <span>{cat.name}</span>
                </label>
              ))
            )}
          </div>
          <Divider />
          <Link to="/categories" className="field-hint">{searchContent.filters.category.browseAll}</Link>
        </div>
        <div slot="actions">
          <TextButton onClick={() => selectCategory('')}>{searchContent.filters.category.clear}</TextButton>
          <FilledButton onClick={() => setActiveDialog(null)}>{searchContent.filters.category.apply}</FilledButton>
        </div>
      </Dialog>

      {/* ── Location Dialog ────────────────────────────────────────────── */}
      <Dialog
        ref={locationDialogRef}
        onClose={() => setActiveDialog(null)}
      >
        <span slot="headline">{searchContent.filters.location.dialogTitle}</span>
        <div slot="content" className="filter-dialog">
          {locationsLoading ? (
            <p className="loading-state">{searchContent.loading.categories}</p>
          ) : (
            <>
              <OutlinedSelect
                label={searchContent.filters.location.stateLabel}
                value={selectedState}
                onChange={(e: Event) => selectState((e.target as HTMLSelectElement).value)}
              >
                <SelectOption value="">
                  <div slot="headline">{searchContent.filters.location.stateAll}</div>
                </SelectOption>
                {availableStates.map((state) => (
                  <SelectOption key={state} value={state}>
                    <div slot="headline">{state}</div>
                  </SelectOption>
                ))}
              </OutlinedSelect>

              {selectedState && citiesForSelectedState.length > 0 && (
                <OutlinedSelect
                  label={searchContent.filters.location.cityLabel}
                  value={selectedCity}
                  onChange={(e: Event) => selectCity((e.target as HTMLSelectElement).value)}
                >
                  <SelectOption value="">
                    <div slot="headline">{searchContent.filters.location.cityAll}</div>
                  </SelectOption>
                  {citiesForSelectedState.map((city) => (
                    <SelectOption key={city} value={city}>
                      <div slot="headline">{city}</div>
                    </SelectOption>
                  ))}
                </OutlinedSelect>
              )}
            </>
          )}
        </div>
        <div slot="actions">
          <TextButton onClick={clearLocation}>{searchContent.filters.location.clear}</TextButton>
          <FilledButton onClick={() => setActiveDialog(null)}>{searchContent.filters.location.apply}</FilledButton>
        </div>
      </Dialog>
    </div>
  );
}

export default Search;
