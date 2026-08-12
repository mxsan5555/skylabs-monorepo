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
import {
  getProductById,
  PRODUCTS,
  CATEGORY_LABELS,
} from '../../../data/products';
import { SkyProductCardWC } from '../../components/sky-product-card-wc';
import { Breadcrumb } from '../../components/breadcrumb';
import { formatINR } from '../../../utils/format';
import content from '../../../content.json';
import './product-detail.css';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';

const { products } = content;
const SITE_URL: string =
  (import.meta.env['VITE_SITE_URL'] as string | undefined) ?? '';

export function ProductDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { addItem, updateQuantity } = useCart();
  const { toggle, has } = useWishlist();
  const [activeImg, setActiveImg] = useState(0);
  const [qty, setQty] = useState(1);
  const [addedToCart, setAddedToCart] = useState(false);
  const [copied, setCopied] = useState(false);
  const product = getProductById(id);

  if (!product) {
    return (
      <div className="product-detail product-detail--empty">
        <title>Product Not Found | MSD</title>
        <sky-info-card
          icon="search_off"
          heading="Product not found"
          subheading="This product may no longer be available."
        />
        <FilledButton onClick={() => navigate('/products')}>
          Browse Products
        </FilledButton>
      </div>
    );
  }
  const currentProduct = product;
  const relatedProducts = PRODUCTS.filter(
    (p) => p.categorySlug === product.categorySlug && p.id !== product.id,
  ).slice(0, 6);
  const categoryLabel =
    CATEGORY_LABELS[product.categorySlug] ?? product.categorySlug;
  function handleAddToCart() {
    if (!isAuthenticated) {
      navigate('/sign-in');
      return;
    }
    addItem(currentProduct.id, 'product');
    if (qty > 1) {
      updateQuantity(currentProduct.id, 'product', qty);
    }
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
  }
  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  const seoName =
    product.name.length > 50 ? `${product.name.slice(0, 47)}…` : product.name;
  const seoDesc = `${product.description.slice(0, 120)} Shop now at MSD.`;
  const canonicalUrl = `${SITE_URL}/products/${product.id}`;

  return (
    <div className="product-detail">
      <title>{`${seoName} | MSD`}</title>
      <meta name="description" content={seoDesc} />
      <link rel="canonical" href={canonicalUrl} />
      <meta property="og:type" content="product" />
      <meta property="og:title" content={product.name} />
      <meta
        property="og:description"
        content={product.description.slice(0, 155)}
      />
      <meta property="og:image" content={product.image} />
      <meta property="og:url" content={canonicalUrl} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={product.name} />
      <meta
        name="twitter:description"
        content={product.description.slice(0, 155)}
      />
      <meta name="twitter:image" content={product.image} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: product.name,
            description: product.description,
            image:
              product.gallery.length > 0 ? product.gallery : [product.image],
            brand: { '@type': 'Brand', name: product.brand },
            sku: product.id,
            offers: {
              '@type': 'Offer',
              price: product.price,
              priceCurrency: 'INR',
              availability: 'https://schema.org/InStock',
              url: canonicalUrl,
              seller: { '@type': 'Organization', name: 'MySpaDeal' },
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
                name: product.name,
                item: canonicalUrl,
              },
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
          { label: product.name },
        ]}
      />
      <div className="product-detail__layout">
        {/* ── Gallery ────────────────────────────────────────────────────── */}
        <div className="product-detail__gallery">
          <div className="product-detail__main-img-wrap">
            <img
              className="product-detail__main-img"
              src={product.gallery[activeImg] ?? product.image}
              alt={product.imageAlt}
              width={600}
              height={200}
            />
            {/* {product.badge && (
              <sky-badge
                className="product-detail__badge"
                variant="primary"
                aria-label={`Product badge: ${product.badge}`}
              >
                {product.badge}
              </sky-badge>
            )} */}
          </div>
          {product.gallery.length > 1 && (
            <div
              className="product-detail__thumbs"
              aria-label="Gallery thumbnails"
            >
              {product.gallery.map((img, i) => (
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
            <sky-badge variant="secondary" size="small">
              {product.brand}
            </sky-badge>
            <sky-badge variant="primary" size="small">
              {categoryLabel}
            </sky-badge>
          </div>
          <h1 className="product-detail__title">{product.name}</h1>
          <Divider />
          {/* Price — current, original, discount */}
          <div className="product-detail__price-row">
            <span className="product-detail__price">
              {formatINR(product.price)}
            </span>
            {product.originalPrice && (
              <s
                className="product-detail__original-price"
                aria-label={`Original price ${formatINR(product.originalPrice)}`}
              >
                {formatINR(product.originalPrice)}
              </s>
            )}
            {product.discount && (
              <sky-badge variant="error" size="small">
                {product.discount}% OFF
              </sky-badge>
            )}
          </div>
          <Divider />
          {/* Quantity stepper */}
          <div
            className="product-detail__qty"
            role="group"
            aria-label={products.detail.quantityLabel}
          >
            <OutlinedIconButton
              aria-label="Decrease quantity"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
            >
              <Icon aria-hidden="true">remove</Icon>
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
              <Icon slot="icon">{addedToCart ? 'check' : 'shopping_bag'}</Icon>
              {addedToCart ? 'Added to Cart!' : products.detail.addToCart}
            </FilledButton>

            <OutlinedIconButton
              toggle
              selected={has(product.id)}
              aria-label={
                has(product.id) ? 'Remove from wishlist' : 'Save to wishlist'
              }
              onClick={() => {
                if (!isAuthenticated) {
                  navigate('/sign-in');
                  return;
                }
                toggle(product.id);
              }}
            >
              <Icon slot="selected">favorite</Icon>
              <Icon>favorite_border</Icon>
            </OutlinedIconButton>

            <OutlinedIconButton
              aria-label={copied ? 'Link copied!' : 'Copy product link'}
              onClick={copyLink}
            >
              <Icon>{copied ? 'check' : 'share'}</Icon>
            </OutlinedIconButton>
          </div>

          {/* Stock */}
          <div className="product-detail__stock">
            <Icon className="product-detail__stock-icon">check_circle</Icon>
            {products.detail.inStock}
          </div>

          <Divider />

          {/* Accordion */}
          <sky-accordion single className="product-detail__accordion">
            <sky-accordion-item header={products.detail.accordionSummary} open>
              <p className="product-detail__summary">{product.summary}</p>
            </sky-accordion-item>
            <sky-accordion-item header={products.detail.accordionBenefits}>
              <ul className="product-detail__list">
                {product.benefits.map((b) => (
                  <li key={b} className="product-detail__list-item">
                    <Icon aria-hidden="true">check</Icon>
                    {b}
                  </li>
                ))}
              </ul>
            </sky-accordion-item>
            <sky-accordion-item header={products.detail.accordionHowToUse}>
              <ol className="product-detail__list product-detail__list--ordered">
                {product.howToUse.map((step, i) => (
                  <li key={i} className="product-detail__list-item">
                    <span
                      className="product-detail__step-num"
                      aria-hidden="true"
                    >
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </sky-accordion-item>
            <sky-accordion-item header={products.detail.accordionIngredients}>
              <p className="product-detail__ingredients">
                {product.ingredients}
              </p>
            </sky-accordion-item>
            <sky-accordion-item header={products.detail.accordionReturn}>
              <p className="product-detail__policy">{product.returnPolicy}</p>
            </sky-accordion-item>
          </sky-accordion>
        </div>
      </div>

      {/* ── Editorial benefits section ──────────────────────────────────── */}
      {product.benefits.length > 0 && (
        <section
          className="product-detail__editorial"
          aria-label="Product highlights"
        >
          <div className="product-detail__editorial-inner">
            {product.benefits.slice(0, 3).map((benefit, i) => (
              <div
                key={i}
                className={`product-detail__editorial-row${i % 2 !== 0 ? ' product-detail__editorial-row--reverse' : ''}`}
              >
                <div className="product-detail__editorial-img">
                  <img
                    src={product.gallery[i] ?? product.image}
                    alt=""
                    width={600}
                    height={350}
                    loading="lazy"
                    aria-hidden="true"
                  />
                </div>
                <div className="product-detail__editorial-text">
                  <h2 className="product-detail__editorial-heading">
                    {benefit}
                  </h2>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Related Products ────────────────────────────────────────────── */}
      {relatedProducts.length > 0 && (
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
                {relatedProducts.map((p) => (
                  <swiper-slide
                    key={p.id}
                    style={{ width: '260px', height: 'auto' }}
                  >
                    <SkyProductCardWC
                      variant="outlined"
                      heading={p.name}
                      eyebrow={p.brand}
                      image={p.image}
                      imageAlt={p.imageAlt}
                      badge={p.badge}
                      price={formatINR(p.price)}
                      originalPrice={
                        p.originalPrice ? formatINR(p.originalPrice) : undefined
                      }
                      discount={p.discount ? `${p.discount}% OFF` : undefined}
                      href={`/products/${p.id}`}
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
