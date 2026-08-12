import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  FilledButton,
  OutlinedIconButton,
  Icon,
  Divider,
} from '@skylabs-monorepo/shared-ui/react';
import '@skylabs-monorepo/shared-ui/carousel';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getCatalogDeal, listCatalogDeals, type CatalogDeal } from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { addCartItem } from '../../../api/cart';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { SkyProductCardWC } from '../../components/sky-product-card-wc';
import { Breadcrumb } from '../../components/breadcrumb';
import { formatINR } from '../../../utils/format';
import content from '../../../content.json';
import './product-detail.css';
import { useAuth } from '../../../auth/auth-context';

const { products } = content;
const SITE_URL: string = (import.meta.env['VITE_SITE_URL'] as string | undefined) ?? '';

/**
 * A single product-deal — `GET /catalog/deals/:id`. `CatalogDeal` unifies Service and Product
 * as one Deal entity (`.product` populated here); there is no separate flat "Product" backend
 * record, so unlike the previous mock `data/products.ts` shape this page has no
 * benefits/howToUse/ingredients/returnPolicy fields to render — only what the Deal/Product
 * summary actually carries (title, description, images, price).
 */
export function ProductDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token, isAuthenticated } = useAuth();
  const { has: isWishlisted, toggle: toggleWishlist, isPending: wishlistPending } = useWishlist();

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
    setLoading(true);
    setError('');
    setActiveImg(0);
    getCatalogDeal(id)
      .then(({ data }) => setDeal(data))
      .catch((err) => {
        if (err instanceof ApiRequestError && err.status === 404) {
          setDeal(null);
        } else {
          setError(err instanceof ApiRequestError ? err.message : 'Could not load this product.');
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!deal?.category?.id) {
      setRelated([]);
      return;
    }
    listCatalogDeals({ type: 'product', categoryId: deal.category.id, pageSize: 7 })
      .then(({ data }) => setRelated(data.filter((d) => d.id !== deal.id).slice(0, 6)))
      .catch(() => setRelated([]));
  }, [deal]);

  if (loading) {
    return <p className="loading-state">Loading product…</p>;
  }

  if (error || !deal) {
    return (
      <div className="product-detail product-detail--empty">
        <title>Product Not Found | MSD</title>
        <sky-info-card
          icon="search_off"
          heading="Product not found"
          subheading={error || 'This product may no longer be available.'}
        />
        <FilledButton onClick={() => navigate('/products')}>Browse Products</FilledButton>
      </div>
    );
  }

  const requireAuthOrRedirect = () => {
    if (isAuthenticated) return true;
    navigate(`/sign-in?next=${encodeURIComponent(`/products/${id}`)}`);
    return false;
  };

  const name = deal.product?.name ?? deal.title;
  const gallery = deal.images ?? (deal.product?.image ? [deal.product.image] : []);
  const description = deal.description ?? deal.shortDescription ?? '';
  const salePrice = Number(deal.salePrice);
  const originalPrice = deal.originalPrice ? Number(deal.originalPrice) : undefined;
  const dealId = deal.id;

  async function handleAddToCart() {
    if (!requireAuthOrRedirect()) return;
    setAddError('');
    try {
      await addCartItem(token, dealId, qty);
      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 2000);
    } catch (err) {
      setAddError(err instanceof ApiRequestError ? err.message : 'Could not add to cart.');
    }
  }
  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function toggleFavorite() {
    if (!requireAuthOrRedirect()) return;
    void toggleWishlist(dealId);
  }

  const seoName = name.length > 50 ? `${name.slice(0, 47)}…` : name;
  const seoDesc = description ? `${description.slice(0, 120)} Shop now at MSD.` : `Shop ${name} at MSD.`;
  const canonicalUrl = `${SITE_URL}/products/${deal.id}`;

  return (
    <div className="product-detail">
      <title>{`${seoName} | MSD`}</title>
      <meta name="description" content={seoDesc} />
      <link rel="canonical" href={canonicalUrl} />
      <meta property="og:type" content="product" />
      <meta property="og:title" content={name} />
      <meta property="og:description" content={description.slice(0, 155)} />
      {gallery[0] && <meta property="og:image" content={gallery[0]} />}
      <meta property="og:url" content={canonicalUrl} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={name} />
      <meta name="twitter:description" content={description.slice(0, 155)} />
      {gallery[0] && <meta name="twitter:image" content={gallery[0]} />}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Product',
            name,
            description,
            image: gallery,
            brand: deal.product?.brand ? { '@type': 'Brand', name: deal.product.brand } : undefined,
            sku: deal.id,
            offers: {
              '@type': 'Offer',
              price: salePrice,
              priceCurrency: 'INR',
              availability: 'https://schema.org/InStock',
              url: canonicalUrl,
              seller: { '@type': 'Organization', name: deal.vendor?.businessName ?? 'MySpaDeal' },
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
              { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
              { '@type': 'ListItem', position: 2, name: 'Products', item: `${SITE_URL}/products` },
              { '@type': 'ListItem', position: 3, name, item: canonicalUrl },
            ],
          }),
        }}
      />
      {/* ── Breadcrumb ─────────────────────────────────────────────────────── */}
      <Breadcrumb
        className="product-detail__breadcrumb"
        items={[
          { label: 'Home', to: '/' },
          { label: 'Products', to: '/products' },
          { label: name },
        ]}
      />
      <div className="product-detail__layout">
        {/* ── Gallery ────────────────────────────────────────────────────── */}
        <div className="product-detail__gallery">
          <div className="product-detail__main-img-wrap">
            {gallery[activeImg] && (
              <img
                className="product-detail__main-img"
                src={gallery[activeImg]}
                alt={deal.product?.imageAlt ?? name}
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
            )} */}
          </div>
          {gallery.length > 1 && (
            <div className="product-detail__thumbs" aria-label="Gallery thumbnails">
              {gallery.map((img, i) => (
                <button
                  key={i}
                  className={`product-detail__thumb${i === activeImg ? ' product-detail__thumb--active' : ''}`}
                  onClick={() => setActiveImg(i)}
                  aria-label={`View image ${i + 1}`}
                  aria-pressed={i === activeImg}
                >
                  <img src={img} alt="" width={72} height={72} loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Info panel ──────────────────────────────────────────────────── */}
        <div className="product-detail__info">
          {/* Badges */}
          <div className="product-detail__meta-row">
            {deal.product?.brand && <sky-badge variant="secondary" size="small">{deal.product.brand}</sky-badge>}
            {deal.vendor?.businessName && (
              deal.vendor.slug ? (
                <Link to={`/vendor/${deal.vendor.slug}`} className="product-detail__vendor-link">
                  <sky-badge variant="primary" size="small">{deal.vendor.businessName}</sky-badge>
                </Link>
              ) : (
                <sky-badge variant="primary" size="small">{deal.vendor.businessName}</sky-badge>
              )
            )}
          </div>

          <h1 className="product-detail__title">{name}</h1>

          <Divider />
          {/* Price — current, original, discount */}
          <div className="product-detail__price-row">
            <span className="product-detail__price">{formatINR(salePrice)}</span>
            {originalPrice && originalPrice !== salePrice && (
              <s
                className="product-detail__original-price"
                aria-label={`Original price ${formatINR(originalPrice)}`}
              >
                {formatINR(originalPrice)}
              </s>
            )}
            {deal.discountPercent && (
              <sky-badge variant="error" size="small">{deal.discountPercent}% OFF</sky-badge>
            )}
          </div>
          <Divider />
          {/* Quantity stepper */}
          <div className="product-detail__qty" role="group" aria-label={products.detail.quantityLabel}>
            <OutlinedIconButton
              aria-label="Decrease quantity"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
            >
              <Icon aria-hidden="true">remove</Icon>
            </OutlinedIconButton>
            <span className="product-detail__qty-value" aria-live="polite" aria-atomic="true">{qty}</span>
            <OutlinedIconButton
              aria-label="Increase quantity"
              onClick={() => setQty((q) => Math.min(10, q + 1))}
              disabled={qty >= 10}
            >
              <Icon aria-hidden="true">add</Icon>
            </OutlinedIconButton>
          </div>
          {/* Action Buttons */}
          <div className="product-detail__actions">
            <FilledButton
              className="product-detail__add-btn"
              onClick={handleAddToCart}
            >
              <Icon slot="icon">
                {addedToCart ? 'check' : 'shopping_bag'}
              </Icon>
              {addedToCart ? 'Added to Cart!' : products.detail.addToCart}
            </FilledButton>

          {/* Add to cart */}
          <FilledButton className="product-detail__add-btn" onClick={handleAddToCart}>
            <Icon slot="icon" aria-hidden="true">
              {addedToCart ? 'check' : 'shopping_bag'}
            </Icon>
            {addedToCart ? 'Added to Cart!' : products.detail.addToCart}
          </FilledButton>
          {addError && <p className="error-state" role="alert">{addError}</p>}

          {/* Stock + share */}
          <div className="product-detail__secondary-actions">
            <span className="product-detail__stock">
              <Icon aria-hidden="true" className="product-detail__stock-icon">check_circle</Icon>
              {products.detail.inStock}
            </span>

            <div className="product-detail__share" aria-label="Share">
              <OutlinedIconButton
                aria-label={isWishlisted(dealId) ? 'Remove from wishlist' : 'Save to wishlist'}
                aria-pressed={isWishlisted(dealId)}
                disabled={wishlistPending(dealId)}
                onClick={toggleFavorite}
              >
                <Icon aria-hidden="true">{isWishlisted(dealId) ? 'favorite' : 'favorite_border'}</Icon>
              </OutlinedIconButton>
              <span className="product-detail__share-label">Share</span>
              <OutlinedIconButton
                aria-label={copied ? 'Link copied!' : 'Copy product link'}
                onClick={copyLink}
              >
                <Icon aria-hidden="true">{copied ? 'check' : 'link'}</Icon>
              </OutlinedIconButton>
            </div>
          </div>

          {description && (
            <>
              <Divider />
              <sky-accordion single className="product-detail__accordion">
                <sky-accordion-item header={products.detail.accordionSummary} open>
                  <p className="product-detail__summary">{description}</p>
                </sky-accordion-item>
              </sky-accordion>
            </>
          )}
        </div>
      </div>

      {/* ── Related Products ────────────────────────────────────────────── */}
      {related.length > 0 && (
        <section className="product-detail__related" aria-labelledby="related-products-heading">
          <div className="product-detail__related-inner">
            <h2 id="related-products-heading" className="product-detail__related-heading">
              {products.detail.relatedProducts}
            </h2>
            <div className="product-detail__related-carousel">
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
                      heading={d.product?.name ?? d.title}
                      eyebrow={d.product?.brand ?? d.vendor?.businessName ?? undefined}
                      eyebrowHref={!d.product?.brand && d.vendor?.slug ? `/vendor/${d.vendor.slug}` : undefined}
                      image={d.product?.image ?? d.images?.[0] ?? undefined}
                      imageAlt={d.product?.imageAlt ?? undefined}
                      price={formatINR(Number(d.salePrice))}
                      originalPrice={
                        d.originalPrice && Number(d.originalPrice) !== Number(d.salePrice)
                          ? formatINR(Number(d.originalPrice))
                          : undefined
                      }
                      discount={d.discountPercent ? `${d.discountPercent}% OFF` : undefined}
                      href={`/products/${d.id}`}
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

export default ProductDetail;
