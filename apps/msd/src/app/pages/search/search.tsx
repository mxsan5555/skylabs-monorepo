import { useState, useMemo, useRef, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  OutlinedTextField,
  ChipSet,
  FilterChip,
  Icon,
  IconButton,
  FilledTonalButton,
  Dialog,
  FilledButton,
  TextButton,
  Slider,
  Checkbox,
  Radio,
  Divider,
} from '@skylabs-monorepo/shared-ui/react';
import { SkyProductCardWC } from '../../components/sky-product-card-wc';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { useCart } from '../../../cart/cart-context';
import { DEALS } from '../../../data/deals';
import { CATEGORIES } from '../../../data/categories';
import type { SearchView, PriceLevel } from '../../../types';
import { formatINR } from '../../../utils/format';
import content from '../../../content.json';
import './search.css';
import { Map } from '../../components/map';

const { search: searchContent } = content;
const DISTANCE_MAX = searchContent.filters.distance.max;

type ActiveDialog = 'price' | 'category' | 'features' | 'distance' | null;

const PRICE_LEVELS: { value: PriceLevel; label: string }[] =
  searchContent.filters.price.priceLevels as { value: PriceLevel; label: string }[];

export function Search() {
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<SearchView>('list');
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);

  // Filter state
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [priceRange, setPriceRange] = useState<[number, number]>([
    searchContent.filters.price.min,
    searchContent.filters.price.max,
  ]);
  const [selectedPriceLevels, setSelectedPriceLevels] = useState<PriceLevel[]>([]);
  const [suggested, setSuggested] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(params.get('category') ?? '');
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [distanceMax, setDistanceMax] = useState(DISTANCE_MAX);

  const priceDialogRef = useRef<{ show: () => void; close: () => void } | null>(null);
  const categoryDialogRef = useRef<{ show: () => void; close: () => void } | null>(null);
  const featuresDialogRef = useRef<{ show: () => void; close: () => void } | null>(null);
  const distanceDialogRef = useRef<{ show: () => void; close: () => void } | null>(null);

  useEffect(() => {
    const map: Record<NonNullable<ActiveDialog>, React.MutableRefObject<{ show: () => void; close: () => void } | null>> = {
      price: priceDialogRef,
      category: categoryDialogRef,
      features: featuresDialogRef,
      distance: distanceDialogRef,
    };
    if (activeDialog) {
      map[activeDialog].current?.show();
    }
  }, [activeDialog]);

  const filtered = useMemo(() => {
    let list = [...DEALS];
    const q = query.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.providerName.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q),
      );
    }
    if (selectedCategory) {
      list = list.filter((d) => d.categorySlug === selectedCategory);
    }
    if (selectedPriceLevels.length > 0) {
      list = list.filter((d) => selectedPriceLevels.includes(d.priceLevel));
    }
    list = list.filter((d) => d.price >= priceRange[0] && d.price <= priceRange[1]);
    if (selectedFeatures.length > 0) {
      list = list.filter((d) =>
        selectedFeatures.every((f) => d.features.includes(f)),
      );
    }
    list = list.filter((d) => d.distance <= distanceMax);
    if (suggested) {
      list = [...list].sort((a, b) => b.rating - a.rating);
    }
    return list;
  }, [query, selectedCategory, selectedPriceLevels, priceRange, selectedFeatures, distanceMax, suggested]);

  function toggleFeature(f: string) {
    setSelectedFeatures((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f],
    );
  }

  function clearAllFilters() {
    setQuery('');
    setSelectedPriceLevels([]);
    setPriceRange([searchContent.filters.price.min, searchContent.filters.price.max]);
    setSuggested(false);
    setSelectedCategory('');
    setSelectedFeatures([]);
    setDistanceMax(DISTANCE_MAX);
    setParams({});
  }

  const hasActiveFilters =
    selectedPriceLevels.length > 0 ||
    suggested ||
    selectedCategory !== '' ||
    selectedFeatures.length > 0 ||
    distanceMax < DISTANCE_MAX;

  const { toggle: wishlistToggle, has: wishlistHas } = useWishlist();
  const { addItem } = useCart();

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
            aria-label="Search deals"
            className="search-page__form"
            onSubmit={(e) => {
              e.preventDefault();
              setParams(query ? { q: query } : {});
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
          <div className="search-page__view-toggle" role="group" aria-label="Results view">
            <IconButton
              aria-label="List view"
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
              className={view === 'list' ? 'search-page__view-btn--active' : ''}
            >
              <Icon aria-hidden="true">view_list</Icon>
            </IconButton>
            <IconButton
              aria-label="Grid view"
              aria-pressed={view === 'grid'}
              onClick={() => setView('grid')}
              className={view === 'grid' ? 'search-page__view-btn--active' : ''}
            >
              <Icon aria-hidden="true">grid_view</Icon>
            </IconButton>
            <IconButton
              aria-label="Map view"
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
              label={selectedPriceLevels.length > 0
                ? `Price (${selectedPriceLevels.join(', ')})`
                : searchContent.filters.price.label}
              selected={selectedPriceLevels.length > 0}
              onClick={() => setActiveDialog('price')}
            >
              <Icon slot="icon" aria-hidden="true">payments</Icon>
            </FilterChip>

            {/* Suggested */}
            <FilterChip
              label={searchContent.filters.suggested.label}
              selected={suggested}
              onClick={() => setSuggested((v) => !v)}
            >
              <Icon slot="icon" aria-hidden="true">auto_awesome</Icon>
            </FilterChip>

            {/* Category */}
            <FilterChip
              label={selectedCategory
                ? (CATEGORIES.find((c) => c.slug === selectedCategory)?.name ?? searchContent.filters.category.label)
                : searchContent.filters.category.label}
              selected={!!selectedCategory}
              onClick={() => setActiveDialog('category')}
            >
              <Icon slot="icon" aria-hidden="true">category</Icon>
            </FilterChip>

            {/* Features */}
            <FilterChip
              label={selectedFeatures.length > 0
                ? `Features (${selectedFeatures.length})`
                : searchContent.filters.features.label}
              selected={selectedFeatures.length > 0}
              onClick={() => setActiveDialog('features')}
            >
              <Icon slot="icon" aria-hidden="true">tune</Icon>
            </FilterChip>

            {/* Distance */}
            <FilterChip
              label={distanceMax < DISTANCE_MAX
                ? `Within ${distanceMax} km`
                : searchContent.filters.distance.label}
              selected={distanceMax < 50}
              onClick={() => setActiveDialog('distance')}
            >
              <Icon slot="icon" aria-hidden="true">near_me</Icon>
            </FilterChip>
          </ChipSet>

          {hasActiveFilters && (
            <TextButton onClick={clearAllFilters} className="search-page__clear">
              <Icon slot="icon" aria-hidden="true">close</Icon>
              Clear filters
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
          {filtered.length} {searchContent.resultLabel}
        </p>

        {/* ── List view ─────────────────────────────────────────────────── */}
        {view === 'list' && (
          <section aria-label="Search results list">
            {filtered.length === 0 ? (
              <p className="search-page__empty">{searchContent.noResults}</p>
            ) : (
              <ul className="search-results-list">
                {filtered.map((deal) => (
                  <li key={deal.id} className="search-results-list__item">
                    <article className="search-result-card">
                      <Link
                        to={`/deal/${deal.id}`}
                        className="search-result-card__img-link"
                        tabIndex={-1}
                        aria-hidden="true"
                      >
                        <img
                          className="search-result-card__img"
                          src={deal.image}
                          alt={deal.imageAlt}
                          width={140}
                          height={140}
                          loading="lazy"
                        />
                      </Link>
                      <div className="search-result-card__body">
                        <div className="search-result-card__top">
                          <div>
                            <h3 className="search-result-card__title">
                              <Link to={`/deal/${deal.id}`}>
                                {deal.title}
                              </Link>
                            </h3>
                            <p className="search-result-card__provider">{deal.providerName}</p>
                            <p className="search-result-card__price-tier">{deal.priceLevel}</p>
                          </div>
                        </div>
                        <p className="search-result-card__desc">{deal.description}</p>
                        <div className="search-result-card__meta">
                          <sky-badge
                            variant={deal.isOpen ? 'primary' : 'secondary'}
                            size="small"
                          >
                            {deal.isOpen ? 'Open' : 'Closed'}
                          </sky-badge>
                          <span className="search-result-card__rating" aria-label={`Rating ${deal.rating}`}>
                            <Icon aria-hidden="true" className="search-result-card__star">star</Icon>
                            {deal.rating}
                          </span>
                          <span className="search-result-card__dist" aria-label={`${deal.distance} km away`}>
                            <Icon aria-hidden="true">near_me</Icon>
                            {deal.distance} km
                          </span>
                          <span className="search-result-card__price">
                            {formatINR(deal.price)}
                          </span>
                        </div>
                        <div className="search-result-card__actions">
                          <FilledTonalButton onClick={() => addItem(deal.id)}>
                            Book
                          </FilledTonalButton>
                          <IconButton
                            aria-label={wishlistHas(deal.id) ? 'Remove from wishlist' : 'Save to wishlist'}
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
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ── Grid view ─────────────────────────────────────────────────── */}
        {view === 'grid' && (
          <section aria-label="Search results grid">
            {filtered.length === 0 ? (
              <p className="search-page__empty">{searchContent.noResults}</p>
            ) : (
              <ul className="search-results-grid">
                {filtered.map((deal) => (
                  <li key={deal.id}>
                    <SkyProductCardWC
                      image={deal.image}
                      imageAlt={deal.imageAlt}
                      badge={deal.badge}
                      heading={deal.title}
                      eyebrow={deal.providerName}
                      location={`${deal.duration} ${deal.durationUnit}`}
                      price={formatINR(deal.price)}
                      originalPrice={deal.originalPrice ? formatINR(deal.originalPrice) : undefined}
                      rating={deal.rating}
                      reviews={deal.reviews}
                      favorite={true}
                      favoriteActive={wishlistHas(deal.id)}
                      href={`/deal/${deal.id}`}
                      onFavorite={() => wishlistToggle(deal.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ── Map view ──────────────────────────────────────────────────── */}
        {view === 'map' && (
          <section aria-label="Search results map" className="search-map">
            <div className="search-map__canvas" role="img" aria-label="Map showing deal locations">
              {/* {filtered.map((deal, i) => (
                <button
                  key={deal.id}
                  className="search-map__pin"
                  style={{
                    left: `${15 + (i % 5) * 17}%`,
                    top: `${20 + Math.floor(i / 5) * 28}%`,
                  }}
                  aria-label={`${deal.title} — ${formatINR(deal.price)}`}
                >
                  <span className="search-map__pin-label">
                    {formatINR(Math.round(deal.price / 100) * 100)}
                  </span>
                </button>
              ))} */}
              <Map deals={filtered} />
            </div>
            <div className="search-map__sidebar">
              <p className="search-map__sidebar-count">{filtered.length} results in view</p>
              <ul className="search-map__list">
                {filtered.slice(0, 5).map((deal) => (
                  <li key={deal.id} className="search-map__list-item">
                    <Link to={`/deal/${deal.id}`} className="search-map__list-link">
                      <img src={deal.image} alt={deal.imageAlt} width={64} height={64} loading="lazy" />
                      <span>
                        <strong>{deal.title}</strong>
                        <small>{deal.providerName}</small>
                        <small>{formatINR(deal.price)} · {deal.distance} km</small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </div>

      {/* ── Price Dialog ───────────────────────────────────────────────── */}
      <Dialog
        ref={priceDialogRef as unknown as React.Ref<HTMLElement>}
        onClose={() => setActiveDialog(null)}
      >
        <span slot="headline">Filter by Price</span>
        <div slot="content" className="filter-dialog">
          <p className="filter-dialog__label">Price levels</p>
          <div className="filter-dialog__checks">
            {PRICE_LEVELS.map((level) => (
              <label key={level.value} className="filter-dialog__check-opt">
                <Checkbox
                  checked={selectedPriceLevels.includes(level.value)}
                  onChange={() =>
                    setSelectedPriceLevels((prev) =>
                      prev.includes(level.value)
                        ? prev.filter((x) => x !== level.value)
                        : [...prev, level.value],
                    )
                  }
                />
                <span>{level.label}</span>
              </label>
            ))}
          </div>
          <Divider />
          <p className="filter-dialog__label">
            Price range: {formatINR(priceRange[0])} – {formatINR(priceRange[1])}
          </p>
          <Slider
            min={searchContent.filters.price.min}
            max={searchContent.filters.price.max}
            value={priceRange[1]}
            step={500}
            onInput={(e) =>
              setPriceRange([priceRange[0], (e.target as unknown as { value: number }).value])
            }
          />
        </div>
        <div slot="actions">
          <TextButton onClick={() => { setSelectedPriceLevels([]); setPriceRange([searchContent.filters.price.min, searchContent.filters.price.max]); }}>
            Clear
          </TextButton>
          <FilledButton onClick={() => setActiveDialog(null)}>Apply</FilledButton>
        </div>
      </Dialog>

      {/* ── Category Dialog ────────────────────────────────────────────── */}
      <Dialog
        ref={categoryDialogRef as unknown as React.Ref<HTMLElement>}
        onClose={() => setActiveDialog(null)}
      >
        <span slot="headline">Select Category</span>
        <div slot="content" className="filter-dialog">
          <div role="radiogroup" aria-label="Category" className="filter-dialog__checks">
            <label className="filter-dialog__check-opt">
              <Radio
                name="category"
                value=""
                checked={selectedCategory === ''}
                onChange={() => setSelectedCategory('')}
              />
              <span>All categories</span>
            </label>
            {CATEGORIES.map((cat) => (
              <label key={cat.id} className="filter-dialog__check-opt">
                <Radio
                  name="category"
                  value={cat.slug}
                  checked={selectedCategory === cat.slug}
                  onChange={() => setSelectedCategory(cat.slug)}
                />
                <span>
                  {cat.name}
                  <span className="filter-dialog__count">({cat.serviceCount})</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div slot="actions">
          <TextButton onClick={() => setSelectedCategory('')}>Clear</TextButton>
          <FilledButton onClick={() => setActiveDialog(null)}>Apply</FilledButton>
        </div>
      </Dialog>

      {/* ── Features Dialog ────────────────────────────────────────────── */}
      <Dialog
        ref={featuresDialogRef as unknown as React.Ref<HTMLElement>}
        onClose={() => setActiveDialog(null)}
      >
        <span slot="headline">Filter by Features</span>
        <div slot="content" className="filter-dialog">
          <div role="group" aria-label="Features" className="filter-dialog__checks">
            {searchContent.filters.features.options.map((f) => (
              <label key={f} className="filter-dialog__check-opt">
                <Checkbox
                  checked={selectedFeatures.includes(f)}
                  onChange={() => toggleFeature(f)}
                />
                <span>{f}</span>
              </label>
            ))}
          </div>
        </div>
        <div slot="actions">
          <TextButton onClick={() => setSelectedFeatures([])}>Clear</TextButton>
          <FilledButton onClick={() => setActiveDialog(null)}>Apply</FilledButton>
        </div>
      </Dialog>

      {/* ── Distance Dialog ────────────────────────────────────────────── */}
      <Dialog
        ref={distanceDialogRef as unknown as React.Ref<HTMLElement>}
        onClose={() => setActiveDialog(null)}
      >
        <span slot="headline">Filter by Distance</span>
        <div slot="content" className="filter-dialog">
          <p className="filter-dialog__label">
            Within {distanceMax} km
          </p>
          <Slider
            min={1}
            max={searchContent.filters.distance.max}
            value={distanceMax}
            step={1}
            onInput={(e) =>
              setDistanceMax((e.target as unknown as { value: number }).value)
            }
          />
        </div>
        <div slot="actions">
          <TextButton onClick={() => setDistanceMax(DISTANCE_MAX)}>Clear</TextButton>
          <FilledButton onClick={() => setActiveDialog(null)}>Apply</FilledButton>
        </div>
      </Dialog>
    </div>
  );
}

export default Search;
