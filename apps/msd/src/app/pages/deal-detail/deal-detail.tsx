import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { MdDialog } from '@material/web/dialog/dialog.js';

import {
  Dialog,
  Divider,
  FilledButton,
  Icon,
  OutlinedIconButton,
  TextButton,
} from '@skylabs-monorepo/shared-ui/react';

import '@skylabs-monorepo/shared-ui/carousel';

import { useAuth } from '@skylabs-monorepo/shared-auth/react';

import {
  getCatalogDeal,
  listCatalogDeals,
  type CatalogDeal,
} from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { addCartItem } from '../../../api/cart';
import type { Booking } from '../../../api/bookings';
import { useWishlist } from '../../../wishlist/wishlist-context';

import { SkyProductCardWC } from '../../components/sky-product-card-wc';
import { Breadcrumb } from '../../components/breadcrumb';
import { DealBookingDialog } from '../../components/deal-booking-dialog';

import { formatINR, formatBookingSchedule, bookingDisplayName } from '../../../utils/format';
import content from '../../../content.json';

import './deal-detail.css';

/**
 * A single Deal — GET /catalog/deals/:id.
 *
 * Reachable for either a service deal (booking flow)
 * or a product deal (cart flow).
 *
 * /category/:slug links service deals here.
 * Product deals link to /products/:id.
 */
export function DealDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { token, isAuthenticated } = useAuth();

  const {
    has: isWishlisted,
    toggle: toggleWishlist,
    isPending: wishlistPending,
  } = useWishlist();

  const { dealDetail } = content;

  const [deal, setDeal] = useState<CatalogDeal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [related, setRelated] = useState<CatalogDeal[]>([]);

  const [activeImg, setActiveImg] = useState(0);
  const [addedToCart, setAddedToCart] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);
  const resultDialogRef = useRef<MdDialog>(null);

  useEffect(() => {
    if (confirmedBooking) {
      resultDialogRef.current?.show();
    }
  }, [confirmedBooking]);

  useEffect(() => {
    if (!id) {
      setDeal(null);
      setError('Invalid deal.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    setActiveImg(0);

    getCatalogDeal(id)
      .then(({ data }) => {
        setDeal(data);
      })
      .catch((err: unknown) => {
        if (
          err instanceof ApiRequestError &&
          err.status === 404
        ) {
          setDeal(null);
          return;
        }

        setError(
          err instanceof ApiRequestError
            ? err.message
            : 'Could not load this deal.',
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (!deal?.category?.id) {
      setRelated([]);
      return;
    }

    listCatalogDeals({
      categoryId: deal.category.id,
      type: deal.service ? 'service' : 'product',
      pageSize: 7,
    })
      .then(({ data }) => {
        setRelated(
          data
            .filter((item) => item.id !== deal.id)
            .slice(0, 6),
        );
      })
      .catch(() => {
        setRelated([]);
      });
  }, [deal]);

  if (loading) {
    return (
      <p className="loading-state">
        Loading deal…
      </p>
    );
  }

  if (error || !deal) {
    return (
      <div className="deal-detail deal-detail--empty">
        <title>Deal Not Found | MSD</title>

        <sky-info-card
          icon="search_off"
          heading="Deal not found"
          subheading={
            error ||
            'This deal may no longer be available.'
          }
        />

        <FilledButton
          type="button"
          onClick={() => navigate('/categories')}
        >
          Browse Categories
        </FilledButton>
      </div>
    );
  }

  const requireAuthOrRedirect = () => {
    if (isAuthenticated) {
      return true;
    }

    navigate(
      `/sign-in?next=${encodeURIComponent(`/deal/${id}`)}`,
    );

    return false;
  };

  const name =
    deal.service?.name ??
    deal.product?.name ??
    deal.title;

  const gallery =
    deal.images?.length
      ? deal.images
      : [
          deal.service?.image ??
            deal.product?.image,
        ].filter(
          (image): image is string =>
            Boolean(image),
        );

  const description =
    deal.description ??
    deal.shortDescription ??
    '';

  const salePrice = Number(deal.salePrice);

  const originalPrice =
    deal.originalPrice != null
      ? Number(deal.originalPrice)
      : undefined;

  const discountPct =
    deal.discountPercent ??
    (originalPrice !== undefined &&
    originalPrice > salePrice
      ? Math.round(
          ((originalPrice - salePrice) /
            originalPrice) *
            100,
        )
      : 0);

  const dealId = deal.id;

  async function addToCart() {
    if (!requireAuthOrRedirect()) {
      return;
    }

    setActionError('');
    setActionMessage('');

    try {
      await addCartItem(token, dealId, 1);

      setAddedToCart(true);

      setTimeout(() => {
        setAddedToCart(false);
      }, 2000);
    } catch (err: unknown) {
      setActionError(
        err instanceof ApiRequestError
          ? err.message
          : 'Could not add to cart.',
      );
    }
  }

  function toggleFavorite() {
    if (!requireAuthOrRedirect()) {
      return;
    }

    void toggleWishlist(dealId);
  }

  return (
    <div className="deal-detail">
      <title>
        {`${name} – ${
          deal.vendor?.businessName ?? 'MSD'
        } | MSD`}
      </title>

      <meta
        name="description"
        content={`${
          description ||
          `Book ${name} at MSD.`
        } ${formatINR(salePrice)}${
          deal.branch?.city
            ? ` in ${deal.branch.city}`
            : ''
        }.`}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': deal.service
              ? 'Service'
              : 'Product',
            name,
            description,
            provider:
              deal.vendor?.businessName
                ? {
                    '@type': 'Organization',
                    name: deal.vendor.businessName,
                  }
                : undefined,
            offers: {
              '@type': 'Offer',
              price: salePrice,
              priceCurrency: 'INR',
              availability:
                'https://schema.org/InStock',
            },
          }),
        }}
      />

      {/* Breadcrumb */}
      <Breadcrumb
        className="deal-detail__breadcrumb"
        items={[
          {
            label: 'Home',
            to: '/',
          },
          ...(deal.category
            ? [
                {
                  label: deal.category.name,
                  to: `/category/${deal.category.slug}`,
                },
              ]
            : []),
          {
            label: name,
          },
        ]}
      />

      <div className="deal-detail__layout">
        {/* Gallery */}
        <div className="deal-detail__gallery">
          <div className="deal-detail__main-img-wrap">
            {gallery[activeImg] && (
              <img
                className="deal-detail__main-img"
                src={gallery[activeImg]}
                alt={
                  deal.service?.imageAlt ??
                  deal.product?.imageAlt ??
                  name
                }
                width={800}
                height={450}
              />
            )}

            {discountPct > 0 && (
              <span
                className="deal-detail__badge"
                aria-label={`${discountPct}% off`}
              >
                {discountPct}% OFF
              </span>
            )}
          </div>

          {gallery.length > 1 && (
            <div
              className="deal-detail__thumbs"
              aria-label="Gallery thumbnails"
            >
              {gallery.map((image, index) => (
                <button
                  key={`${image}-${index}`}
                  type="button"
                  className={`deal-detail__thumb${
                    index === activeImg
                      ? ' deal-detail__thumb--active'
                      : ''
                  }`}
                  onClick={() =>
                    setActiveImg(index)
                  }
                  aria-label={`View image ${
                    index + 1
                  }`}
                  aria-pressed={
                    index === activeImg
                  }
                >
                  <img
                    src={image}
                    alt=""
                    width={80}
                    height={60}
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info panel */}
        <div className="deal-detail__info">
          {/* Provider + category */}
          <div className="deal-detail__meta-row">
            {deal.vendor?.businessName &&
              (deal.vendor.slug ? (
                <Link
                  to={`/vendor/${deal.vendor.slug}`}
                  className="deal-detail__provider"
                >
                  {deal.vendor.businessName}
                </Link>
              ) : (
                <span className="deal-detail__provider">
                  {deal.vendor.businessName}
                </span>
              ))}

            {deal.category && (
              <sky-badge
                variant="secondary"
                size="small"
              >
                {deal.category.name}
              </sky-badge>
            )}

            <sky-badge
              variant="primary"
              size="small"
            >
              {deal.service
                ? 'Service'
                : 'Product'}
            </sky-badge>
          </div>

          <h1 className="deal-detail__title">
            {name}
          </h1>

          {(deal.branch?.city ||
            deal.branch?.address) && (
            <p
              className="deal-detail__dist"
              aria-label="Location"
            >
              <Icon aria-hidden="true">
                near_me
              </Icon>

              {[
                deal.branch?.name,
                deal.branch?.address ??
                  deal.branch?.city,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}

          <Divider />

          {/* Price */}
          <div className="deal-detail__price-row">
            <div>
              <span className="deal-detail__price">
                {formatINR(salePrice)}
              </span>
            </div>

            {originalPrice !== undefined &&
              originalPrice !== salePrice && (
                <div className="deal-detail__original">
                  <s
                    className="deal-detail__original-price"
                    aria-label={`Original price ${formatINR(
                      originalPrice,
                    )}`}
                  >
                    {formatINR(originalPrice)}
                  </s>

                  {discountPct > 0 && (
                    <sky-badge
                      variant="error"
                      size="small"
                    >
                      {discountPct}% OFF
                    </sky-badge>
                  )}
                </div>
              )}
          </div>

          {/* Duration */}
          {deal.durationMinutes != null &&
            deal.durationMinutes > 0 && (
              <p className="deal-detail__duration">
                <Icon aria-hidden="true">
                  schedule
                </Icon>

                {deal.durationMinutes} min
              </p>
            )}

          {/* CTA */}
          <div className="deal-detail__cta">
            {deal.service ? (
              <DealBookingDialog
                deal={deal}
                onBooked={(booking, intent) => {
                  if (intent === 'cart') {
                    setActionMessage(`Added "${name}" to your cart.`);
                  } else {
                    setConfirmedBooking(booking);
                  }
                }}
                renderTrigger={(open) => (
                  <FilledButton
                    type="button"
                    className="deal-detail__add-btn"
                    onClick={() => {
                      if (requireAuthOrRedirect()) open();
                    }}
                  >
                    <Icon slot="icon" aria-hidden="true">event_available</Icon>
                    Book Now
                  </FilledButton>
                )}
              />
            ) : (
              <FilledButton
                type="button"
                className="deal-detail__add-btn"
                onClick={addToCart}
              >
                <Icon
                  slot="icon"
                  aria-hidden="true"
                >
                  {addedToCart
                    ? 'check'
                    : 'shopping_bag'}
                </Icon>

                {addedToCart
                  ? 'Added to Cart!'
                  : dealDetail.addToCart}
              </FilledButton>
            )}

            <OutlinedIconButton
              aria-label={
                isWishlisted(dealId)
                  ? 'Remove from wishlist'
                  : 'Save to wishlist'
              }
              aria-pressed={isWishlisted(
                dealId,
              )}
              disabled={wishlistPending(
                dealId,
              )}
              onClick={toggleFavorite}
            >
              <Icon aria-hidden="true">
                {isWishlisted(dealId)
                  ? 'favorite'
                  : 'favorite_border'}
              </Icon>
            </OutlinedIconButton>
          </div>

          {actionMessage && (
            <p
              className="field-hint"
              role="status"
            >
              {actionMessage}
            </p>
          )}

          {actionError && (
            <p
              className="error-state"
              role="alert"
            >
              {actionError}
            </p>
          )}

          <Dialog
            ref={resultDialogRef}
            onClose={() => setConfirmedBooking(null)}
          >
            {confirmedBooking && (
              <>
                <span slot="headline">Booking confirmed successfully.</span>
                <div slot="content" className="form-grid">
                  <p>
                    <strong>
                      {bookingDisplayName(confirmedBooking)}
                    </strong>
                  </p>
                  {confirmedBooking.vendor.businessName && (
                    <p>{confirmedBooking.vendor.businessName}</p>
                  )}
                  <p>{confirmedBooking.branch.name}</p>
                  <p>{formatBookingSchedule(confirmedBooking.bookingDate, confirmedBooking.timeSlot)}</p>
                  {confirmedBooking.therapist && (
                    <p>Therapist: {confirmedBooking.therapist.therapistType} — {confirmedBooking.therapist.personName}</p>
                  )}
                  <p className="field-hint">Booking ID: {confirmedBooking.id}</p>
                </div>
              </>
            )}
            <div slot="actions">
              <TextButton
                type="button"
                onClick={() => navigate('/categories')}
              >
                Continue Shopping
              </TextButton>
              <FilledButton
                type="button"
                onClick={() => navigate('/bookings')}
              >
                View Booking
              </FilledButton>
            </div>
          </Dialog>

          <Divider />

          {/* Description + policy */}
          <sky-accordion>
            {description && (
              <sky-accordion-item
                header="Description"
                open
              >
                <p className="deal-detail__desc">
                  {description}
                </p>
              </sky-accordion-item>
            )}

            <sky-accordion-item
              header={
                dealDetail.cancellationPolicy
              }
            >
              <p className="deal-detail__policy">
                {dealDetail.cancellationText}
              </p>
            </sky-accordion-item>
          </sky-accordion>
        </div>
      </div>

      {/* Related Deals */}
      {related.length > 0 && (
        <section
          className="deal-detail__related"
          aria-labelledby="related-heading"
        >
          <div className="deal-detail__related-inner">
            <h2
              id="related-heading"
              className="deal-detail__related-heading"
            >
              {dealDetail.relatedDeals}
            </h2>

            <div className="deal-detail__related-carousel">
              <swiper-container
                slides-per-view="auto"
                space-between={16}
                free-mode="true"
                grab-cursor="true"
              >
                {related.map((item) => (
                  <swiper-slide
                    key={item.id}
                    style={{
                      width: '260px',
                      height: 'auto',
                    }}
                  >
                    <SkyProductCardWC
                      variant="outlined"
                      badge={
                        item.service
                          ? 'Service'
                          : 'Product'
                      }
                      eyebrow={
                        item.vendor
                          ?.businessName ??
                        undefined
                      }
                      eyebrowHref={
                        item.vendor?.slug
                          ? `/vendor/${item.vendor.slug}`
                          : undefined
                      }
                      heading={
                        item.service?.name ??
                        item.product?.name ??
                        item.title
                      }
                      image={
                        item.service?.image ??
                        item.product?.image ??
                        undefined
                      }
                      imageAlt={
                        item.service?.imageAlt ??
                        item.product?.imageAlt ??
                        undefined
                      }
                      price={formatINR(
                        Number(
                          item.salePrice,
                        ),
                      )}
                      originalPrice={
                        item.originalPrice !=
                          null &&
                        Number(
                          item.originalPrice,
                        ) !==
                          Number(
                            item.salePrice,
                          )
                          ? formatINR(
                              Number(
                                item.originalPrice,
                              ),
                            )
                          : undefined
                      }
                      discount={
                        item.discountPercent
                          ? `-${item.discountPercent}%`
                          : undefined
                      }
                      href={
                        item.service
                          ? `/deal/${item.id}`
                          : `/products/${item.id}`
                      }
                      favorite
                      favoriteActive={isWishlisted(
                        item.id,
                      )}
                      onFavorite={() => {
                        if (
                          !requireAuthOrRedirect()
                        ) {
                          return;
                        }

                        void toggleWishlist(
                          item.id,
                        );
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

export default DealDetail;