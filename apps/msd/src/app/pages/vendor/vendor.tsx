import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FilledButton,OutlinedButton, OutlinedIconButton, Icon, Divider, Radio, ChipSet, FilterChip, SuggestionChip, Tabs, PrimaryTab, OutlinedTextField, } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getCatalogVendor, listCatalogDeals, type CatalogVendorDetail, type CatalogVendorBranch, type CatalogDeal, } from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { addCartItem } from '../../../api/cart';
import { createBooking } from '../../../api/bookings';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { SkyProductCardWC } from '../../components/sky-product-card-wc';
import { Breadcrumb } from '../../components/breadcrumb';
import { DurationPackageSelector } from '../../components/duration-package-selector';
import { TherapistPackageSelector } from '../../components/therapist-package-selector';
import { useDealPurchaseSelection } from '../../../hooks/use-deal-purchase-selection';
import { useTherapistPurchaseSelection } from '../../../hooks/use-therapist-purchase-selection';
import { formatINR, pluralize } from '../../../utils/format';
import { resolveDealMedia, resolveTherapistMedia, primaryImage } from '../../../utils/media';
import { useToast } from '../../../toast/toast-context';
import './vendor.css';
import content from '../../../content.json';

const vendorContent = content.vendor;
const SITE_URL: string = (import.meta.env['VITE_SITE_URL'] as string | undefined) ?? '';
const TIME_SLOTS = content.category.timeSlots;

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_LABELS = vendorContent.days;

/** Builds schema.org `OpeningHoursSpecification` entries from `Branch.openingHours`
 *  (`{ mon: "09:00-20:00", sun: "closed", ... }`) — skips closed/unset days. */
function buildOpeningHoursSpecification(hours: Record<string, string>) {
  return DAY_ORDER
    .filter((day) => hours[day] && hours[day] !== 'closed')
    .map((day) => {
      const [opens, closes] = hours[day].split('-');
      return {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: `https://schema.org/${DAY_LABELS[day]}`,
        opens,
        closes,
      };
    });
}

// ── Deal grouping: Category → Sub-category → one Deal per Service ─────────────
//
// Each Service now maps to exactly ONE Deal (DealPackage is the child table holding every
// duration/price option — see DealPackage's schema doc comment in msd-api; the old
// sibling-Deal-rows-per-duration pattern no longer exists). This grouping exists purely to build
// Category/Sub-category section headers for display.

interface ServiceGroup {
  id: string;
  name: string;
  deal: CatalogDeal;
}

interface SubcategoryGroup {
  name: string | null;
  services: ServiceGroup[];
}

interface CategoryGroup {
  name: string;
  subcategories: SubcategoryGroup[];
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  const existing = map.get(key);
  if (existing) return existing;
  const created = create();
  map.set(key, created);
  return created;
}

function groupServiceDeals(deals: CatalogDeal[]): CategoryGroup[] {
  const categories = new Map<string, Map<string, Map<string, ServiceGroup>>>();
  for (const deal of deals) {
    if (!deal.service) continue;
    const service = deal.service;
    const categoryName = deal.category?.name ?? 'Other Services';
    const subKey = deal.subcategory?.name ?? '';
    const subMap = getOrCreate(categories, categoryName, () => new Map());
    const serviceMap = getOrCreate(subMap, subKey, () => new Map());
    // One Deal per Service — if a stray duplicate somehow exists, the first wins.
    getOrCreate(serviceMap, service.id, () => ({ id: service.id, name: service.name, deal }));
  }
  return Array.from(categories.entries()).map(([name, subMap]) => ({
    name,
    subcategories: Array.from(subMap.entries()).map(([subKey, serviceMap]) => ({
      name: subKey === '' ? null : subKey,
      services: Array.from(serviceMap.values()),
    })),
  }));
}

/** Cheapest active package's price, for a listing card's "From ₹X" line — falls back to the
 *  Deal's own synced salePrice when it has no packages yet (a legacy/safety-net deal). */
function dealFromPrice(deal: CatalogDeal): number {
  if (deal.packages.length === 0) return Number(deal.salePrice);
  return Math.min(...deal.packages.map((p) => Number(p.sellingPrice)));
}

function therapistFromPrice(therapist: CatalogVendorTherapist): number | null {
  if (therapist.packages.length === 0) return null;
  return Math.min(...therapist.packages.map((p) => Number(p.sellingPrice)));
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function VendorPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { has: isWishlisted, toggle: toggleWishlist, isPending: wishlistPending } = useWishlist();
  const { showToast } = useToast();

  const [vendor, setVendor] = useState<CatalogVendorDetail | null>(null);
  const [vendorLoading, setVendorLoading] = useState(true);
  const [vendorError, setVendorError] = useState('');

  const [branchIndex, setBranchIndex] = useState(0);

  const [serviceDeals, setServiceDeals] = useState<CatalogDeal[]>([]);
  const [productDeals, setProductDeals] = useState<CatalogDeal[]>([]);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [dealsError, setDealsError] = useState('');

  const [activeCategoryName, setActiveCategoryName] = useState('all');
  // Exactly one of these is ever set — selecting a Deal clears the Therapist selection and vice
  // versa (same "one selection, one side panel" flow for both — see #8 of this app's UX rules).
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [selectedTherapistCardId, setSelectedTherapistCardId] = useState<string | null>(null);

  const [productActionMessage, setProductActionMessage] = useState('');
  const [productActionError, setProductActionError] = useState('');

  const { token } = useAuth();

  // ── Fetch vendor by slug ─────────────────────────────────────────────────
  useEffect(() => {
    setVendorLoading(true);
    setVendorError('');
    setVendor(null);
    setBranchIndex(0);
    getCatalogVendor(slug)
      .then(({ data }) => setVendor(data))
      .catch((err) => {
        // A 404 here just means "unknown/inactive vendor slug" — render as not-found, not an error banner.
        if (err instanceof ApiRequestError && err.status === 404) {
          setVendor(null);
        } else {
          setVendorError(err instanceof ApiRequestError ? err.message : vendorContent.errors.loadVendor);
        }
      })
      .finally(() => setVendorLoading(false));
  }, [slug]);

  const selectedBranch: CatalogVendorBranch | null = vendor?.branches[branchIndex] ?? vendor?.branches[0] ?? null;

  const resetSelection = () => {
    setActiveCategoryName('all');
    setSelectedServiceId(null);
    setSelectedTherapistCardId(null);
    setProductActionError('');
    setProductActionMessage('');
  };

  const handleBranchSelect = (index: number) => {
    setBranchIndex(index);
    resetSelection();
  };

  // ── Fetch services + products for the selected branch ───────────────────
  useEffect(() => {
    if (!vendor || !selectedBranch) return;
    setDealsLoading(true);
    setDealsError('');
    Promise.all([
      listCatalogDeals({ vendorId: vendor.id, branchId: selectedBranch.id, type: 'service', pageSize: 100 }),
      listCatalogDeals({ vendorId: vendor.id, branchId: selectedBranch.id, type: 'product', pageSize: 100 }),
    ])
      .then(([services, products]) => {
        setServiceDeals(services.data);
        setProductDeals(products.data);
      })
      .catch((err) => setDealsError(err instanceof ApiRequestError ? err.message : vendorContent.errors.loadServicesProducts))
      .finally(() => setDealsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendor, selectedBranch?.id]);

  const categoryGroups = useMemo(() => groupServiceDeals(serviceDeals), [serviceDeals]);
  const categoryNames = useMemo(() => categoryGroups.map((c) => c.name), [categoryGroups]);
  const displayedCategoryGroups = activeCategoryName === 'all'
    ? categoryGroups
    : categoryGroups.filter((c) => c.name === activeCategoryName);
  const allServiceGroups = useMemo(
    () => categoryGroups.flatMap((c) => c.subcategories.flatMap((s) => s.services)),
    [categoryGroups],
  );

  const activeGroup = allServiceGroups.find((g) => g.id === selectedServiceId) ?? null;
  const activeTherapist = selectedBranch?.therapists.find((t) => t.id === selectedTherapistCardId) ?? null;

  const handleCategoryFilter = (name: string) => {
    setActiveCategoryName(name);
    setSelectedServiceId(null);
  };

  const handleServiceSelect = (group: ServiceGroup) => {
    setSelectedServiceId(group.id);
    setSelectedTherapistCardId(null);
  };

  const handleTherapistSelect = (therapistId: string) => {
    setSelectedTherapistCardId(therapistId);
    setSelectedServiceId(null);
  };

  const requireAuthOrRedirect = () => {
    if (isAuthenticated) return true;
    navigate(`/sign-in?next=${encodeURIComponent(`/vendor/${slug}`)}`);
    return false;
  };

  const toggleFavorite = (deal: CatalogDeal) => {
    if (!requireAuthOrRedirect()) return;
    void toggleWishlist(deal.id);
  };

  const addProductToCart = async (deal: CatalogDeal) => {
    if (!requireAuthOrRedirect()) return;
    setProductActionError('');
    setProductActionMessage('');
    try {
      await addCartItem(token, deal.id, 1);
      const name = deal.product?.name ?? deal.title;
      setProductActionMessage(`Added "${name}" to your cart.`);
      showToast(`Added to cart\n${name}`);
    } catch (err) {
      const message = err instanceof ApiRequestError ? err.message : 'Unable to add item to cart.';
      setProductActionError(message);
      showToast(message, 'error');
    }
  };

  if (vendorLoading) {
    return <p className="loading-state"> {vendorContent.loading.vendor}</p>;
  }

  if (vendorError || !vendor) {
    return (
      <div className="vendor-page vendor-page--empty">
        <title>{vendorContent.notFound.metaTitle}</title>
        <sky-info-card
          icon="search_off"
          heading={vendorContent.notFound.heading}
          subheading={vendorError || vendorContent.notFound.subheading}
        />
        <FilledButton onClick={() => navigate('/explore')}> {vendorContent.notFound.cta}</FilledButton>
      </div>
    );
  }

  const canonicalUrl = `${SITE_URL}/vendor/${vendor.slug}`;
  const metaDescription = vendor.businessDescription
    ?? `Book services at ${vendor.businessName}${vendor.city ? `, ${vendor.city}` : ''}.`;

  return (
    <div id="main-content" className="vendor-page">
      <title>{`${vendor.businessName} | MSD`}</title>
      <meta name="description" content={metaDescription} />
      <link rel="canonical" href={canonicalUrl} />
      <meta property="og:type" content="business.business" />
      <meta property="og:title" content={`${vendor.businessName} | MSD`} />
      <meta property="og:description" content={metaDescription} />
      {vendor.logoUrl && <meta property="og:image" content={vendor.logoUrl} />}
      <meta property="og:url" content={canonicalUrl} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={`${vendor.businessName} | MSD`} />
      <meta name="twitter:description" content={metaDescription.slice(0, 155)} />
      {vendor.logoUrl && <meta name="twitter:image" content={vendor.logoUrl} />}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'LocalBusiness',
            name: vendor.businessName,
            description: vendor.businessDescription ?? undefined,
            image: vendor.logoUrl ?? undefined,
            url: canonicalUrl,
            address: {
              '@type': 'PostalAddress',
              streetAddress: selectedBranch?.address ?? vendor.address ?? undefined,
              addressLocality: selectedBranch?.city ?? vendor.city ?? undefined,
              addressRegion: selectedBranch?.state ?? vendor.state ?? undefined,
              addressCountry: 'IN',
            },
            openingHoursSpecification: selectedBranch?.openingHours
              ? buildOpeningHoursSpecification(selectedBranch.openingHours)
              : undefined,
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
              { '@type': 'ListItem', position: 2, name: 'Explore', item: `${SITE_URL}/explore` },
              { '@type': 'ListItem', position: 3, name: vendor.businessName, item: canonicalUrl },
            ],
          }),
        }}
      />

      {/* Breadcrumb */}
      <Breadcrumb
        className="vendor-page__breadcrumb"
        items={[
          { label: vendorContent.breadcrumb.home, to: '/' },
          { label: vendorContent.breadcrumb.explore, to: '/explore' },
          { label: vendor.businessName },
        ]}
      />

      {/* Hero — full-bleed background image, gradient fallback when no logo */}
      <div className={`vendor-page__hero${vendor.logoUrl ? '' : ' vendor-page__hero--placeholder'}`} aria-hidden="true">
        {vendor.logoUrl && <img src={vendor.logoUrl} alt="" />}
      </div>

      {/* Two-panel body overlapping the hero */}
      <div className="vendor-page__body">

        {/* ── Left: main content card ──────────────────────────────────────── */}
        <div className="vendor-page__main-card">

          {/* Company header */}
          <div className="vendor-page__company-row">
            <div className="vendor-page__company-info">
              <h1 className="vendor-page__company-name">{vendor.businessName}</h1>
              {vendor.businessDescription && (
                <p className="vendor-page__company-tagline">{vendor.businessDescription}</p>
              )}
              <div className="vendor-page__company-meta">
                {(selectedBranch?.address || selectedBranch?.city || vendor.city) && (
                  <span className="vendor-page__location-row">
                    <Icon aria-hidden="true" className="vendor-page__meta-icon">location_on</Icon>
                    {[selectedBranch?.address, selectedBranch?.city ?? vendor.city, selectedBranch?.state ?? vendor.state]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                )}
              </div>
            </div>
            {vendor.logoUrl && (
              <img
                className="vendor-page__company-img"
                src={vendor.logoUrl}
                alt={`${vendor.businessName} logo`}
                loading="eager"
              />
            )}
          </div>

          {/* Branch selector — only when there's a real choice to make */}
          {vendor.branches.length > 1 && (
            <div className="vendor-page__branch-tabs-wrap">
              <Tabs
                className="vendor-page__branch-tabs"
                onChange={(e) => handleBranchSelect((e.target as unknown as { activeTabIndex: number }).activeTabIndex)}
              >
                {vendor.branches.map((b, i) => (
                  <PrimaryTab key={b.id} active={i === branchIndex}>{b.name}</PrimaryTab>
                ))}
              </Tabs>
            </div>
          )}

          {/* Opening hours */}
          {selectedBranch?.openingHours && (
            <div className="vendor-page__hours-section">
              <h2 className="vendor-page__hours-title">{vendorContent.labels.workingHours}</h2>
              <div className="vendor-page__hours-grid">
                {DAY_ORDER.map((day) => {
                  const raw = selectedBranch.openingHours?.[day];
                  const closed = !raw || raw === 'closed';
                  return (
                    <div key={day} className="vendor-page__hours-row">
                      <span className="vendor-page__hours-day">{DAY_LABELS[day]}</span>
                      <span className="vendor-page__hours-time">
                        {closed ? vendorContent.labels.closed : raw.replace('-', ' – ')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <Divider />

          {/* Select Service */}
          <section className="vendor-page__section" aria-label={vendorContent.accessibility.services}>
            <h2 className="vendor-page__section-title"> {vendorContent.labels.selectService}</h2>

            {categoryNames.length > 1 && (
              <ChipSet aria-label={vendorContent.filters.filterByServiceCategory}>
                <FilterChip
                  label={vendorContent.filters.all}
                  selected={activeCategoryName === 'all'}
                  onClick={() => handleCategoryFilter('all')}
                />
                {categoryNames.map((name) => (
                  <FilterChip
                    key={name}
                    label={name}
                    selected={activeCategoryName === name}
                    onClick={() => handleCategoryFilter(name)}
                  />
                ))}
              </ChipSet>
            )}

            {dealsLoading ? (
              <p className="loading-state">{vendorContent.loading.services}</p>
            ) : dealsError ? (
              <p className="error-state" role="alert">{dealsError}</p>
            ) : displayedCategoryGroups.length === 0 ? (
              <p className="vendor-page__deal-empty"> {vendorContent.empty.noServices}</p>
            ) : (
              <div className="vendor-page__deal-groups">
                {displayedCategoryGroups.map((cat) => {
                  const CategoryHeading = categoryNames.length > 1 ? 'h3' : null;
                  const SubHeading = CategoryHeading ? 'h4' : 'h3';
                  return (
                    <div key={cat.name} className="vendor-page__category-group">
                      {CategoryHeading && (
                        <CategoryHeading className="vendor-page__category-heading">{cat.name}</CategoryHeading>
                      )}
                      {cat.subcategories.map((sub) => (
                        <div key={sub.name ?? '__none__'} className="vendor-page__subcategory-group">
                          {sub.name && (
                            <SubHeading className="vendor-page__subcategory-heading">{sub.name}</SubHeading>
                          )}
                          <div
                            className="vendor-page__deal-list"
                            role="radiogroup"
                            aria-label={`${sub.name ?? cat.name} services`}
                          >
                            {sub.services.map((group) => {
                              const isSelected = group.id === selectedServiceId;
                              const deal = group.deal;
                              const fromPrice = dealFromPrice(deal);
                              const thumb = primaryImage(resolveDealMedia(deal));
                              return (
                                <label
                                  key={group.id}
                                  htmlFor={`deal-${group.id}`}
                                  className={`vendor-page__deal-card${isSelected ? ' vendor-page__deal-card--selected' : ''}`}
                                >
                                  <Radio
                                    id={`deal-${group.id}`}
                                    name="deal-selection"
                                    value={group.id}
                                    checked={isSelected}
                                    onChange={() => handleServiceSelect(group)}
                                  />

                                  {thumb && (
                                    <img
                                      className="vendor-page__deal-card-img"
                                      src={thumb}
                                      alt={deal.service?.imageAlt ?? ''}
                                      loading="lazy"
                                      width={120}
                                      height={80}
                                    />
                                  )}

                                  <div className="vendor-page__deal-card-body">
                                    <div className="vendor-page__deal-card-title">{group.name}</div>
                                    {deal.shortDescription && (
                                      <div className="vendor-page__deal-card-desc">{deal.shortDescription}</div>
                                    )}
                                    <div className="vendor-page__deal-card-meta">
                                      <ChipSet>
                                        {deal.packages.length > 1 && (
                                          <SuggestionChip label={`${deal.packages.length} packages`} />
                                        )}
                                      </ChipSet>
                                      <span className="vendor-page__deal-price">From {formatINR(fromPrice)}</span>
                                    </div>
                                  </div>
                                  <span
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                  >
                                    <OutlinedIconButton
                                      aria-label={isWishlisted(deal.id) ? 'Remove from wishlist' : 'Save to wishlist'}
                                      aria-pressed={isWishlisted(deal.id)}
                                      disabled={wishlistPending(deal.id)}
                                      onClick={() => toggleFavorite(deal)}
                                    >
                                      <Icon aria-hidden="true">{isWishlisted(deal.id) ? 'favorite' : 'favorite_border'}</Icon>
                                    </OutlinedIconButton>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <Divider />

          {/* Products */}
          <section className="vendor-page__section" aria-label={vendorContent.accessibility.products}>
            <h2 className="vendor-page__section-title">Products</h2>
            {productActionMessage && <p className="field-hint" role="status">{productActionMessage}</p>}
            {productActionError && <p className="error-state" role="alert">{productActionError}</p>}
            {dealsLoading ? (
              <p className="loading-state">{vendorContent.loading.products}</p>
            ) : productDeals.length === 0 ? (
              <p className="vendor-page__deal-empty">{vendorContent.empty.noProducts}</p>
            ) : (
              <ul className="vendor-page__product-grid">
                {productDeals.map((deal) => (
                  <li key={deal.id}>
                    <SkyProductCardWC
                      variant="outlined"
                      badge={vendorContent.labels.products}
                      eyebrow={deal.product?.brand ?? undefined}
                      heading={deal.product?.name ?? deal.title}
                      image={primaryImage(resolveDealMedia(deal))}
                      imageAlt={deal.product?.imageAlt ?? undefined}
                      price={formatINR(Number(deal.salePrice))}
                      originalPrice={
                        deal.originalPrice && Number(deal.originalPrice) !== Number(deal.salePrice)
                          ? formatINR(Number(deal.originalPrice))
                          : undefined
                      }
                      discount={deal.discountPercent ? `-${deal.discountPercent}%` : undefined}
                      href={`/products/${deal.id}`}
                      favorite
                      favoriteActive={isWishlisted(deal.id)}
                      onFavorite={() => toggleFavorite(deal)}
                    >
                      <div onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}>
                        <FilledButton onClick={() => addProductToCart(deal)}>
                          <Icon slot="icon" aria-hidden="true">shopping_bag</Icon>
                          {vendorContent.actions.addToCart}
                        </FilledButton>
                      </div>
                    </SkyProductCardWC>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Divider />

          {/* Therapists */}
          <section className="vendor-page__section" aria-label={vendorContent.accessibility.therapists}>
            <h2 className="vendor-page__section-title">Meet Our Therapists</h2>
            {selectedBranch && selectedBranch.therapists.length > 0 ? (
              <div className="vendor-page__deal-list" role="radiogroup" aria-label="Available therapists">
                {selectedBranch.therapists.map((t) => {
                  const isSelected = t.id === selectedTherapistCardId;
                  const fromPrice = therapistFromPrice(t);
                  return (
                    <label
                      key={t.id}
                      htmlFor={`therapist-${t.id}`}
                      className={`vendor-page__deal-card${isSelected ? ' vendor-page__deal-card--selected' : ''}`}
                    >
                      <Radio
                        id={`therapist-${t.id}`}
                        name="therapist-selection"
                        value={t.id}
                        checked={isSelected}
                        onChange={() => handleTherapistSelect(t.id)}
                      />

                      {primaryImage(resolveTherapistMedia(t)) && (
                        <img
                          className="vendor-page__deal-card-img"
                          src={primaryImage(resolveTherapistMedia(t))}
                          alt=""
                          loading="lazy"
                          width={120}
                          height={80}
                        />
                      )}

                      <div className="vendor-page__deal-card-body">
                        {/* Type/service label and the actual staff member are always shown
                            separately, never merged into one field. */}
                        <div className="vendor-page__deal-card-title">{t.therapistType}</div>
                        <div className="vendor-page__deal-card-desc">
                          {t.personName}
                          {t.specialization ? ` · ${t.specialization}` : ''}
                          {t.experienceYears != null ? ` · ${t.experienceYears} ${pluralize(t.experienceYears, 'year')} experience` : ''}
                        </div>
                        <div className="vendor-page__deal-card-meta">
                          <ChipSet>
                            {t.packages.length > 1 && (
                              <SuggestionChip label={`${t.packages.length} packages`} />
                            )}
                          </ChipSet>
                          <span className="vendor-page__deal-price">
                            {fromPrice != null ? `From ${formatINR(fromPrice)}` : 'Contact for pricing'}
                          </span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="vendor-page__deal-empty">{vendorContent.empty.noTherapists}</p>
            )}
          </section>
        </div>

        {/* ── Right: Your selection card ───────────────────────────────────── */}
        <aside className="vendor-page__selection-card" aria-label={vendorContent.accessibility.yourSelection}>
          <h2 className="vendor-page__selection-title"> {vendorContent.labels.yourSelection}</h2>

          {activeGroup ? (
            <DealSelectionPanel
              key={activeGroup.id}
              group={activeGroup}
              requireAuthOrRedirect={requireAuthOrRedirect}
            />
          ) : activeTherapist ? (
            <TherapistSelectionPanel
              key={activeTherapist.id}
              therapist={activeTherapist}
              requireAuthOrRedirect={requireAuthOrRedirect}
            />
          ) : (
            <div className="vendor-page__selection-empty">
              <Icon aria-hidden="true" className="vendor-page__empty-icon">spa</Icon>
              <p>Select a service or therapist to see packages and pricing.</p>
            </div>
          )}
        </aside>

      </div>
    </div>
  );
}

/**
 * The stateful "package/price → Book Now" panel for one selected Deal — driven entirely by the
 * canonical `useDealPurchaseSelection` hook + `DurationPackageSelector` UI (the same ones every
 * other purchase entry point uses), keyed by `group.id` in the parent so switching services
 * fully resets this panel's local state. Never asks for a date/time — this is a service
 * purchase, not an appointment-scheduling system (see Booking's schema doc comment in msd-api).
 * There is deliberately no in-flow "select a therapist" cross-selection — a Therapist is only
 * ever selected by clicking its own card (see `TherapistSelectionPanel` below).
 */
function DealSelectionPanel({
  group,
  requireAuthOrRedirect,
}: {
  group: ServiceGroup;
  requireAuthOrRedirect: () => boolean;
}) {
  const { token } = useAuth();
  const { showToast } = useToast();
  const selection = useDealPurchaseSelection(group.deal);
  const { activePackage, unitPrice, missingSelection } = selection;

  const [qty, setQty] = useState(1);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  const total = activePackage ? unitPrice * qty : 0;

  const submitBooking = async (intent: 'book' | 'cart') => {
    if (!requireAuthOrRedirect()) return;
    if (missingSelection) {
      setActionError(missingSelection);
      setActionMessage('');
      return;
    }
    setActionError('');
    setActionMessage('');
    setBookingSubmitting(true);
    try {
      await createBooking(token, {
        dealId: group.deal.id,
        quantity: qty,
        ...(activePackage ? { dealPackageId: activePackage.id } : {}),
      });
      const durationLabel = activePackage ? ` — ${activePackage.durationMinutes} Minutes` : '';
      setActionMessage(
        intent === 'cart'
          ? `Added "${group.name}" to your cart.`
          : `Booked "${group.name}"${activePackage ? ` — ${activePackage.durationMinutes} min` : ''}.`,
      );
      // Only fires after the API call above has actually resolved — never claims success early.
      showToast(intent === 'cart' ? `Added to cart\n${group.name}${durationLabel}` : `Booked\n${group.name}${durationLabel}`);
    } catch (err) {
      const message = err instanceof ApiRequestError ? err.message : 'Unable to add item to cart.';
      setActionError(message);
      showToast(message, 'error');
    } finally {
      setBookingSubmitting(false);
    }
  };

  return (
    <>
      {/* Selected deal preview */}
      <div className="vendor-page__selected-deal">
        {primaryImage(resolveDealMedia(group.deal)) && (
          <img
            className="vendor-page__selected-thumb"
            src={primaryImage(resolveDealMedia(group.deal))}
            alt=""
            loading="lazy"
            width={52}
            height={52}
          />
        )}
        <div className="vendor-page__selected-info">
          <div className="vendor-page__selected-name">{group.name}</div>
        </div>
      </div>

      <Divider />

      <DurationPackageSelector selection={selection} />

      <Divider />

      {/* Quantity */}
      <div className="vendor-page__stepper-row" role="group" aria-label="Quantity">
        <span className="vendor-page__stepper-label">Quantity</span>
        <div className="vendor-page__stepper-controls">
          <OutlinedIconButton
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            aria-label="Decrease quantity"
            disabled={qty === 1}
          >
            <Icon aria-hidden="true">remove</Icon>
          </OutlinedIconButton>
          <span className="vendor-page__qty" aria-live="polite" aria-atomic="true">
            {qty}
          </span>
          <OutlinedIconButton
            onClick={() => setQty((q) => q + 1)}
            aria-label="Increase quantity"
          >
            <Icon aria-hidden="true">add</Icon>
          </OutlinedIconButton>
        </div>
      </div>

      {/* Total */}
      <div className="vendor-page__total-row">
        <span>Total</span>
        <strong className="vendor-page__total-amount">{formatINR(total)}</strong>
      </div>

      {missingSelection && <p className="field-hint" role="status">{missingSelection}</p>}
      {actionError && <p className="error-state" role="alert">{actionError}</p>}
      {actionMessage && <p className="field-hint" role="status">{actionMessage}</p>}

      {/* CTA */}
      <div className="vendor-page__cta-row">
        <OutlinedButton
          onClick={() => submitBooking('cart')}
          disabled={bookingSubmitting || !!missingSelection}
          aria-label={`Add ${group.name} to cart — ${formatINR(total)}`}
        >
          <Icon slot="icon" aria-hidden="true">shopping_bag</Icon>
          {bookingSubmitting ? 'Adding…' : 'Add to Cart'}
        </OutlinedButton>
        <FilledButton
          className="vendor-page__book-btn"
          onClick={() => submitBooking('book')}
          disabled={bookingSubmitting || !!missingSelection}
          aria-label={`Book ${group.name} — ${formatINR(total)}`}
        >
          <Icon slot="icon" aria-hidden="true">calendar_month</Icon>
          {bookingSubmitting ? 'Booking…' : 'Book Now'}
        </FilledButton>
      </div>

      {/* Details accordion — only what the API actually returns, nothing fabricated */}
      {(group.deal.shortDescription || group.deal.description) && (
        <>
          <Divider />
          {group.deal.shortDescription && (
            <p className="vendor-page__service-tagline">{group.deal.shortDescription}</p>
          )}
          {group.deal.description && (
            <sky-accordion>
              <sky-accordion-item header="Details" open>
                <p className="vendor-page__accordion-text">{group.deal.description}</p>
              </sky-accordion-item>
            </sky-accordion>
          )}
        </>
      )}
    </>
  );
}

/**
 * The stateful "package/price → Book Now" panel for one selected Therapist, booked directly —
 * no Deal involved at all (see msd-api's Booking "exactly one of dealId/therapistId" doc
 * comment). Mirrors `DealSelectionPanel` exactly (same layout, same CTA row, same "never asks
 * for a date/time") but sources its packages from the Therapist's own `packages`, via the same
 * `useTherapistPurchaseSelection`/`TherapistPackageSelector` pair every other Therapist purchase
 * entry point uses.
 */
function TherapistSelectionPanel({
  therapist,
  requireAuthOrRedirect,
}: {
  therapist: CatalogVendorTherapist;
  requireAuthOrRedirect: () => boolean;
}) {
  const { token } = useAuth();
  const { showToast } = useToast();
  const selection = useTherapistPurchaseSelection(therapist.packages);
  const { activePackage, unitPrice, missingSelection } = selection;

  const [qty, setQty] = useState(1);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  const displayName = `${therapist.therapistType} — ${therapist.personName}`;
  const total = activePackage ? unitPrice * qty : 0;

  const submitBooking = async (intent: 'book' | 'cart') => {
    if (!requireAuthOrRedirect()) return;
    if (missingSelection || !activePackage) {
      setActionError(missingSelection ?? 'Select a package.');
      setActionMessage('');
      return;
    }
    setActionError('');
    setActionMessage('');
    setBookingSubmitting(true);
    try {
      await createBooking(token, {
        therapistId: therapist.id,
        durationMinutes: activePackage.durationMinutes,
        quantity: qty,
      });
      setActionMessage(
        intent === 'cart'
          ? `Added "${displayName}" to your cart.`
          : `Booked "${displayName}" — ${activePackage.durationMinutes} min.`,
      );
      // Only fires after the API call above has actually resolved — never claims success early.
      const label = `${therapist.personName} — ${activePackage.durationMinutes} Minutes`;
      showToast(intent === 'cart' ? `Added to cart\n${label}` : `Booked\n${label}`);
    } catch (err) {
      const message = err instanceof ApiRequestError ? err.message : 'Unable to add item to cart.';
      setActionError(message);
      showToast(message, 'error');
    } finally {
      setBookingSubmitting(false);
    }
  };

  return (
    <>
      {/* Selected therapist preview */}
      <div className="vendor-page__selected-deal">
        {primaryImage(resolveTherapistMedia(therapist)) && (
          <img
            className="vendor-page__selected-thumb"
            src={primaryImage(resolveTherapistMedia(therapist))}
            alt=""
            loading="lazy"
            width={52}
            height={52}
          />
        )}
        <div className="vendor-page__selected-info">
          <div className="vendor-page__selected-name">{displayName}</div>
        </div>
      </div>

      <Divider />

      <TherapistPackageSelector selection={selection} />

      <Divider />

      {/* Quantity */}
      <div className="vendor-page__stepper-row" role="group" aria-label="Quantity">
        <span className="vendor-page__stepper-label">Quantity</span>
        <div className="vendor-page__stepper-controls">
          <OutlinedIconButton
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            aria-label="Decrease quantity"
            disabled={qty === 1}
          >
            <Icon aria-hidden="true">remove</Icon>
          </OutlinedIconButton>
          <span className="vendor-page__qty" aria-live="polite" aria-atomic="true">
            {qty}
          </span>
          <OutlinedIconButton
            onClick={() => setQty((q) => q + 1)}
            aria-label="Increase quantity"
          >
            <Icon aria-hidden="true">add</Icon>
          </OutlinedIconButton>
        </div>
      </div>

      {/* Total */}
      <div className="vendor-page__total-row">
        <span>Total</span>
        <strong className="vendor-page__total-amount">{formatINR(total)}</strong>
      </div>

      {missingSelection && <p className="field-hint" role="status">{missingSelection}</p>}
      {actionError && <p className="error-state" role="alert">{actionError}</p>}
      {actionMessage && <p className="field-hint" role="status">{actionMessage}</p>}

      {/* CTA */}
      <div className="vendor-page__cta-row">
        <OutlinedButton
          onClick={() => submitBooking('cart')}
          disabled={bookingSubmitting || !!missingSelection}
          aria-label={`Add ${displayName} to cart — ${formatINR(total)}`}
        >
          <Icon slot="icon" aria-hidden="true">shopping_bag</Icon>
          {bookingSubmitting ? 'Adding…' : 'Add to Cart'}
        </OutlinedButton>
        <FilledButton
          className="vendor-page__book-btn"
          onClick={() => submitBooking('book')}
          disabled={bookingSubmitting || !!missingSelection}
          aria-label={`Book ${displayName} — ${formatINR(total)}`}
        >
          <Icon slot="icon" aria-hidden="true">calendar_month</Icon>
          {bookingSubmitting ? 'Booking…' : 'Book Now'}
        </FilledButton>
      </div>

      {/* Details — only what the API actually returns, nothing fabricated */}
      {(therapist.specialization || therapist.bio) && (
        <>
          <Divider />
          {therapist.specialization && <p className="vendor-page__service-tagline">{therapist.specialization}</p>}
          {therapist.bio && (
            <sky-accordion>
              <sky-accordion-item header="About" open>
                <p className="vendor-page__accordion-text">{therapist.bio}</p>
              </sky-accordion-item>
            </sky-accordion>
          )}
        </>
      )}
    </>
  );
}

export default VendorPage;
