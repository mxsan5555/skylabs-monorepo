import { useState, useMemo, useRef } from 'react';
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
  AssistChip,
  Dialog,
  TextButton,
  OutlinedTextField,
} from '@skylabs-monorepo/shared-ui/react';
import { getVendorBySlug } from '../../../data/vendors';
import { Breadcrumb } from '../../components/breadcrumb';

const SITE_URL: string = (import.meta.env['VITE_SITE_URL'] as string | undefined) ?? '';

const DAY_MAP: Record<string, string> = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday',
  Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
};

function to24h(time: string | null): string {
  if (!time) return '00:00';
  const [hm, period] = time.split(' ');
  let [h, m] = hm.split(':').map(Number);
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
import { formatINR } from '../../../utils/format';
import type { VendorService, DealVariant } from '../../../types';
import './vendor.css';

// ── Mock review data ───────────────────────────────────────────────────────────

interface Review {
  id: string;
  author: string;
  rating: number;
  date: string;
  comment: string;
}

const MOCK_VENDOR_REVIEWS: Review[] = [
  { id: 'r1', author: 'Priya S.', rating: 5, date: '15 Jul 2026', comment: 'Absolutely loved the experience! The therapists are highly skilled and the ambience is perfect.' },
  { id: 'r2', author: 'Rahul M.', rating: 4, date: '10 Jul 2026', comment: 'Great place for a relaxing weekend. Would love if they extended Sunday hours.' },
  { id: 'r3', author: 'Ananya K.', rating: 5, date: '3 Jul 2026', comment: 'Best spa in Koramangala. The organic products they use are top notch.' },
];

const MOCK_DEAL_REVIEWS: Record<string, Review[]> = {
  'vs-01': [
    { id: 'dr1', author: 'Sneha T.', rating: 5, date: '18 Jul 2026', comment: 'The Swedish massage was divine. Left feeling like a new person!' },
    { id: 'dr2', author: 'Vikram P.', rating: 4, date: '12 Jul 2026', comment: 'Good pressure, very relaxing. The herbal tea after was a lovely touch.' },
  ],
  'vs-02': [
    { id: 'dr3', author: 'Kavitha R.', rating: 5, date: '20 Jul 2026', comment: 'My back pain is completely gone after just one session. Highly recommended.' },
  ],
  'vs-03': [
    { id: 'dr4', author: 'Meera D.', rating: 5, date: '22 Jul 2026', comment: 'The lavender blend was so soothing. I fell asleep halfway through — in the best way.' },
  ],
  'vs-04': [
    { id: 'dr5', author: 'Rohan G.', rating: 5, date: '25 Jul 2026', comment: 'Skin looked visibly brighter the next day. Worth every rupee.' },
    { id: 'dr6', author: 'Nisha A.', rating: 4, date: '19 Jul 2026', comment: 'Very professional. The LED therapy at the end was a nice bonus.' },
  ],
  'vs-05': [
    { id: 'dr7', author: 'Divya L.', rating: 4, date: '16 Jul 2026', comment: 'Loved the gold serum. Skin felt plump and glowing for almost a week.' },
  ],
  'vs-06': [
    { id: 'dr8', author: 'Arun & Pooja', rating: 5, date: '14 Jul 2026', comment: 'Best anniversary treat ever! The suite was beautifully set up for us.' },
  ],
  'vs-07': [
    { id: 'dr9', author: 'Kiran B.', rating: 5, date: '11 Jul 2026', comment: 'The rose bath was magical. A truly special experience from start to finish.' },
  ],
};

// ── Review list sub-component ──────────────────────────────────────────────────

function ReviewList({ reviews }: { reviews: Review[] }) {
  if (reviews.length === 0) {
    return <p className="vendor-page__dialog-empty">No reviews yet. Be the first!</p>;
  }
  return (
    <ul className="vendor-page__review-list" aria-label="Customer reviews">
      {reviews.map((r) => (
        <li key={r.id} className="vendor-page__review-item">
          <div className="vendor-page__review-header">
            <span className="vendor-page__review-author">{r.author}</span>
            <span className="vendor-page__review-stars" aria-label={`${r.rating} out of 5 stars`}>
              {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
            </span>
            <span className="vendor-page__review-date">{r.date}</span>
          </div>
          <p className="vendor-page__review-comment">{r.comment}</p>
        </li>
      ))}
    </ul>
  );
}

// ── Review form sub-component ──────────────────────────────────────────────────

function ReviewForm({
  reviewText,
  reviewRating,
  onTextChange,
  onRatingChange,
}: {
  reviewText: string;
  reviewRating: number;
  onTextChange: (v: string) => void;
  onRatingChange: (v: number) => void;
}) {
  return (
    <div className="vendor-page__review-form">
      <p className="vendor-page__review-form-label">Add Your Review</p>
      <div className="vendor-page__star-picker" role="group" aria-label="Select your rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`vendor-page__star-btn${reviewRating >= n ? ' vendor-page__star-btn--active' : ''}`}
            onClick={() => onRatingChange(n)}
            aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
            aria-pressed={reviewRating >= n}
          >
            ★
          </button>
        ))}
      </div>
      <OutlinedTextField
        label="Write your review"
        value={reviewText}
        onInput={(e) => onTextChange((e.target as HTMLInputElement).value)}
        className="vendor-page__review-field"
      />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function VendorPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const vendor = getVendorBySlug(slug);

  const [activeCatSlug, setActiveCatSlug] = useState<string>('all');
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);

  // Review form state
  const [vendorReviewText, setVendorReviewText] = useState('');
  const [vendorReviewRating, setVendorReviewRating] = useState(5);
  const [dealReviewText, setDealReviewText] = useState('');
  const [dealReviewRating, setDealReviewRating] = useState(5);

  // Dialog refs
  const vendorDialogRef = useRef<HTMLElement & { show(): void; close(): void }>(null);
  const dealDialogRef = useRef<HTMLElement & { show(): void; close(): void }>(null);

  const filteredServices = useMemo<VendorService[]>(() => {
    if (!vendor) return [];
    if (activeCatSlug === 'all') return vendor.services;
    return vendor.services.filter((s) => s.vendorCategorySlug === activeCatSlug);
  }, [vendor, activeCatSlug]);

  const activeService = useMemo<VendorService | null>(() => {
    if (filteredServices.length === 0) return null;
    return filteredServices.find((s) => s.id === selectedServiceId) ?? null;
  }, [filteredServices, selectedServiceId]);

  const activeVariant = useMemo<DealVariant | null>(() => {
    if (!activeService) return null;
    return (
      activeService.variants.find((v) => v.id === selectedVariantId) ??
      activeService.variants[0]
    );
  }, [activeService, selectedVariantId]);

  const total = activeVariant ? activeVariant.price * qty : 0;

  const dealReviews = activeService ? (MOCK_DEAL_REVIEWS[activeService.id] ?? []) : [];

  const handleCategorySelect = (catSlug: string) => {
    setActiveCatSlug(catSlug);
    setSelectedServiceId(null);
    setSelectedVariantId(null);
    setQty(1);
  };

  const handleServiceSelect = (serviceId: string) => {
    if (serviceId !== selectedServiceId) {
      setSelectedVariantId(null);
      setQty(1);
    }
    setSelectedServiceId(serviceId);
  };

  if (!vendor) {
    return (
      <div className="vendor-page vendor-page--empty">
        <title>Vendor Not Found | MSD</title>
        <sky-info-card
          icon="search_off"
          heading="Vendor not found"
          subheading="This vendor may no longer be available."
        />
        <FilledButton onClick={() => navigate('/explore')}>Browse Services</FilledButton>
      </div>
    );
  }

  const canonicalUrl = `${SITE_URL}/vendor/${vendor.slug}`;

  return (
    <div id="main-content" className="vendor-page">
      <title>{`${vendor.name} | MSD`}</title>
      <meta
        name="description"
        content={`${vendor.tagline ?? vendor.description} — Book services at ${vendor.name}, ${vendor.location}.`}
      />
      <link rel="canonical" href={canonicalUrl} />
      <meta property="og:type" content="business.business" />
      <meta property="og:title" content={`${vendor.name} | MSD`} />
      <meta property="og:description" content={`${vendor.tagline ?? vendor.description} — Book services at ${vendor.name}, ${vendor.location}.`} />
      <meta property="og:image" content={vendor.coverImage} />
      <meta property="og:url" content={canonicalUrl} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={`${vendor.name} | MSD`} />
      <meta name="twitter:description" content={(vendor.tagline ?? vendor.description).slice(0, 155)} />
      <meta name="twitter:image" content={vendor.coverImage} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'LocalBusiness',
            name: vendor.name,
            description: vendor.description,
            image: vendor.coverImage,
            url: canonicalUrl,
            address: {
              '@type': 'PostalAddress',
              addressLocality: vendor.location,
              addressCountry: 'IN',
            },
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: vendor.rating,
              reviewCount: vendor.reviews,
              bestRating: 5,
            },
            openingHoursSpecification: (vendor.openingHours ?? [])
              .filter((h) => h.open && h.close)
              .map((h) => ({
                '@type': 'OpeningHoursSpecification',
                dayOfWeek: `https://schema.org/${DAY_MAP[h.day] ?? h.day}`,
                opens: to24h(h.open),
                closes: to24h(h.close),
              })),
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
              { '@type': 'ListItem', position: 3, name: vendor.name, item: canonicalUrl },
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
          { label: vendor.name },
        ]}
      />

      {/* Hero — full-bleed background image */}
      <div className="vendor-page__hero" aria-hidden="true">
        <img src={vendor.coverImage} alt="" />
      </div>

      {/* Two-panel body overlapping the hero */}
      <div className="vendor-page__body">

        {/* ── Left: main content card ──────────────────────────────────────── */}
        <div className="vendor-page__main-card">

          {/* Company header */}
          <div className="vendor-page__company-row">
            <div className="vendor-page__company-info">
              <h1 className="vendor-page__company-name">{vendor.name}</h1>
              {vendor.tagline && (
                <p className="vendor-page__company-tagline">{vendor.tagline}</p>
              )}
              <div className="vendor-page__company-meta">
                <span className="vendor-page__rating-row">
                  <span
                    aria-label={`Rated ${vendor.rating} out of 5, ${vendor.reviews.toLocaleString()} reviews`}
                    className="vendor-page__rating-inline"
                  >
                    <span className="vendor-page__star" aria-hidden="true">★</span>
                    {vendor.rating}
                    <span className="vendor-page__review-count">
                      ({vendor.reviews.toLocaleString()})
                    </span>
                  </span>
                  <TextButton
                    onClick={() => vendorDialogRef.current?.show()}
                    aria-label="See all company reviews"
                  >
                    See Reviews
                  </TextButton>
                </span>
                <span className="vendor-page__location-row">
                  <Icon aria-hidden="true" className="vendor-page__meta-icon">location_on</Icon>
                  {vendor.location}
                </span>
                <span role="status">
                  <sky-badge variant={vendor.isOpen ? 'primary' : 'error'}>
                    {vendor.isOpen ? 'Open Now' : 'Closed'}
                  </sky-badge>
                </span>
              </div>
            </div>
            <img
              className="vendor-page__company-img"
              src={vendor.coverImage}
              alt={vendor.coverImageAlt}
              loading="eager"
            />
          </div>

          {/* Opening hours */}
          {vendor.openingHours && vendor.openingHours.length > 0 && (
            <div className="vendor-page__hours-section">
              <h2 className="vendor-page__hours-title">Working Hours</h2>
              <div className="vendor-page__hours-grid">
                {vendor.openingHours.map(({ day, open, close }) => (
                  <div key={day} className="vendor-page__hours-row">
                    <span className="vendor-page__hours-day">{day}</span>
                    <span className="vendor-page__hours-time">
                      {open && close ? `${open} – ${close}` : 'Closed'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Divider />

          {/* Select Service */}
          <section className="vendor-page__section">
            <h2 className="vendor-page__section-title">Select Service</h2>
            <ChipSet aria-label="Filter by service category">
              <FilterChip
                label="All"
                selected={activeCatSlug === 'all'}
                onClick={() => handleCategorySelect('all')}
              />
              {vendor.categories.map((cat) => (
                <FilterChip
                  key={cat.slug}
                  label={cat.name}
                  selected={activeCatSlug === cat.slug}
                  onClick={() => handleCategorySelect(cat.slug)}
                />
              ))}
            </ChipSet>
          </section>

          {/* Select Deal */}
          <section className="vendor-page__section">
            <h2 className="vendor-page__section-title">Select Deal</h2>
            <div
              className="vendor-page__deal-list"
              role="radiogroup"
              aria-label="Available services"
            >
              {filteredServices.length === 0 ? (
                <p className="vendor-page__deal-empty">No services in this category.</p>
              ) : (
                filteredServices.map((service) => {
                  const isSelected = service.id === selectedServiceId;
                  const cat = vendor.categories.find(
                    (c) => c.slug === service.vendorCategorySlug,
                  );
                  return (
                    <label
                      key={service.id}
                      htmlFor={`deal-${service.id}`}
                      className={`vendor-page__deal-card${isSelected ? ' vendor-page__deal-card--selected' : ''}`}
                    >
                      {/* MD3 Radio */}
                      <Radio
                        id={`deal-${service.id}`}
                        name="deal-selection"
                        value={service.id}
                        checked={isSelected}
                        onChange={() => handleServiceSelect(service.id)}
                      />

                      {/* Thumbnail */}
                      <img
                        className="vendor-page__deal-card-img"
                        src={service.image}
                        alt={service.imageAlt}
                        loading="lazy"
                        width={120}
                        height={80}
                      />

                      {/* Content */}
                      <div className="vendor-page__deal-card-body">
                        <div className="vendor-page__deal-card-title">{service.title}</div>
                        <div className="vendor-page__deal-card-desc">{service.description}</div>
                        <div className="vendor-page__deal-card-meta">
                          <ChipSet>
                            {cat && <SuggestionChip label={cat.name} />}
                            {service.badge && <SuggestionChip label={service.badge} />}
                          </ChipSet>
                          {service.rating != null && (
                            <span
                              className="vendor-page__deal-rating"
                              aria-label={`Rated ${service.rating} out of 5`}
                            >
                              <span aria-hidden="true">★</span>
                              {service.rating}
                              {service.reviews != null && (
                                <span className="vendor-page__deal-reviews">
                                  ({service.reviews.toLocaleString()})
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </section>
        </div>

        {/* ── Right: Your selection card ───────────────────────────────────── */}
        <aside className="vendor-page__selection-card" aria-label="Your selection">
          <h2 className="vendor-page__selection-title">Your selection</h2>

          {activeService ? (
            <>
              {/* Selected deal preview */}
              <div className="vendor-page__selected-deal">
                <img
                  className="vendor-page__selected-thumb"
                  src={activeService.image}
                  alt={activeService.imageAlt}
                  loading="lazy"
                  width={52}
                  height={52}
                />
                <div className="vendor-page__selected-info">
                  <div className="vendor-page__selected-name">{activeService.title}</div>
                  {activeService.rating != null && (
                    <div
                      className="vendor-page__selected-rating"
                      aria-label={`Rated ${activeService.rating}`}
                    >
                      <span aria-hidden="true">★</span>
                      {activeService.rating}
                      {activeService.reviews != null && (
                        <span className="vendor-page__selected-reviews">
                          ({activeService.reviews.toLocaleString()})
                        </span>
                      )}
                      <TextButton
                        onClick={() => dealDialogRef.current?.show()}
                        aria-label={`See reviews for ${activeService.title}`}
                      >
                        Reviews
                      </TextButton>
                    </div>
                  )}
                </div>
              </div>

              <Divider />

              {/* Package selection */}
              <div>
                <p className="vendor-page__packages-label">Select your package</p>
                <div
                  className="vendor-page__package-list"
                  role="group"
                  aria-label="Select a package"
                >
                  {activeService.variants.map((v) => {
                    const isSel =
                      v.id === (selectedVariantId ?? activeService.variants[0].id);
                    return (
                      <button
                        key={v.id}
                        className={`vendor-page__package-row${isSel ? ' vendor-page__package-row--selected' : ''}`}
                        onClick={() => setSelectedVariantId(v.id)}
                        aria-pressed={isSel}
                        aria-label={`${v.label} ${v.duration} ${v.durationUnit} — ${formatINR(v.price)}`}
                      >
                        <span className="vendor-page__package-label">
                          {v.label}
                          <span className="vendor-page__package-duration">
                            {' '}· {v.duration} {v.durationUnit}
                          </span>
                          {v.discount != null && (
                            <span className="vendor-page__package-discount">
                              {' '}{v.discount}% off
                            </span>
                          )}
                        </span>
                        <span className="vendor-page__package-price-wrap">
                          <strong className="vendor-page__package-price">
                            {formatINR(v.price)}
                          </strong>
                          {v.originalPrice != null && (
                            <s className="vendor-page__package-orig">
                              {formatINR(v.originalPrice)}
                            </s>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
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

              {/* CTA */}
              <FilledButton
                className="vendor-page__book-btn"
                aria-label={`Book ${activeService.title} — ${formatINR(total)}`}
              >
                <Icon slot="icon" aria-hidden="true">calendar_month</Icon>
                Book Now
              </FilledButton>

              <Divider />

              {/* Feature chips */}
              {activeService.features && activeService.features.length > 0 && (
                <ChipSet aria-label="Service features">
                  {activeService.features.map((f) => (
                    <AssistChip key={f} label={f}>
                      <Icon slot="icon" aria-hidden="true">check_circle</Icon>
                    </AssistChip>
                  ))}
                </ChipSet>
              )}

              {/* Service tagline */}
              {activeService.tagline && (
                <p className="vendor-page__service-tagline">{activeService.tagline}</p>
              )}

              {/* Accordion: What's Included / How to Use / Cancellation Policy */}
              <sky-accordion>
                {activeService.included && activeService.included.length > 0 && (
                  <sky-accordion-item header="What's Included" open>
                    <ul className="vendor-page__accordion-list">
                      {activeService.included.map((item) => (
                        <li key={item} className="vendor-page__accordion-list-item">
                          <Icon aria-hidden="true" className="vendor-page__check-icon">check</Icon>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </sky-accordion-item>
                )}
                {activeService.howToUse && activeService.howToUse.length > 0 && (
                  <sky-accordion-item header="How to Use">
                    <ol className="vendor-page__accordion-list vendor-page__accordion-list--ordered">
                      {activeService.howToUse.map((step, i) => (
                        <li key={i} className="vendor-page__accordion-list-item">
                          {step}
                        </li>
                      ))}
                    </ol>
                  </sky-accordion-item>
                )}
                {activeService.cancellationPolicy && (
                  <sky-accordion-item header="Cancellation Policy">
                    <p className="vendor-page__accordion-text">
                      {activeService.cancellationPolicy}
                    </p>
                  </sky-accordion-item>
                )}
              </sky-accordion>
            </>
          ) : (
            <div className="vendor-page__selection-empty">
              <Icon aria-hidden="true" className="vendor-page__empty-icon">spa</Icon>
              <p>Select a deal to see packages and pricing.</p>
            </div>
          )}
        </aside>

      </div>

      {/* ── Vendor reviews dialog ────────────────────────────────────────────── */}
      <Dialog ref={vendorDialogRef} aria-labelledby="vendor-dialog-title">
        <div slot="headline" id="vendor-dialog-title">{vendor.name} — Reviews</div>
        <div slot="content" className="vendor-page__dialog-body">
          <ReviewList reviews={MOCK_VENDOR_REVIEWS} />
          <Divider />
          <ReviewForm
            reviewText={vendorReviewText}
            reviewRating={vendorReviewRating}
            onTextChange={setVendorReviewText}
            onRatingChange={setVendorReviewRating}
          />
        </div>
        <div slot="actions">
          <TextButton onClick={() => vendorDialogRef.current?.close()}>Cancel</TextButton>
          <FilledButton
            onClick={() => {
              // In production this would POST to the API
              setVendorReviewText('');
              setVendorReviewRating(5);
              vendorDialogRef.current?.close();
            }}
          >
            Submit Review
          </FilledButton>
        </div>
      </Dialog>

      {/* ── Deal reviews dialog ──────────────────────────────────────────────── */}
      {activeService && (
        <Dialog ref={dealDialogRef} aria-labelledby="deal-dialog-title">
          <div slot="headline" id="deal-dialog-title">{activeService.title} — Reviews</div>
          <div slot="content" className="vendor-page__dialog-body">
            <ReviewList reviews={dealReviews} />
            <Divider />
            <ReviewForm
              reviewText={dealReviewText}
              reviewRating={dealReviewRating}
              onTextChange={setDealReviewText}
              onRatingChange={setDealReviewRating}
            />
          </div>
          <div slot="actions">
            <TextButton onClick={() => dealDialogRef.current?.close()}>Cancel</TextButton>
            <FilledButton
              onClick={() => {
                setDealReviewText('');
                setDealReviewRating(5);
                dealDialogRef.current?.close();
              }}
            >
              Submit Review
            </FilledButton>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export default VendorPage;
