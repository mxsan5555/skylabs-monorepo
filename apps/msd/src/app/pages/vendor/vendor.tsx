import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FilledButton,
  OutlinedIconButton,
  Icon,
  Divider,
  Radio,
  ChipSet,
  FilterChip,
  SuggestionChip,
  Tabs,
  PrimaryTab,
  OutlinedTextField,
} from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  getCatalogVendor,
  listCatalogDeals,
  type CatalogVendorDetail,
  type CatalogVendorBranch,
  type CatalogDeal,
} from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { addCartItem } from '../../../api/cart';
import { createBooking } from '../../../api/bookings';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { SkyProductCardWC } from '../../components/sky-product-card-wc';
import { Breadcrumb } from '../../components/breadcrumb';
import { formatINR, pluralize } from '../../../utils/format';
import './vendor.css';

const SITE_URL: string = (import.meta.env['VITE_SITE_URL'] as string | undefined) ?? '';

const TIME_SLOTS = ['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM'];

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_LABELS: Record<(typeof DAY_ORDER)[number], string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

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

// ── Deal grouping: Category → Sub-category → Service, each service holding its package Deals ──

interface ServiceGroup {
  id: string;
  name: string;
  deals: CatalogDeal[];
}

interface SubcategoryGroup {
  name: string | null;
  services: ServiceGroup[];
}

interface CategoryGroup {
  name: string;
  subcategories: SubcategoryGroup[];
}

/** Groups service Deals for display headers only — the selectable/bookable unit stays the Deal
 *  (a Service can have several Deal "packages" at different durations/prices, e.g. a 60/90/120
 *  min Swedish Massage), grouped here by their shared `service.id`. */
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
    const group = getOrCreate(serviceMap, service.id, () => ({ id: service.id, name: service.name, deals: [] }));
    group.deals.push(deal);
  }
  return Array.from(categories.entries()).map(([name, subMap]) => ({
    name,
    subcategories: Array.from(subMap.entries()).map(([subKey, serviceMap]) => ({
      name: subKey === '' ? null : subKey,
      services: Array.from(serviceMap.values()),
    })),
  }));
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function VendorPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { token, isAuthenticated } = useAuth();
  const { has: isWishlisted, toggle: toggleWishlist, isPending: wishlistPending } = useWishlist();

  const [vendor, setVendor] = useState<CatalogVendorDetail | null>(null);
  const [vendorLoading, setVendorLoading] = useState(true);
  const [vendorError, setVendorError] = useState('');

  const [branchIndex, setBranchIndex] = useState(0);

  const [serviceDeals, setServiceDeals] = useState<CatalogDeal[]>([]);
  const [productDeals, setProductDeals] = useState<CatalogDeal[]>([]);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [dealsError, setDealsError] = useState('');

  const [activeCategoryName, setActiveCategoryName] = useState('all');
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [selectedTherapistId, setSelectedTherapistId] = useState('');
  const [qty, setQty] = useState(1);
  const [bookingDate, setBookingDate] = useState('');
  const [timeSlot, setTimeSlot] = useState('');
  const [bookingSubmitting, setBookingSubmitting] = useState(false);

  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

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
          setVendorError(err instanceof ApiRequestError ? err.message : 'Could not load this vendor.');
        }
      })
      .finally(() => setVendorLoading(false));
  }, [slug]);

  const selectedBranch: CatalogVendorBranch | null = vendor?.branches[branchIndex] ?? vendor?.branches[0] ?? null;

  const resetSelection = () => {
    setActiveCategoryName('all');
    setSelectedServiceId(null);
    setSelectedDealId(null);
    setSelectedTherapistId('');
    setQty(1);
    setBookingDate('');
    setTimeSlot('');
    setActionError('');
    setActionMessage('');
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
      .catch((err) => setDealsError(err instanceof ApiRequestError ? err.message : 'Could not load services and products.'))
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
  const activeDeal = activeGroup
    ? (activeGroup.deals.find((d) => d.id === selectedDealId) ?? activeGroup.deals[0])
    : null;
  const total = activeDeal ? Number(activeDeal.salePrice) * qty : 0;

  const handleCategoryFilter = (name: string) => {
    setActiveCategoryName(name);
    setSelectedServiceId(null);
    setSelectedDealId(null);
    setSelectedTherapistId('');
    setQty(1);
    setBookingDate('');
    setTimeSlot('');
  };

  const handleServiceSelect = (group: ServiceGroup) => {
    if (group.id !== selectedServiceId) {
      setSelectedDealId(group.deals[0].id);
      setQty(1);
      setSelectedTherapistId('');
      setBookingDate('');
      setTimeSlot('');
      setActionError('');
      setActionMessage('');
    }
    setSelectedServiceId(group.id);
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
    setActionError('');
    setActionMessage('');
    try {
      await addCartItem(token, deal.id, 1);
      setActionMessage(`Added "${deal.product?.name ?? deal.title}" to your cart.`);
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : 'Could not add to cart.');
    }
  };

  const submitBooking = async () => {
    if (!activeGroup || !activeDeal) return;
    if (!requireAuthOrRedirect()) return;
    if (!bookingDate || !timeSlot) {
      setActionError('Select a date and time slot.');
      setActionMessage('');
      return;
    }
    setActionError('');
    setActionMessage('');
    setBookingSubmitting(true);
    try {
      await createBooking(token, {
        dealId: activeDeal.id,
        bookingDate: new Date(bookingDate).toISOString(),
        timeSlot,
        quantity: qty,
        ...(selectedTherapistId ? { therapistId: selectedTherapistId } : {}),
      });
      setActionMessage(`Booked "${activeGroup.name}" for ${bookingDate} at ${timeSlot}.`);
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : 'Could not book this service.');
    } finally {
      setBookingSubmitting(false);
    }
  };

  if (vendorLoading) {
    return <p className="loading-state">Loading vendor…</p>;
  }

  if (vendorError || !vendor) {
    return (
      <div className="vendor-page vendor-page--empty">
        <title>Vendor Not Found | MSD</title>
        <sky-info-card
          icon="search_off"
          heading="Vendor not found"
          subheading={vendorError || 'This vendor may no longer be available.'}
        />
        <FilledButton onClick={() => navigate('/explore')}>Browse Services</FilledButton>
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
          { label: 'Home', to: '/' },
          { label: 'Explore', to: '/explore' },
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
              <h2 className="vendor-page__hours-title">Working Hours</h2>
              <div className="vendor-page__hours-grid">
                {DAY_ORDER.map((day) => {
                  const raw = selectedBranch.openingHours?.[day];
                  const closed = !raw || raw === 'closed';
                  return (
                    <div key={day} className="vendor-page__hours-row">
                      <span className="vendor-page__hours-day">{DAY_LABELS[day]}</span>
                      <span className="vendor-page__hours-time">
                        {closed ? 'Closed' : raw.replace('-', ' – ')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <Divider />

          {/* Select Service */}
          <section className="vendor-page__section" aria-label="Services">
            <h2 className="vendor-page__section-title">Select Service</h2>

            {categoryNames.length > 1 && (
              <ChipSet aria-label="Filter by service category">
                <FilterChip
                  label="All"
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
              <p className="loading-state">Loading services…</p>
            ) : dealsError ? (
              <p className="error-state" role="alert">{dealsError}</p>
            ) : displayedCategoryGroups.length === 0 ? (
              <p className="vendor-page__deal-empty">No services available at this branch.</p>
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
                              const first = group.deals[0];
                              const minPrice = Math.min(...group.deals.map((d) => Number(d.salePrice)));
                              const thumb = first.service?.image ?? first.images?.[0] ?? undefined;
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
                                      alt={first.service?.imageAlt ?? ''}
                                      loading="lazy"
                                      width={120}
                                      height={80}
                                    />
                                  )}

                                  <div className="vendor-page__deal-card-body">
                                    <div className="vendor-page__deal-card-title">{group.name}</div>
                                    {first.shortDescription && (
                                      <div className="vendor-page__deal-card-desc">{first.shortDescription}</div>
                                    )}
                                    <div className="vendor-page__deal-card-meta">
                                      <ChipSet>
                                        {group.deals.length > 1 && (
                                          <SuggestionChip label={`${group.deals.length} packages`} />
                                        )}
                                        {first.durationMinutes != null && (
                                          <SuggestionChip label={`${first.durationMinutes} min`} />
                                        )}
                                      </ChipSet>
                                      <span className="vendor-page__deal-price">From {formatINR(minPrice)}</span>
                                    </div>
                                  </div>
                                  <span
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                  >
                                    <OutlinedIconButton
                                      aria-label={isWishlisted(first.id) ? 'Remove from wishlist' : 'Save to wishlist'}
                                      aria-pressed={isWishlisted(first.id)}
                                      disabled={wishlistPending(first.id)}
                                      onClick={() => toggleFavorite(first)}
                                    >
                                      <Icon aria-hidden="true">{isWishlisted(first.id) ? 'favorite' : 'favorite_border'}</Icon>
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
          <section className="vendor-page__section" aria-label="Products">
            <h2 className="vendor-page__section-title">Products</h2>
            {dealsLoading ? (
              <p className="loading-state">Loading products…</p>
            ) : productDeals.length === 0 ? (
              <p className="vendor-page__deal-empty">No products available at this branch.</p>
            ) : (
              <ul className="vendor-page__product-grid">
                {productDeals.map((deal) => (
                  <li key={deal.id}>
                    <SkyProductCardWC
                      variant="outlined"
                      badge="Product"
                      eyebrow={deal.product?.brand ?? undefined}
                      heading={deal.product?.name ?? deal.title}
                      image={deal.product?.image ?? deal.images?.[0] ?? undefined}
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
                          Add to Cart
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
          <section className="vendor-page__section" aria-label="Therapists">
            <h2 className="vendor-page__section-title">Meet Our Therapists</h2>
            {selectedBranch && selectedBranch.therapists.length > 0 ? (
              <ul className="vendor-page__therapist-grid">
                {selectedBranch.therapists.map((t) => (
                  <li key={t.id}>
                    <sky-info-card icon="person" heading={t.name} subheading={t.specialization ?? undefined}>
                      {t.photoUrl && <img slot="media" src={t.photoUrl} alt="" loading="lazy" />}
                      {(t.experienceYears != null || t.bio) && (
                        <div className="vendor-page__therapist-extra">
                          {t.experienceYears != null && (
                            <p className="vendor-page__therapist-exp">
                              {t.experienceYears} {pluralize(t.experienceYears, 'year')} experience
                            </p>
                          )}
                          {t.bio && <p className="vendor-page__therapist-bio">{t.bio}</p>}
                        </div>
                      )}
                    </sky-info-card>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="vendor-page__deal-empty">No therapist profiles listed for this branch yet.</p>
            )}
          </section>
        </div>

        {/* ── Right: Your selection card ───────────────────────────────────── */}
        <aside className="vendor-page__selection-card" aria-label="Your selection">
          <h2 className="vendor-page__selection-title">Your selection</h2>

          {activeGroup && activeDeal ? (
            <>
              {/* Selected deal preview */}
              <div className="vendor-page__selected-deal">
                {(activeDeal.service?.image ?? activeDeal.images?.[0]) && (
                  <img
                    className="vendor-page__selected-thumb"
                    src={activeDeal.service?.image ?? activeDeal.images?.[0]}
                    alt=""
                    loading="lazy"
                    width={52}
                    height={52}
                  />
                )}
                <div className="vendor-page__selected-info">
                  <div className="vendor-page__selected-name">{activeGroup.name}</div>
                </div>
              </div>

              <Divider />

              {/* Package selection */}
              {activeGroup.deals.length > 1 && (
                <div>
                  <p className="vendor-page__packages-label">Select your package</p>
                  <div className="vendor-page__package-list" role="group" aria-label="Select a package">
                    {activeGroup.deals.map((deal) => {
                      const isSel = deal.id === activeDeal.id;
                      const label = deal.durationMinutes != null ? `${deal.durationMinutes} min` : deal.title;
                      return (
                        <button
                          key={deal.id}
                          type="button"
                          className={`vendor-page__package-row${isSel ? ' vendor-page__package-row--selected' : ''}`}
                          onClick={() => setSelectedDealId(deal.id)}
                          aria-pressed={isSel}
                          aria-label={`${label} — ${formatINR(Number(deal.salePrice))}`}
                        >
                          <span className="vendor-page__package-label">
                            {label}
                            {deal.discountPercent != null && (
                              <span className="vendor-page__package-discount"> {deal.discountPercent}% off</span>
                            )}
                          </span>
                          <span className="vendor-page__package-price-wrap">
                            <strong className="vendor-page__package-price">
                              {formatINR(Number(deal.salePrice))}
                            </strong>
                            {deal.originalPrice != null && Number(deal.originalPrice) !== Number(deal.salePrice) && (
                              <s className="vendor-page__package-orig">{formatINR(Number(deal.originalPrice))}</s>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Therapist selection */}
              {selectedBranch && selectedBranch.therapists.length > 0 && (
                <>
                  <Divider />
                  <div>
                    <p className="vendor-page__packages-label">Select a therapist</p>
                    <ChipSet aria-label="Select a therapist">
                      <FilterChip
                        label="Any therapist"
                        selected={selectedTherapistId === ''}
                        onClick={() => setSelectedTherapistId('')}
                      />
                      {selectedBranch.therapists.map((t) => (
                        <FilterChip
                          key={t.id}
                          label={t.name}
                          selected={selectedTherapistId === t.id}
                          onClick={() => setSelectedTherapistId(t.id)}
                        />
                      ))}
                    </ChipSet>
                  </div>
                </>
              )}

              <Divider />

              {/* Date + time slot */}
              <div className="vendor-page__booking-fields">
                <OutlinedTextField
                  label="Date"
                  type="date"
                  value={bookingDate}
                  onInput={(e: Event) => setBookingDate((e.target as HTMLInputElement).value)}
                />
                <p className="field-hint">Time slot</p>
                <ChipSet aria-label="Select a time slot">
                  {TIME_SLOTS.map((slot) => (
                    <FilterChip
                      key={slot}
                      label={slot}
                      selected={timeSlot === slot}
                      onClick={() => setTimeSlot(slot)}
                    />
                  ))}
                </ChipSet>
              </div>

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

              {actionError && <p className="error-state" role="alert">{actionError}</p>}
              {actionMessage && <p className="field-hint" role="status">{actionMessage}</p>}

              {/* CTA */}
              <FilledButton
                className="vendor-page__book-btn"
                onClick={submitBooking}
                disabled={bookingSubmitting}
                aria-label={`Book ${activeGroup.name} — ${formatINR(total)}`}
              >
                <Icon slot="icon" aria-hidden="true">calendar_month</Icon>
                {bookingSubmitting ? 'Booking…' : 'Book Now'}
              </FilledButton>

              {/* Details accordion — only what the API actually returns, nothing fabricated */}
              {(activeDeal.shortDescription || activeDeal.description) && (
                <>
                  <Divider />
                  {activeDeal.shortDescription && (
                    <p className="vendor-page__service-tagline">{activeDeal.shortDescription}</p>
                  )}
                  {activeDeal.description && (
                    <sky-accordion>
                      <sky-accordion-item header="Details" open>
                        <p className="vendor-page__accordion-text">{activeDeal.description}</p>
                      </sky-accordion-item>
                    </sky-accordion>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="vendor-page__selection-empty">
              <Icon aria-hidden="true" className="vendor-page__empty-icon">spa</Icon>
              <p>Select a service to see packages and pricing.</p>
            </div>
          )}
        </aside>

      </div>
    </div>
  );
}

export default VendorPage;
