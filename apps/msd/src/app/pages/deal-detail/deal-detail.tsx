import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import {
  FilledButton,
  TextButton,
  OutlinedIconButton,
  Icon,
  Divider,
  Dialog,
  OutlinedTextField,
  ChipSet,
  FilterChip,
} from '@skylabs-monorepo/shared-ui/react';
import '@skylabs-monorepo/shared-ui/carousel';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getCatalogDeal, listCatalogDeals, type CatalogDeal } from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { addCartItem } from '../../../api/cart';
import { createBooking } from '../../../api/bookings';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { SkyProductCardWC } from '../../components/sky-product-card-wc';
import { Breadcrumb } from '../../components/breadcrumb';
import { formatINR } from '../../../utils/format';
import content from '../../../content.json';
import './deal-detail.css';
import { useAuth } from '../../../auth/auth-context';

const TIME_SLOTS = ['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM'];

/**
 * A single Deal — `GET /catalog/deals/:id`. Reachable for either a service deal (booking flow)
 * or a product deal (cart flow); `/category/:slug` only links service deals here (product deals
 * link to `/products/:id`), but this page honors whichever type the deal actually is, matching
 * the same `deal.service` / `deal.product` branch used everywhere else in the catalogue.
 */
export function DealDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token, isAuthenticated } = useAuth();
  const { has: isWishlisted, toggle: toggleWishlist, isPending: wishlistPending } = useWishlist();
  const { dealDetail } = content;

  const [deal, setDeal] = useState<CatalogDeal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [related, setRelated] = useState<CatalogDeal[]>([]);

  const [activeImg, setActiveImg] = useState(0);
  const [addedToCart, setAddedToCart] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    setActiveImg(0);
    getCatalogDeal(id)
      .then(({ data }) => setDeal(data))
      .catch((err) => {
        if (err instanceof ApiRequestError && err.status === 404) {
          setDeal(null);
        } else {
          setError(err instanceof ApiRequestError ? err.message : 'Could not load this deal.');
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!deal?.category?.id) {
      setRelated([]);
      return;
    }
    listCatalogDeals({ categoryId: deal.category.id, type: deal.service ? 'service' : 'product', pageSize: 7 })
      .then(({ data }) => setRelated(data.filter((d) => d.id !== deal.id).slice(0, 6)))
      .catch(() => setRelated([]));
  }, [deal]);

  if (loading) {
    return <p className="loading-state">Loading deal…</p>;
  }

  if (error || !deal) {
    return (
      <div className="deal-detail deal-detail--empty">
        <title>Deal Not Found | MSD</title>
        <sky-info-card icon="search_off" heading="Deal not found" subheading={error || 'This deal may no longer be available.'} />
        <FilledButton onClick={() => navigate('/categories')}>Browse Categories</FilledButton>
      </div>
    );
  }

  const requireAuthOrRedirect = () => {
    if (isAuthenticated) return true;
    navigate(`/sign-in?next=${encodeURIComponent(`/deal/${id}`)}`);
    return false;
  };

  const name = deal.service?.name ?? deal.product?.name ?? deal.title;
  const gallery = deal.images ?? [deal.service?.image ?? deal.product?.image].filter((x): x is string => !!x);
  const description = deal.description ?? deal.shortDescription ?? '';
  const salePrice = Number(deal.salePrice);
  const originalPrice = deal.originalPrice ? Number(deal.originalPrice) : undefined;
  const discountPct = deal.discountPercent ?? (originalPrice && originalPrice > salePrice
    ? Math.round(((originalPrice - salePrice) / originalPrice) * 100)
    : 0);
  const dealId = deal.id;

  async function addToCart() {
    if (!requireAuthOrRedirect()) return;
    setActionError('');
    setActionMessage('');
    try {
      await addCartItem(token, dealId, 1);
      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 2000);
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : 'Could not add to cart.');
    }
  }

  async function bookDeal(bookingDate: string, timeSlot: string) {
    if (!requireAuthOrRedirect()) return;
    await createBooking(token, { dealId, bookingDate: new Date(bookingDate).toISOString(), timeSlot });
    setActionMessage(`Booked "${name}" for ${bookingDate} at ${timeSlot}.`);
  }

  function toggleFavorite() {
    if (!requireAuthOrRedirect()) return;
    void toggleWishlist(dealId);
  }

  return (
    <div className="deal-detail">
      <title>{`${name} – ${deal.vendor?.businessName ?? 'MSD'} | MSD`}</title>
      <meta
        name="description"
        content={`${description || `Book ${name} at MSD.`} ${formatINR(salePrice)}${deal.branch?.city ? ` in ${deal.branch.city}` : ''}.`}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': deal.service ? 'Service' : 'Product',
            name,
            description,
            provider: deal.vendor?.businessName ? { '@type': 'Organization', name: deal.vendor.businessName } : undefined,
            offers: {
              '@type': 'Offer',
              price: salePrice,
              priceCurrency: 'INR',
              availability: 'https://schema.org/InStock',
            },
          }),
        }}
      />

      {/* ── Breadcrumb ─────────────────────────────────────────────────── */}
      <Breadcrumb
        className="deal-detail__breadcrumb"
        items={[
          { label: 'Home', to: '/' },
          ...(deal.category ? [{ label: deal.category.name, to: `/category/${deal.category.slug}` }] : []),
          { label: name },
        ]}
      />

      <div className="deal-detail__layout">
        {/* ── Gallery ────────────────────────────────────────────────────── */}
        <div className="deal-detail__gallery">
          <div className="deal-detail__main-img-wrap">
            {gallery[activeImg] && (
              <img
                className="deal-detail__main-img"
                src={gallery[activeImg]}
                alt={deal.service?.imageAlt ?? deal.product?.imageAlt ?? name}
                width={800}
                height={450}
              />
            )}
            {discountPct > 0 && (
              <span className="deal-detail__badge" aria-label={`${discountPct}% off`}>
                {discountPct}% OFF
              </span>
            )}
          </div>
          {gallery.length > 1 && (
            <div className="deal-detail__thumbs" aria-label="Gallery thumbnails">
              {gallery.map((img, i) => (
                <button
                  key={i}
                  className={`deal-detail__thumb${i === activeImg ? ' deal-detail__thumb--active' : ''}`}
                  onClick={() => setActiveImg(i)}
                  aria-label={`View image ${i + 1}`}
                  aria-pressed={i === activeImg}
                >
                  <img src={img} alt="" width={80} height={60} loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Info panel ─────────────────────────────────────────────────── */}
        <div className="deal-detail__info">
          {/* Provider + category */}
          <div className="deal-detail__meta-row">
            {deal.vendor?.businessName && (
              deal.vendor.slug ? (
                <Link to={`/vendor/${deal.vendor.slug}`} className="deal-detail__provider">
                  {deal.vendor.businessName}
                </Link>
              ) : (
                <span className="deal-detail__provider">{deal.vendor.businessName}</span>
              )
            )}
            {deal.category && (
              <sky-badge variant="secondary" size="small">
                {deal.category.name}
              </sky-badge>
            )}
            <sky-badge variant="primary" size="small">
              {deal.service ? 'Service' : 'Product'}
            </sky-badge>
          </div>

          <h1 className="deal-detail__title">{name}</h1>

          {(deal.branch?.city || deal.branch?.address) && (
            <p className="deal-detail__dist" aria-label="Location">
              <Icon aria-hidden="true">near_me</Icon>
              {[deal.branch?.name, deal.branch?.address ?? deal.branch?.city].filter(Boolean).join(' · ')}
            </p>
          )}

          <Divider />

          {/* Price */}
          <div className="deal-detail__price-row">
            <div>
              <span className="deal-detail__price">{formatINR(salePrice)}</span>
            </div>
            {originalPrice && originalPrice !== salePrice && (
              <div className="deal-detail__original">
                <s className="deal-detail__original-price" aria-label={`Original price ${formatINR(originalPrice)}`}>
                  {formatINR(originalPrice)}
                </s>
                {discountPct > 0 && (
                  <sky-badge variant="error" size="small">
                    {discountPct}% OFF
                  </sky-badge>
                )}
              </div>
            )}
          </div>

          {/* Duration */}
          {deal.durationMinutes && (
            <p className="deal-detail__duration">
              <Icon aria-hidden="true">schedule</Icon>
              {deal.durationMinutes} min
            </p>
          )}

          {/* CTA row */}
          <div className="deal-detail__cta">
            {deal.service ? (
              <BookingDialog deal={deal} name={name} onBook={bookDeal} />
            ) : (
              <FilledButton className="deal-detail__add-btn" onClick={addToCart}>
                <Icon slot="icon" aria-hidden="true">
                  {addedToCart ? 'check' : 'shopping_bag'}
                </Icon>
                {addedToCart ? 'Added to Cart!' : dealDetail.addToCart}
              </FilledButton>
            )}
            <OutlinedIconButton
              aria-label={isWishlisted(dealId) ? 'Remove from wishlist' : 'Save to wishlist'}
              aria-pressed={isWishlisted(dealId)}
              disabled={wishlistPending(dealId)}
              onClick={toggleFavorite}
            >
              <Icon aria-hidden="true">{isWishlisted(dealId) ? 'favorite' : 'favorite_border'}</Icon>
            </OutlinedIconButton>
          </div>

          {actionMessage && <p className="field-hint" role="status">{actionMessage}</p>}
          {actionError && <p className="error-state" role="alert">{actionError}</p>}

          <Divider />

          {/* Description + policy */}
          <sky-accordion>
            {description && (
              <sky-accordion-item header="Description" open>
                <p className="deal-detail__desc">{description}</p>
              </sky-accordion-item>
            )}
            <sky-accordion-item header={dealDetail.cancellationPolicy}>
              <p className="deal-detail__policy">{dealDetail.cancellationText}</p>
            </sky-accordion-item>
          </sky-accordion>
        </div>
      </div>

      {/* ── Related Deals ──────────────────────────────────────────────── */}
      {related.length > 0 && (
        <section className="deal-detail__related" aria-labelledby="related-heading">
          <div className="deal-detail__related-inner">
            <h2 id="related-heading" className="deal-detail__related-heading">
              {dealDetail.relatedDeals}
            </h2>
            <div className="deal-detail__related-carousel">
              <swiper-container
                slides-per-view="auto"
                space-between={16}
                free-mode="true"
                grab-cursor="true"
              >
                {related.map((d) => (
                  <swiper-slide key={d.id} style={{ width: '260px', height: 'auto' }}>
                    <SkyProductCardWC
                      variant="outlined"
                      badge={d.service ? 'Service' : 'Product'}
                      eyebrow={d.vendor?.businessName ?? undefined}
                      eyebrowHref={d.vendor?.slug ? `/vendor/${d.vendor.slug}` : undefined}
                      heading={d.service?.name ?? d.product?.name ?? d.title}
                      image={d.service?.image ?? d.product?.image ?? undefined}
                      imageAlt={d.service?.imageAlt ?? d.product?.imageAlt ?? undefined}
                      price={formatINR(Number(d.salePrice))}
                      originalPrice={
                        d.originalPrice && Number(d.originalPrice) !== Number(d.salePrice)
                          ? formatINR(Number(d.originalPrice))
                          : undefined
                      }
                      discount={d.discountPercent ? `-${d.discountPercent}%` : undefined}
                      href={d.service ? `/deal/${d.id}` : `/products/${d.id}`}
                      favorite
                      favoriteActive={isWishlisted(d.id)}
                      onFavorite={() => {
                        if (!requireAuthOrRedirect()) return;
                        void toggleWishlist(d.id);
                      }}
                    />
                  </swiper-slide>
                ))}
              </swiper-container>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

/** Date + time-slot picker for a service deal — same chip-based pattern as `category.tsx`'s
 *  `BookingDialog`, styled here as the page's primary CTA instead of an in-card action. */
function BookingDialog({ deal, name, onBook }: { deal: CatalogDeal; name: string; onBook: (date: string, time: string) => Promise<void> }) {
  const dialogRef = useRef<MdDialog>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!date || !time) {
      setError('Select a date and time.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onBook(date, time);
      dialogRef.current?.close();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not book this service.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <FilledButton className="deal-detail__add-btn" onClick={() => dialogRef.current?.show()}>
        <Icon slot="icon" aria-hidden="true">event_available</Icon>
        Book Now
      </FilledButton>
      <Dialog ref={dialogRef}>
        <div slot="headline">Book {deal.service?.name ?? deal.title}</div>
        <div slot="content" className="form-grid">
          <OutlinedTextField
            label="Date"
            type="date"
            value={date}
            onInput={(e: Event) => setDate((e.target as HTMLInputElement).value)}
          />
          <p className="field-hint">Time slot</p>
          <ChipSet aria-label="Select a time slot">
            {TIME_SLOTS.map((slot) => (
              <FilterChip key={slot} label={slot} selected={time === slot} onClick={() => setTime(slot)} />
            ))}
          </ChipSet>
          {error && <p className="error-state" role="alert">{error}</p>}
        </div>
        <div slot="actions">
          <TextButton onClick={() => dialogRef.current?.close()}>Cancel</TextButton>
          <FilledButton onClick={submit} disabled={submitting}>{submitting ? 'Booking…' : 'Confirm booking'}</FilledButton>
        </div>
      </Dialog>
    </>
  );
}

export default DealDetail;
