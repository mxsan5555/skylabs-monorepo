import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Divider,
  FilledButton,
  Icon,
  OutlinedIconButton,
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
import { useWishlist } from '../../../wishlist/wishlist-context';
import { SkyProductCardWC } from '../../components/sky-product-card-wc';
import { Breadcrumb } from '../../components/breadcrumb';
import { formatINR } from '../../../utils/format';
import { resolveDealMedia, primaryImage } from '../../../utils/media';
import content from '../../../content.json';

import './product-detail.css';

const { products } = content;

const SITE_URL =
  (import.meta.env['VITE_SITE_URL'] as string | undefined) ?? '';

/**
 * A single product-deal — GET /catalog/deals/:id.
 *
 * CatalogDeal unifies Service and Product as one Deal entity
 * (.product populated here).
 *
 * The backend does not expose the old flat Product shape, so this
 * page renders the fields available from Deal/Product:
 * title, description, images and price.
 */
export function ProductDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { token, isAuthenticated } = useAuth();

  const {
    has: isWishlisted,
    toggle: toggleWishlist,
    isPending: wishlistPending,
  } = useWishlist();

  const [deal, setDeal] = useState<CatalogDeal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [related, setRelated] = useState<CatalogDeal[]>([]);

  const [activeImg, setActiveImg] = useState(0);
  const [qty, setQty] = useState(1);
  const [addedToCart, setAddedToCart] = useState(false);
  const [addError, setAddError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) {
      setDeal(null);
      setError('Invalid product.');
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
        if (err instanceof ApiRequestError && err.status === 404) {
          setDeal(null);
          return;
        }

        setError(
          err instanceof ApiRequestError
            ? err.message
            : 'Could not load this product.',
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
      type: 'product',
      categoryId: deal.category.id,
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
        Loading product…
      </p>
    );
  }

  if (error || !deal) {
    return (
      <div className="product-detail product-detail--empty">
        <title>Product Not Found | MSD</title>

        <sky-info-card
          icon="search_off"
          heading="Product not found"
          subheading={
            error || 'This product may no longer be available.'
          }
        />

        <FilledButton onClick={() => navigate('/products')}>
          Browse Products
        </FilledButton>
      </div>
    );
  }

  const requireAuthOrRedirect = () => {
    if (isAuthenticated) {
      return true;
    }

    navigate(
      `/sign-in?next=${encodeURIComponent(`/products/${id}`)}`,
    );

    return false;
  };

  const name = deal.product?.name ?? deal.title;

  const dealMedia = resolveDealMedia(deal);
  const gallery = dealMedia.images;
  const video = dealMedia.video;

  const description =
    deal.description ??
    deal.shortDescription ??
    '';

  const salePrice = Number(deal.salePrice);

  const originalPrice = deal.originalPrice
    ? Number(deal.originalPrice)
    : undefined;

  const dealId = deal.id;

  async function handleAddToCart() {
    if (!requireAuthOrRedirect()) {
      return;
    }

    setAddError('');

    try {
      await addCartItem(token, dealId, qty);

      setAddedToCart(true);

      setTimeout(() => {
        setAddedToCart(false);
      }, 2000);
    } catch (err: unknown) {
      setAddError(
        err instanceof ApiRequestError
          ? err.message
          : 'Could not add to cart.',
      );
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(
        window.location.href,
      );

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setCopied(false);
    }
  }

  function toggleFavorite() {
    if (!requireAuthOrRedirect()) {
      return;
    }

    void toggleWishlist(dealId);
  }

  const seoName =
    name.length > 50
      ? `${name.slice(0, 47)}…`
      : name;

  const seoDesc = description
    ? `${description.slice(0, 120)} Shop now at MSD.`
    : `Shop ${name} at MSD.`;

  const canonicalUrl =
    `${SITE_URL}/products/${deal.id}`;

  return (
    <div className="product-detail">
      <title>{`${seoName} | MSD`}</title>

      <meta
        name="description"
        content={seoDesc}
      />

      <link
        rel="canonical"
        href={canonicalUrl}
      />

      <meta
        property="og:type"
        content="product"
      />

      <meta
        property="og:title"
        content={name}
      />

      <meta
        property="og:description"
        content={description.slice(0, 155)}
      />

      {gallery[0] && (
        <meta
          property="og:image"
          content={gallery[0]}
        />
      )}

      <meta
        property="og:url"
        content={canonicalUrl}
      />

      <meta
        name="twitter:card"
        content="summary_large_image"
      />

      <meta
        name="twitter:title"
        content={name}
      />

      <meta
        name="twitter:description"
        content={description.slice(0, 155)}
      />

      {gallery[0] && (
        <meta
          name="twitter:image"
          content={gallery[0]}
        />
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Product',
            name,
            description,
            image: gallery,
            brand: deal.product?.brand
              ? {
                  '@type': 'Brand',
                  name: deal.product.brand,
                }
              : undefined,
            sku: deal.id,
            offers: {
              '@type': 'Offer',
              price: salePrice,
              priceCurrency: 'INR',
              availability:
                'https://schema.org/InStock',
              url: canonicalUrl,
              seller: {
                '@type': 'Organization',
                name:
                  deal.vendor?.businessName ??
                  'MySpaDeal',
              },
            },
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
              {
                '@type': 'ListItem',
                position: 1,
                name: 'Home',
                item: `${SITE_URL}/`,
              },
              {
                '@type': 'ListItem',
                position: 2,
                name: 'Products',
                item: `${SITE_URL}/products`,
              },
              {
                '@type': 'ListItem',
                position: 3,
                name,
                item: canonicalUrl,
              },
            ],
          }),
        }}
      />

      {/* Breadcrumb */}
      <Breadcrumb
        className="product-detail__breadcrumb"
        items={[
          {
            label: 'Home',
            to: '/',
          },
          {
            label: 'Products',
            to: '/products',
          },
          {
            label: name,
          },
        ]}
      />

      <div className="product-detail__layout">
        {/* Gallery */}
        <div className="product-detail__gallery">
          <div className="product-detail__main-img-wrap">
            {gallery[activeImg] && (
              <img
                className="product-detail__main-img"
                src={gallery[activeImg]}
                alt={
                  deal.product?.imageAlt ??
                  name
                }
                width={600}
                height={600}
              />
            )}

            {deal.discountPercent && (
              <sky-badge
                className="product-detail__badge"
                variant="primary"
                aria-label={`${deal.discountPercent}% off`}
              >
                {deal.discountPercent}% OFF
              </sky-badge>
            )}
          </div>

          {gallery.length > 1 && (
            <div
              className="product-detail__thumbs"
              aria-label="Gallery thumbnails"
            >
              {gallery.map((img, index) => (
                <button
                  key={img + index}
                  type="button"
                  className={`product-detail__thumb${
                    index === activeImg
                      ? ' product-detail__thumb--active'
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
                    src={img}
                    alt=""
                    width={72}
                    height={72}
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          )}

          {video && (
            <video className="product-detail__video" controls src={video} />
          )}
        </div>

        {/* Info panel */}
        <div className="product-detail__info">
          {/* Badges */}
          <div className="product-detail__meta-row">
            {deal.product?.brand && (
              <sky-badge
                variant="secondary"
                size="small"
              >
                {deal.product.brand}
              </sky-badge>
            )}

            {deal.vendor?.businessName &&
              (deal.vendor.slug ? (
                <Link
                  to={`/vendor/${deal.vendor.slug}`}
                  className="product-detail__vendor-link"
                >
                  <sky-badge
                    variant="primary"
                    size="small"
                  >
                    {deal.vendor.businessName}
                  </sky-badge>
                </Link>
              ) : (
                <sky-badge
                  variant="primary"
                  size="small"
                >
                  {deal.vendor.businessName}
                </sky-badge>
              ))}
          </div>

          <h1 className="product-detail__title">
            {name}
          </h1>

          <Divider />

          {/* Price */}
          <div className="product-detail__price-row">
            <span className="product-detail__price">
              {formatINR(salePrice)}
            </span>

            {originalPrice !== undefined &&
              originalPrice !== salePrice && (
                <s
                  className="product-detail__original-price"
                  aria-label={`Original price ${formatINR(
                    originalPrice,
                  )}`}
                >
                  {formatINR(originalPrice)}
                </s>
              )}

            {deal.discountPercent && (
              <sky-badge
                variant="error"
                size="small"
              >
                {deal.discountPercent}% OFF
              </sky-badge>
            )}
          </div>

          <Divider />

          {/* Quantity */}
          <div
            className="product-detail__qty"
            role="group"
            aria-label={
              products.detail.quantityLabel
            }
          >
            <OutlinedIconButton
              aria-label="Decrease quantity"
              onClick={() =>
                setQty((currentQty) =>
                  Math.max(1, currentQty - 1),
                )
              }
              disabled={qty <= 1}
            >
              <Icon aria-hidden="true">
                remove
              </Icon>
            </OutlinedIconButton>

            <span
              className="product-detail__qty-value"
              aria-live="polite"
              aria-atomic="true"
            >
              {qty}
            </span>

            <OutlinedIconButton
              aria-label="Increase quantity"
              onClick={() =>
                setQty((currentQty) =>
                  Math.min(10, currentQty + 1),
                )
              }
              disabled={qty >= 10}
            >
              <Icon aria-hidden="true">
                add
              </Icon>
            </OutlinedIconButton>
          </div>

          {/* Action buttons */}
          <div className="product-detail__actions">
            <FilledButton
              className="product-detail__add-btn"
              onClick={handleAddToCart}
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
                : products.detail.addToCart}
            </FilledButton>

            {addError && (
              <p
                className="error-state"
                role="alert"
              >
                {addError}
              </p>
            )}

            {/* Stock + share */}
            <div className="product-detail__secondary-actions">
              <span className="product-detail__stock">
                <Icon
                  aria-hidden="true"
                  className="product-detail__stock-icon"
                >
                  check_circle
                </Icon>

                {products.detail.inStock}
              </span>

              <div
                className="product-detail__share"
                aria-label="Share"
              >
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

                <span className="product-detail__share-label">
                  Share
                </span>

                <OutlinedIconButton
                  aria-label={
                    copied
                      ? 'Link copied!'
                      : 'Copy product link'
                  }
                  onClick={copyLink}
                >
                  <Icon aria-hidden="true">
                    {copied ? 'check' : 'link'}
                  </Icon>
                </OutlinedIconButton>
              </div>
            </div>
          </div>

          {description && (
            <>
              <Divider />

              <sky-accordion
                single
                className="product-detail__accordion"
              >
                <sky-accordion-item
                  header={
                    products.detail
                      .accordionSummary
                  }
                  open
                >
                  <p className="product-detail__summary">
                    {description}
                  </p>
                </sky-accordion-item>
              </sky-accordion>
            </>
          )}
        </div>
      </div>

      {/* Related Products */}
      {related.length > 0 && (
        <section
          className="product-detail__related"
          aria-labelledby="related-products-heading"
        >
          <div className="product-detail__related-inner">
            <h2
              id="related-products-heading"
              className="product-detail__related-heading"
            >
              {products.detail.relatedProducts}
            </h2>

            <div className="product-detail__related-carousel">
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
                      heading={
                        item.product?.name ??
                        item.title
                      }
                      eyebrow={
                        item.product?.brand ??
                        item.vendor?.businessName ??
                        undefined
                      }
                      eyebrowHref={
                        !item.product?.brand &&
                        item.vendor?.slug
                          ? `/vendor/${item.vendor.slug}`
                          : undefined
                      }
                      image={primaryImage(resolveDealMedia(item))}
                      imageAlt={
                        item.product?.imageAlt ??
                        undefined
                      }
                      price={formatINR(
                        Number(item.salePrice),
                      )}
                      originalPrice={
                        item.originalPrice &&
                        Number(item.originalPrice) !==
                          Number(item.salePrice)
                          ? formatINR(
                              Number(
                                item.originalPrice,
                              ),
                            )
                          : undefined
                      }
                      discount={
                        item.discountPercent
                          ? `${item.discountPercent}% OFF`
                          : undefined
                      }
                      href={`/products/${item.id}`}
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

export default ProductDetail;