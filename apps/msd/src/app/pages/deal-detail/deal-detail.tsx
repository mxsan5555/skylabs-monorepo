import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DealCard, type DealCardDeal } from '../../components/deal-card';
import { Divider, FilledButton, Icon, OutlinedIconButton } from '@skylabs-monorepo/shared-ui/react';
import '@skylabs-monorepo/shared-ui/carousel';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { addCartItem } from '../../../api/cart';
import { getCatalogDeal, listCatalogDeals, type CatalogDeal, } from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { Breadcrumb } from '../../components/breadcrumb';
import { useDealPurchaseSelection } from '../../../hooks/use-deal-purchase-selection';
import { DurationPackageSelector } from '../../components/duration-package-selector';
import { formatINR } from '../../../utils/format';
import { resolveDealMedia } from '../../../utils/media';
import content from '../../../content.json';
import './deal-detail.css';
/**
 * A single Deal — GET /catalog/deals/:id. Deal is always a service offering (Product is a fully
 * independent catalog entity — see msd-api's Product schema doc comment) — Add to Cart always
 * goes through `DealAddToCartDialog`'s package-selection flow.
 *
 * /category/:slug links service deals here. Products link to /products/:id.
 */
export function DealDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, token } = useAuth();
  const { has: isWishlisted, toggle: toggleWishlist, isPending: wishlistPending, } = useWishlist();
  const { dealDetail } = content;
  const [deal, setDeal] = useState<CatalogDeal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [related, setRelated] = useState<CatalogDeal[]>([]);
  const [activeImg, setActiveImg] = useState(0);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [quantity, setQuantity] = useState(1);
  useEffect(() => {
    if (!id) {
      setDeal(null);
      setError(dealDetail.errors.invalidDeal);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    setActiveImg(0);
    getCatalogDeal(id)
      .then(({ data }) => { setDeal(data); })
      .catch((err: unknown) => {
        if (err instanceof ApiRequestError && err.status === 404) {
          setDeal(null);
          return;
        }
        setError(err instanceof ApiRequestError ? err.message : dealDetail.errors.loadDeal);
      })
      .finally(() => { setLoading(false); });
  }, [id]);
  useEffect(() => {
    if (!deal?.category?.id) {
      setRelated([]);
      return;
    }
    listCatalogDeals({
      categoryId: deal.category.id,
      pageSize: 7,
    })
      .then(({ data }) => {
        setRelated(
          data.filter((item) => item.id !== deal.id).slice(0, 6),
        );
      })
      .catch(() => {
        setRelated([]);
      });
  }, [deal]);
  const purchaseSelection = useDealPurchaseSelection(deal);
  if (loading) {
    return (
      <p className="loading-state">{dealDetail.loading}</p>
    );
  }
  if (error || !deal) {
    return (
      <div className="deal-detail deal-detail--empty">
        <title>{dealDetail.notFound.metaTitle}</title>
        <sky-info-card
          icon="search_off"
          heading={dealDetail.notFound.heading}
          subheading={dealDetail.notFound.subheading}
        />
        <FilledButton type="button" onClick={() => navigate('/categories')} > {dealDetail.notFound.cta} </FilledButton>
      </div>
    );
  }
  const requireAuthOrRedirect = () => {
    if (isAuthenticated) {
      return true;
    }
    navigate(`/sign-in?next=${encodeURIComponent(`/deal/${id}`)}`,);
    return false;
  };
  const name = deal.title;
  const dealMedia = resolveDealMedia(deal);
  const gallery = dealMedia.images;
  const video = dealMedia.video;
  const description = deal.description ?? deal.shortDescription ?? '';
  const salePrice = purchaseSelection.unitPrice;
  const originalPrice = purchaseSelection.activePackage?.originalPrice != null
    ? Number(purchaseSelection.activePackage.originalPrice)
    : deal.originalPrice != null ? Number(deal.originalPrice) : undefined;
  const discountPct = deal.discountPercent ??
    (originalPrice !== undefined && originalPrice > salePrice
      ? Math.round(((originalPrice - salePrice) / originalPrice) * 100,) : 0);
  const dealId = deal.id;
  function toggleFavorite() {
    if (!requireAuthOrRedirect()) {
      return;
    }
    void toggleWishlist(dealId);
  }
  async function handleAddToCart() {
    if (!deal) return;
    if (!requireAuthOrRedirect()) return;
    const activePackage = purchaseSelection.activePackage;
    if (!activePackage) {
      setActionError(
        purchaseSelection.missingSelection ?? 'Please select a package.'
      );
      setActionMessage('');
      return;
    }
    setActionError('');
    setActionMessage('');
    try {
      await addCartItem(token, {
        dealId: deal.id,
        dealPackageId: activePackage.id,
        quantity,
      });
      setActionMessage(`Added "${deal.title}" to your cart.`);
    } catch (err) {
      const message = err instanceof ApiRequestError ? err.message : 'Unable to add item to cart.';
      setActionError(message);
    }
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => { setCopied(false); }, 2000);
    } catch {
      setCopied(false);
    }
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
            '@context': 'https://schema.org', '@type': 'Service',
            name,
            description,
            provider: deal.vendor?.businessName ? { '@type': 'Organization', name: deal.vendor.businessName, } : undefined,
            offers: {
              '@type': 'Offer',
              price: salePrice,
              priceCurrency: 'INR',
              availability: 'https://schema.org/InStock',
            },
          }),
        }}
      />
      <Breadcrumb
        className="deal-detail__breadcrumb"
        items={[
          { label: content.categories.breadcrumb.home, to: '/', },
          ...(deal.category ? [
            { label: deal.category.name, to: `/category/${deal.category.slug}`, },
          ] : []),
          { label: name, },]}
      />
      <div className="deal-detail__layout">
        <div className="deal-detail__gallery">
          <div className="deal-detail__main-img-wrap">
            {gallery[activeImg] && (
              <img
                className="deal-detail__main-img"
                src={gallery[activeImg]}
                alt={name}
                width={800}
                height={450}
              />
            )}
            {discountPct > 0 && (
              <span className="deal-detail__badge" aria-label={`${discountPct}% ${dealDetail.labels.off}`}>
                {discountPct}% {dealDetail.labels.off}
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
                  className={`deal-detail__thumb${index === activeImg ? ' deal-detail__thumb--active' : ''}`}
                  onClick={() => setActiveImg(index)}
                  aria-label={`${dealDetail.gallery.viewImage} ${index + 1}`}
                  aria-pressed={index === activeImg}
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
          {video && (<video className="deal-detail__video" controls src={video} />)}
        </div>
        <div className="deal-detail__info">
          <div className="deal-detail__meta-row">
            {deal.vendor?.businessName &&
              (deal.vendor.slug ? (
                <Link to={`/vendor/${deal.vendor.slug}`} className="deal-detail__provider">{deal.vendor.businessName}</Link>
              ) : (
                <span className="deal-detail__provider">{deal.vendor.businessName}</span>
              ))}
            {deal.category && (
              <sky-badge variant="secondary" size="small"> {deal.category.name} </sky-badge>
            )}
            <sky-badge variant="primary" size="small">{dealDetail.serviceType.service}</sky-badge>
          </div>
          <h1 className="deal-detail__title">{name}</h1>
          {(deal.branch?.city || deal.branch?.address) && (
            <p className="deal-detail__dist" aria-label={dealDetail.labels.location}>
              <Icon aria-hidden="true"> near_me</Icon>
              {[deal.branch?.name, deal.branch?.address ?? deal.branch?.city,]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          <DurationPackageSelector selection={purchaseSelection} />
          <div className="deal-detail__cta">
            <div className="deal-detail__purchase">
              <div className="deal-detail__quantity">
                <span>Quantity</span>
                <div
                  className="deal-detail__quantity-control"
                  role="group"
                  aria-label="Quantity"
                >
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    disabled={quantity <= 1}
                    onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                  >−</button>
                  <span aria-live="polite">{quantity}</span>
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    onClick={() => setQuantity((current) => current + 1)
                    }
                  >+</button>
                </div>
              </div>
              <div className="deal-detail__total">
                <span>Total</span>
                <strong>{formatINR(purchaseSelection.unitPrice * quantity)}</strong>
              </div>
              <div className="deal-detail__action-row">
                <FilledButton
                  type="button"
                  className="deal-detail__add-btn"
                  onClick={handleAddToCart}
                  disabled={!!purchaseSelection.missingSelection}
                >
                  <Icon slot="icon" aria-hidden="true">shopping_bag</Icon>Add to Cart</FilledButton>
                <OutlinedIconButton
                  className="deal-detail__action-icon"
                  aria-label={isWishlisted(dealId) ? dealDetail.wishlist.remove : dealDetail.wishlist.save}
                  aria-pressed={isWishlisted(dealId)}
                  disabled={wishlistPending(dealId)}
                  onClick={toggleFavorite}
                >
                  <Icon aria-hidden="true">{isWishlisted(dealId) ? 'favorite' : 'favorite_border'}</Icon>
                </OutlinedIconButton>
                <OutlinedIconButton
                  className="deal-detail__action-icon"
                  aria-label={copied ? 'Link copied' : 'Share deal'}
                  onClick={copyLink}
                >
                  <Icon aria-hidden="true">{copied ? 'check' : 'link'}</Icon>
                </OutlinedIconButton>
              </div>
            </div>
          </div>
          {actionMessage && (
            <p className="field-hint" role="status"> {actionMessage} </p>
          )}
          {actionError && (
            <p className="error-state" role="alert">{actionError} </p>
          )}
          <Divider />
          <sky-accordion>
            {description && (
              <sky-accordion-item header={dealDetail.description} open>
                <p className="deal-detail__desc">{description}</p>
              </sky-accordion-item>
            )}
            {deal.notes && (
              <sky-accordion-item header="Notes">
                <p className="deal-detail__desc">{deal.notes}</p>
              </sky-accordion-item>
            )}
            {deal.policy && (
              <sky-accordion-item header="Policy">
                <p className="deal-detail__policy">{deal.policy}</p>
              </sky-accordion-item>
            )}
            <sky-accordion-item header={dealDetail.cancellationPolicy}>
              <p className="deal-detail__policy">{dealDetail.cancellationText}</p>
            </sky-accordion-item>
            {deal.termsAndConditions && (
              <sky-accordion-item header="Terms & Conditions">
                <p className="deal-detail__policy">{deal.termsAndConditions}</p>
              </sky-accordion-item>
            )}
          </sky-accordion>
        </div>
      </div>
      {related.length > 0 && (
        <section className="deal-detail__related" aria-labelledby="related-heading">
          <div className="deal-detail__related-inner">
            <h2 id="related-heading" className="deal-detail__related-heading">{dealDetail.relatedDeals}</h2>
            <div className="deal-detail__related-carousel">
              <swiper-container
                slides-per-view="auto"
                space-between={16}
                free-mode="true"
                grab-cursor="true"
              >
                {related.map((item) => {
                  const media = resolveDealMedia(item);
                  const relatedDeal: DealCardDeal = {
                    id: item.id,
                    title: item.title,
                    image: media.images[0] ?? '',
                    imageAlt: item.title,
                    gallery: media.images.length ? media.images : undefined,
                    video: media.video,
                    badge: dealDetail.serviceType.service,
                    providerName: item.vendor?.businessName ?? undefined,
                    price: Number(item.salePrice),
                    originalPrice: item.originalPrice != null && Number(item.originalPrice) !== Number(item.salePrice) ? Number(item.originalPrice) : undefined, discount: item.discountPercent ?? undefined,
                  };
                  return (
                    <swiper-slide key={item.id} style={{ width: '260px', height: 'auto' }}>
                      <DealCard
                        deal={relatedDeal}
                        eyebrowHref={item.vendor?.slug ? `/vendor/${item.vendor.slug}` : undefined}
                        favoriteActive={isWishlisted(item.id)}
                        onFavorite={() => {
                          if (!requireAuthOrRedirect()) return; void toggleWishlist(item.id);
                        }}
                      />
                    </swiper-slide>
                  );
                })}
              </swiper-container>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
export default DealDetail;