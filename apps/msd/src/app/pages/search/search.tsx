import { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
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
  Radio,
  Divider,
} from '@skylabs-monorepo/shared-ui/react';
import { SkyProductCardWC } from '../../components/sky-product-card-wc';
import { DealBookingDialog } from '../../components/deal-booking-dialog';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { addCartItem } from '../../../api/cart';
import {
  listCatalogCategories,
  listCatalogDeals,
  type CatalogCategoryWithChildren,
  type CatalogDeal,
} from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { formatINR, formatBookingSchedule } from '../../../utils/format';
import { resolveDealMedia, primaryImage } from '../../../utils/media';
import content from '../../../content.json';
import './search.css';
import { Map } from '../../components/map';

const { search: searchContent } = content;

type View = 'list' | 'grid' | 'map';
type ActiveDialog = 'price' | 'category' | null;

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
  const { token, isAuthenticated } = useAuth();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>('list');
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  // ── Filter state (mirrors the URL; kept in sync both ways) ─────────────
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [selectedCategory, setSelectedCategory] = useState(params.get('category') ?? '');
  const [suggested, setSuggested] = useState(params.get('sort') === 'discount');
  // Only the upper bound is adjustable (single-thumb slider, matching the
  // real UI below) — the lower bound is never sent to the API since no
  // control ever changes it.
  const [priceMax, setPriceMax] = useState(searchContent.filters.price.max);

  const priceDialogRef = useRef<{ show: () => void; close: () => void } | null>(null);
  const categoryDialogRef = useRef<{ show: () => void; close: () => void } | null>(null);

  useEffect(() => {
    const map: Record<NonNullable<ActiveDialog>, React.MutableRefObject<{ show: () => void; close: () => void } | null>> = {
      price: priceDialogRef,
      category: categoryDialogRef,
    };
    if (activeDialog) {
      map[activeDialog].current?.show();
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

  // ── Deals (real, server-filtered/sorted) ────────────────────────────────
  const [deals, setDeals] = useState<CatalogDeal[]>([]);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [dealsError, setDealsError] = useState('');

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
      pageSize: 100,
    })
      .then(({ data }) => setDeals(data))
      .catch((err) => setDealsError(err instanceof ApiRequestError ? err.message : 'Could not load deals.'))
      .finally(() => setDealsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, selectedCategoryEntry?.id, suggested, priceMax, categoriesLoading]);

  function selectCategory(slug: string) {
    setSelectedCategory(slug);
    updateParams({ category: slug || undefined });
  }

  function toggleSuggested() {
    const next = !suggested;
    setSuggested(next);
    updateParams({ sort: next ? 'discount' : undefined });
  }

  function clearAllFilters() {
    setQuery('');
    setPriceMax(searchContent.filters.price.max);
    setSuggested(false);
    setSelectedCategory('');
    setParams({});
  }

  const hasActiveFilters =
    suggested || selectedCategory !== '' || priceMax < searchContent.filters.price.max;

  const { toggle: wishlistToggle, has: wishlistHas } = useWishlist();

  const requireAuthOrRedirect = () => {
    if (isAuthenticated) return true;
    navigate(`/sign-in?next=${encodeURIComponent('/explore')}`);
    return false;
  };

  const addToCart = async (deal: CatalogDeal) => {
    if (!requireAuthOrRedirect()) return;
    setActionError('');
    setActionMessage('');
    try {
      await addCartItem(token, deal.id, 1);
      setActionMessage(`Added "${deal.product?.name ?? deal.title}" to your cart.`);
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : 'Could not add to cart.');
    }
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
            aria-label="Search deals"
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
              label={priceMax < searchContent.filters.price.max
                ? `Price (up to ${formatINR(priceMax)})`
                : searchContent.filters.price.label}
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
          {dealsLoading ? '…' : `${deals.length} ${searchContent.resultLabel}`}
        </p>

        {actionMessage && <p className="field-hint" role="status">{actionMessage}</p>}
        {actionError && <p className="error-state" role="alert">{actionError}</p>}

        {dealsLoading ? (
          <p className="loading-state">Loading deals…</p>
        ) : dealsError ? (
          <p className="error-state" role="alert">{dealsError}</p>
        ) : deals.length === 0 ? (
          <p className="search-page__empty">{searchContent.noResults}</p>
        ) : (
          <>
            {/* ── List view ───────────────────────────────────────────── */}
            {view === 'list' && (
              <section aria-label="Search results list">
                <ul className="search-results-list">
                  {deals.map((deal) => {
                    const heading = deal.service?.name ?? deal.product?.name ?? deal.title;
                    const image = primaryImage(resolveDealMedia(deal));
                    const imageAlt = deal.service?.imageAlt ?? deal.product?.imageAlt ?? heading;
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
                              {deal.service ? (
                                <DealBookingDialog
                                  deal={deal}
                                  onBooked={(booking, intent) =>
                                    setActionMessage(
                                      intent === 'cart'
                                        ? `Added "${deal.service?.name ?? deal.title}" to your cart.`
                                        : `Booked "${deal.service?.name ?? deal.title}" — ${formatBookingSchedule(booking.bookingDate, booking.timeSlot)}.`,
                                    )
                                  }
                                  renderTrigger={(open) => (
                                    <FilledTonalButton
                                      onClick={() => {
                                        if (requireAuthOrRedirect()) open();
                                      }}
                                    >
                                      Book
                                    </FilledTonalButton>
                                  )}
                                />
                              ) : (
                                <FilledTonalButton onClick={() => addToCart(deal)}>
                                  Add to Cart
                                </FilledTonalButton>
                              )}
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
                    );
                  })}
                </ul>
              </section>
            )}

            {/* ── Grid view ───────────────────────────────────────────── */}
            {view === 'grid' && (
              <section aria-label="Search results grid">
                <ul className="search-results-grid">
                  {deals.map((deal) => (
                    <li key={deal.id}>
                      <SkyProductCardWC
                        image={primaryImage(resolveDealMedia(deal))}
                        imageAlt={deal.service?.imageAlt ?? deal.product?.imageAlt ?? undefined}
                        badge={deal.service ? 'Service' : 'Product'}
                        heading={deal.service?.name ?? deal.product?.name ?? deal.title}
                        eyebrow={[deal.vendor?.businessName, deal.branch?.name].filter(Boolean).join(' · ')}
                        eyebrowHref={deal.vendor?.slug ? `/vendor/${deal.vendor.slug}` : undefined}
                        priceNote={deal.durationMinutes ? `${deal.durationMinutes} min` : undefined}
                        price={formatINR(Number(deal.salePrice))}
                        originalPrice={
                          deal.originalPrice && Number(deal.originalPrice) !== Number(deal.salePrice)
                            ? formatINR(Number(deal.originalPrice))
                            : undefined
                        }
                        favorite={true}
                        favoriteActive={wishlistHas(deal.id)}
                        href={deal.service ? `/deal/${deal.id}` : `/products/${deal.id}`}
                        onFavorite={() => wishlistToggle(deal.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* ── Map view ────────────────────────────────────────────── */}
            {view === 'map' && (
              <section aria-label="Search results map" className="search-map">
                {mappableDeals.length === 0 ? (
                  <p className="search-page__empty">{searchContent.noResults}</p>
                ) : (
                  <>
                    <div className="search-map__canvas" role="img" aria-label="Map showing deal locations">
                      <Map deals={mappableDeals} />
                    </div>
                    <div className="search-map__sidebar">
                      <p className="search-map__sidebar-count">{mappableDeals.length} results in view</p>
                      <ul className="search-map__list">
                        {dealsWithCoords
                          .slice(0, 5)
                          .map((deal) => {
                            const heading = deal.service?.name ?? deal.product?.name ?? deal.title;
                            const image = primaryImage(resolveDealMedia(deal));
                            const imageAlt = deal.service?.imageAlt ?? deal.product?.imageAlt ?? heading;
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
        ref={priceDialogRef as unknown as React.Ref<HTMLElement>}
        onClose={() => setActiveDialog(null)}
      >
        <span slot="headline">Filter by Price</span>
        <div slot="content" className="filter-dialog">
          <p className="filter-dialog__label">
            Price up to: {formatINR(priceMax)}
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
                onChange={() => selectCategory('')}
              />
              <span>All categories</span>
            </label>
            {categoriesLoading ? (
              <p className="loading-state">Loading categories…</p>
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
          <Link to="/categories" className="field-hint">Browse all categories →</Link>
        </div>
        <div slot="actions">
          <TextButton onClick={() => selectCategory('')}>Clear</TextButton>
          <FilledButton onClick={() => setActiveDialog(null)}>Apply</FilledButton>
        </div>
      </Dialog>
    </div>
  );
}

export default Search;
