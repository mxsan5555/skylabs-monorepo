import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FilledButton,
  OutlinedIconButton,
  Icon,
  Divider,
} from '@skylabs-monorepo/shared-ui/react';
import '@skylabs-monorepo/shared-ui/carousel';
import { useCart } from '../../../cart/cart-context';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { getDealById, DEALS } from '../../../data/deals';
import { getCategoryBySlug } from '../../../data/categories';
import { DealCard } from '../../components/deal-card';
import { Breadcrumb } from '../../components/breadcrumb';
import { formatINR } from '../../../utils/format';
import content from '../../../content.json';
import './deal-detail.css';
import { useAuth } from '../../../auth/auth-context';

export function DealDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { addItem } = useCart();
  const { toggle, has } = useWishlist();
  const [activeImg, setActiveImg] = useState(0);
  const [addedToCart, setAddedToCart] = useState(false);

  const deal = getDealById(id);
  const { dealDetail } = content;

  if (!deal) {
    return (
      <div className="deal-detail deal-detail--empty">
        <title>Deal Not Found | MSD</title>
        <sky-info-card
          icon="search_off"
          heading="Deal not found"
          subheading="This deal may no longer be available."
        />
        <FilledButton onClick={() => navigate('/explore')}>Explore Deals</FilledButton>
      </div>
    );
  }
  const currentDeal = deal;
  const category = getCategoryBySlug(deal.categorySlug);
  const related = DEALS.filter(
    (d) => d.categorySlug === deal.categorySlug && d.id !== deal.id,
  ).slice(0, 6);
  function handleFavorite(id: string) {
    if (!isAuthenticated) {
      navigate('/sign-in');
      return;
    }

    toggle(id);
  }
  function handleAddToCart() {
    if (!isAuthenticated) {
      navigate('/sign-in');
      return;
    }
    addItem(currentDeal.id, 'deal');
    setAddedToCart(true);
    setTimeout(() => { setAddedToCart(false); }, 2000);
  }

  const discountPct = deal.originalPrice
    ? Math.round(((deal.originalPrice - deal.price) / deal.originalPrice) * 100)
    : 0;

  return (
    <div className="deal-detail">
      <title>{`${deal.title} – ${deal.providerName} | MSD`}</title>
      <meta
        name="description"
        content={`${deal.description} Book ${deal.title} at ${deal.providerName} for ${formatINR(deal.price)}. Rated ${deal.rating}/5 by ${deal.reviews} customers.`}
      />

      {/* JSON-LD LocalBusiness schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'LocalBusiness',
            name: deal.providerName,
            description: deal.description,
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: deal.rating,
              reviewCount: deal.reviews,
            },
          }),
        }}
      />

      {/* ── Breadcrumb ─────────────────────────────────────────────────── */}
      <Breadcrumb
        className="deal-detail__breadcrumb"
        items={[
          { label: 'Home', to: '/' },
          ...(category ? [{ label: category.name, to: `/category/${category.slug}` }] : []),
          { label: deal.title },
        ]}
      />

      <div className="deal-detail__layout">
        {/* ── Gallery ────────────────────────────────────────────────────── */}
        <div className="deal-detail__gallery">
          <div className="deal-detail__main-img-wrap">
            <img
              className="deal-detail__main-img"
              src={deal.gallery?.[activeImg] ?? deal.image}
              alt={deal.imageAlt}
              width={800}
              height={450}
            />
            {deal.badge && (
              <span className="deal-detail__badge" aria-label={`Deal badge: ${deal.badge}`}>
                {deal.badge}
              </span>
            )}
          </div>
          {(deal.gallery?.length ?? 0) > 1 && (
            <div className="deal-detail__thumbs" aria-label="Gallery thumbnails">
              {deal.gallery?.map((img, i) => (
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
          {/* Provider + status */}
          <div className="deal-detail__meta-row">
            <button type="button" className="deal-detail__provider"
              onClick={() => navigate(`/vendor/${deal.providerSlug}`)}
            >
              {deal.providerName}
            </button>
            {category && (
              <sky-badge variant="secondary" size="small">
                {category.name}
              </sky-badge>
            )}
            <sky-badge
              variant={deal.isOpen ? 'primary' : 'error'}
              size="small"
            >
              {deal.isOpen ? 'Open' : 'Closed'}
            </sky-badge>
          </div>

          <h1 className="deal-detail__title">{deal.title}</h1>

          {/* Rating + distance */}
          <div className="deal-detail__rating-row">
            <span className="deal-detail__rating" aria-label={`Rating: ${deal.rating} out of 5`}>
              <Icon aria-hidden="true" className="deal-detail__star">star</Icon>
              <strong>{deal.rating}</strong>
              <span className="deal-detail__reviews">({deal.reviews.toLocaleString()} reviews)</span>
            </span>
            <span className="deal-detail__dist" aria-label={`${deal.distance} km away`}>
              <Icon aria-hidden="true">near_me</Icon>
              {deal.distance} km · {deal.location}
            </span>
          </div>

          <Divider />

          {/* Price */}
          <div className="deal-detail__price-row">
            <div>
              <span className="deal-detail__price">{formatINR(deal.price)}</span>
              <span className="deal-detail__price-unit"> / {deal.priceUnit}</span>
            </div>
            {deal.originalPrice && (
              <div className="deal-detail__original">
                <s className="deal-detail__original-price" aria-label={`Original price ${formatINR(deal.originalPrice)}`}>
                  {formatINR(deal.originalPrice)}
                </s>
                <sky-badge variant="error" size="small">
                  {discountPct}% OFF
                </sky-badge>
              </div>
            )}
          </div>

          {/* Duration + price level */}
          <p className="deal-detail__duration">
            <Icon aria-hidden="true">schedule</Icon>
            {deal.duration} {deal.durationUnit}
            <span className="deal-detail__price-level" aria-label={`Price level: ${deal.priceLevel}`}>
              {deal.priceLevel}
            </span>
          </p>

          {/* CTA row */}
          <div className="deal-detail__cta">
            <FilledButton
              className="deal-detail__add-btn"
              onClick={handleAddToCart}
              disabled={!deal.isOpen}
            >
              <Icon slot="icon" aria-hidden="true">
                {addedToCart ? 'check' : 'shopping_bag'}
              </Icon>
              {addedToCart ? 'Added to Cart!' : dealDetail.addToCart}
            </FilledButton>
            <OutlinedIconButton
              toggle
              selected={isAuthenticated && has(deal.id)}
              aria-label={isAuthenticated && has(deal.id) ? 'Remove from wishlist' : 'Save to wishlist'}
              onClick={() => handleFavorite(deal.id)}
            >
              <Icon aria-hidden="true" slot="selected">favorite</Icon>
              <Icon aria-hidden="true">favorite_border</Icon>
            </OutlinedIconButton>
          </div>

          {/* Features */}
          {deal.features.length > 0 && (
            <div className="deal-detail__features" aria-label="Available features">
              {deal.features.map((f) => (
                <span key={f} className="deal-detail__feature-tag">
                  <Icon aria-hidden="true">check_circle</Icon>
                  {f}
                </span>
              ))}
            </div>
          )}

          <Divider />

          {/* Description */}
          <p className="deal-detail__desc">{deal.description}</p>

          {/* Accordion */}
          <sky-accordion>
            <sky-accordion-item header={dealDetail.whatIncluded} open>
              <ul className="deal-detail__list">
                {deal.included.map((item) => (
                  <li key={item} className="deal-detail__list-item">
                    <Icon aria-hidden="true">check</Icon>
                    {item}
                  </li>
                ))}
              </ul>
            </sky-accordion-item>

            <sky-accordion-item header={dealDetail.howToUse}>
              <ol className="deal-detail__list deal-detail__list--ordered">
                {deal.howToUse.map((step, i) => (
                  <li key={i} className="deal-detail__list-item">
                    <span className="deal-detail__step-num" aria-hidden="true">{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </sky-accordion-item>

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
                    <DealCard
                      deal={d}
                      favoriteActive={isAuthenticated && has(d.id)}
                      onFavorite={() => handleFavorite(d.id)}
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

export default DealDetail;
