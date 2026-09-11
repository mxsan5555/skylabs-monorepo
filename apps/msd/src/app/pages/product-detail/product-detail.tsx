import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Divider, FilledButton, Icon, OutlinedIconButton, } from '@skylabs-monorepo/shared-ui/react';
import '@skylabs-monorepo/shared-ui/carousel';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getCatalogProduct, listCatalogProducts, type CatalogProduct, } from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { addCartItem } from '../../../api/cart';
import { SkyProductCardWC } from '../../components/sky-product-card-wc';
import { Breadcrumb } from '../../components/breadcrumb';
import { formatINR } from '../../../utils/format';
import { resolveProductMedia, primaryImage } from '../../../utils/media';
import content from '../../../content.json';
import './product-detail.css';

const { products } = content;
const SITE_URL = (import.meta.env['VITE_SITE_URL'] as string | undefined) ?? '';

/**
 * A single Product — GET /catalog/products/:id. Product is a fully independent,
 * directly-purchasable catalog entity now (see msd-api's Product schema doc comment), never a
 * Deal. Cannot be wishlisted — `WishlistItem` only supports a Deal (see its own schema doc
 * comment), matching today's status quo for a bare Product.
 */
export function ProductDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token, isAuthenticated } = useAuth();
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [related, setRelated] = useState<CatalogProduct[]>([]);
  const [activeImg, setActiveImg] = useState(0);
  const [qty, setQty] = useState(1);
  const [addedToCart, setAddedToCart] = useState(false);
  const [addError, setAddError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) {
      setProduct(null);
      setError(products.detail.errors.invalidProduct);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    setActiveImg(0);

    getCatalogProduct(id)
      .then(({ data }) => {
        setProduct(data);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiRequestError && err.status === 404) {
          setProduct(null);
          return;
        }

        setError(
          err instanceof ApiRequestError
            ? err.message
            : products.detail.errors.loadProduct,
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (!product?.category?.id) {
      setRelated([]);
      return;
    }

    listCatalogProducts({
      categoryId: product.category.id,
      pageSize: 7,
    })
      .then(({ data }) => {
        setRelated(
          data
            .filter((item) => item.id !== product.id)
            .slice(0, 6),
        );
      })
      .catch(() => {
        setRelated([]);
      });
  }, [product]);

  if (loading) {
    return (
      <p className="loading-state"> {products.detail.loading}</p>
    );
  }

  if (error || !product) {
    return (
      <div className="product-detail product-detail--empty">
        <title>{products.detail.notFound.metaTitle}</title>

        <sky-info-card
          icon="search_off"
          heading={products.detail.notFound.heading}
          subheading={
            error || products.detail.notFound.subheading
          }
        />

        <FilledButton onClick={() => navigate('/products')}>
          {products.detail.notFound.cta}
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

  const name = product.name;

  const productMedia = resolveProductMedia(product);
  const gallery = productMedia.images;
  const video = productMedia.video;

  const description = product.description ?? product.summary ?? '';

  const salePrice = Number(product.price);

  const originalPrice = product.originalPrice
    ? Number(product.originalPrice)
    : undefined;

  const productId = product.id;

  async function handleAddToCart() {
    if (!requireAuthOrRedirect()) {
      return;
    }

    setAddError('');

    try {
      await addCartItem(token, { productId, quantity: qty });

      setAddedToCart(true);

      setTimeout(() => {
        setAddedToCart(false);
      }, 2000);
    } catch (err: unknown) {
      setAddError(
        err instanceof ApiRequestError
          ? err.message
          : products.detail.errors.addToCart,
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

  const seoName =
    name.length > 50
      ? `${name.slice(0, 47)}…`
      : name;

  const seoDesc = description
    ? `${description.slice(0, 120)} Shop now at MSD.`
    : `Shop ${name} at MSD.`;

  const canonicalUrl =
    `${SITE_URL}/products/${product.id}`;

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
            brand: product.brand
              ? {
                '@type': 'Brand',
                name: product.brand,
              }
              : undefined,
            sku: product.id,
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
                  product.vendor?.businessName ??
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
            label: products.detail.breadcrumb.home,
            to: '/',
          },
          {
            label: products.detail.breadcrumb.products,
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
                  product.imageAlt ??
                  name
                }
                width={600}
                height={600}
              />
            )}

            {product.discount && (
              <sky-badge
                className="product-detail__badge"
                variant="primary"
                aria-label={`${product.discount}% ${products.detail.offSuffix}`}
              >
                {product.discount}% {products.detail.offSuffix}
              </sky-badge>
            )}
          </div>

          {gallery.length > 1 && (
            <div
              className="product-detail__thumbs"
              aria-label={products.detail.gallery.thumbnailsLabel}
            >
              {gallery.map((img, index) => (
                <button
                  key={img + index}
                  type="button"
                  className={`product-detail__thumb${index === activeImg
                    ? ' product-detail__thumb--active'
                    : ''
                    }`}
                  onClick={() =>
                    setActiveImg(index)
                  }
                  aria-label={`${products.detail.gallery.viewImage} ${index + 1}`}
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
            {product.brand && (
              <sky-badge
                variant="secondary"
                size="small"
              >
                {product.brand}
              </sky-badge>
            )}

            {product.vendor?.businessName &&
              (product.vendor.slug ? (
                <Link
                  to={`/vendor/${product.vendor.slug}`}
                  className="product-detail__vendor-link"
                >
                  <sky-badge
                    variant="primary"
                    size="small"
                  >
                    {product.vendor.businessName}
                  </sky-badge>
                </Link>
              ) : (
                <sky-badge
                  variant="primary"
                  size="small"
                >
                  {product.vendor.businessName}
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
                  aria-label={`${products.detail.originalPrice} ${formatINR(originalPrice)}`}
                >
                  {formatINR(originalPrice)}
                </s>
              )}

            {product.discount && (
              <sky-badge
                variant="error"
                size="small"
              >
                {product.discount}% OFF
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
              aria-label={products.detail.decreaseQuantity}
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
              aaria-label={products.detail.increaseQuantity}
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
            <div className="product-detail__primary-actions">
              <FilledButton
                className="product-detail__add-btn"
                onClick={handleAddToCart}
              >
                <Icon slot="icon" aria-hidden="true">
                  {addedToCart ? 'check' : 'shopping_bag'}
                </Icon>

                {addedToCart
                  ? products.detail.addedToCart
                  : products.detail.addToCart}
              </FilledButton>

              <OutlinedIconButton
                className="product-detail__action-icon"
                aria-label={
                  copied
                    ? products.detail.linkCopied
                    : products.detail.copyProductLink
                }
                onClick={copyLink}
              >
                <Icon aria-hidden="true">
                  {copied ? 'check' : 'link'}
                </Icon>
              </OutlinedIconButton>
            </div>

            {addError && (
              <p className="error-state" role="alert">
                {addError}
              </p>
            )}

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
                      heading={item.name}
                      eyebrow={
                        item.brand ??
                        item.vendor?.businessName ??
                        undefined
                      }
                      eyebrowHref={
                        !item.brand &&
                          item.vendor?.slug
                          ? `/vendor/${item.vendor.slug}`
                          : undefined
                      }
                      image={primaryImage(resolveProductMedia(item))}
                      imageAlt={item.imageAlt ?? undefined}
                      price={formatINR(
                        Number(item.price),
                      )}
                      originalPrice={
                        item.originalPrice &&
                          Number(item.originalPrice) !==
                          Number(item.price)
                          ? formatINR(
                            Number(
                              item.originalPrice,
                            ),
                          )
                          : undefined
                      }
                      discount={
                        item.discount
                          ? `${item.discount}% OFF`
                          : undefined
                      }
                      href={`/products/${item.id}`}
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