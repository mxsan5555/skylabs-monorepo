import { JsonLd } from '../../seo/json-ld';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { DealCard, type DealCardDeal } from '../../components/deal-card';
import { FilledButton, Icon, OutlinedButton, OutlinedIconButton } from '@skylabs-monorepo/shared-ui/react';
import '@skylabs-monorepo/shared-ui/carousel';
import { showSnackbar } from '../../../snackbar/snackbar';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { signInPathWithReturnTo } from '../../../auth/role-routing';
import { addCartItem } from '../../../api/cart';
import {
  getCatalogDeal,
  getCatalogVendor,
  listCatalogDeals,
  type CatalogDeal,
  type CatalogVendorBranch,
} from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { Breadcrumb } from '../../components/breadcrumb';
import { PageSection } from '../../components/page-section/page-section';
import { useDealPurchaseSelection } from '../../../hooks/use-deal-purchase-selection';
import { DurationPackageSelector } from '../../components/duration-package-selector';
import { formatINR, formatTime12h } from '../../../utils/format';
import { resolveDealMedia } from '../../../utils/media';
import content from '../../../content.json';
import './deal-detail.css';

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** Builds a Google Maps directions link from the branch's own coordinates, falling back to a
 *  text address search when coordinates are unavailable — never fabricated. */
function directionsUrlFor(branch: CatalogDeal['branch']): string | undefined {
  if (!branch) return undefined;
  if (branch.latitude != null && branch.longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${branch.latitude},${branch.longitude}`;
  }
  const query = [branch.name, branch.address, branch.city].filter(Boolean).join(', ');
  return query ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}` : undefined;
}

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
  const location = useLocation();
  const { isAuthenticated, token } = useAuth();
  const { has: isWishlisted, toggle: toggleWishlist, isPending: wishlistPending, } = useWishlist();
  const { dealDetail, vendor: vendorContent } = content;
  const [deal, setDeal] = useState<CatalogDeal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [related, setRelated] = useState<CatalogDeal[]>([]);
  const [activeImg, setActiveImg] = useState(0);
  const [actionError, setActionError] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [vendorBranch, setVendorBranch] = useState<CatalogVendorBranch | null>(null);
  const [hoursLoaded, setHoursLoaded] = useState(false);
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
  useEffect(() => {
    const slug = deal?.vendor?.slug;
    const branchId = deal?.branch?.id;
    if (!slug || !branchId) {
      setVendorBranch(null);
      setHoursLoaded(true);
      return;
    }
    setHoursLoaded(false);
    getCatalogVendor(slug)
      .then(({ data }) => {
        setVendorBranch(data.branches.find((branch) => branch.id === branchId) ?? null);
      })
      .catch(() => { setVendorBranch(null); })
      .finally(() => { setHoursLoaded(true); });
  }, [deal?.vendor?.slug, deal?.branch?.id]);
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
    navigate(signInPathWithReturnTo(location));
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
  const branch = deal.branch;
  const directionsUrl = directionsUrlFor(branch);
  const branchAddress = branch
    ? [branch.name, [branch.address, branch.city].filter(Boolean).join(', ')].filter(Boolean)
    : [];
  function showPrevImage() {
    setActiveImg((current) => (current - 1 + gallery.length) % gallery.length);
  }
  function showNextImage() {
    setActiveImg((current) => (current + 1) % gallery.length);
  }
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
      return;
    }
    setActionError('');


    try {
      await addCartItem(token, {
        dealId: deal.id,
        dealPackageId: activePackage.id,
        quantity,
      });

showSnackbar(`Added "${deal.title}" to your cart.`, {
        variant: 'info',
        actionLabel: 'View Cart',
        onAction: () => navigate('/cart'),
      });
    } catch (err) {
      const message =
        err instanceof ApiRequestError
          ? err.message
          : 'Unable to add item to cart.';

      setActionError(message);

      showSnackbar(message, { variant: 'error' });
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
      <JsonLd
        data={{
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

      {/* Section 1 — 70/30: gallery left, buy box right */}
      <PageSection aria-labelledby="deal-title" className="deal-detail__hero">
        <div className="deal-detail__hero-grid">
          <div className="deal-detail__gallery">
            <div className="deal-detail__main-img-wrap">
              {gallery[activeImg] && (
                <img
                  key={activeImg}
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
              {gallery.length > 1 && (
                <>
                  <button type="button" className="deal-detail__nav deal-detail__nav--prev" aria-label="Previous image" onClick={showPrevImage}>
                    <Icon aria-hidden="true">chevron_left</Icon>
                  </button>
                  <button type="button" className="deal-detail__nav deal-detail__nav--next" aria-label="Next image" onClick={showNextImage}>
                    <Icon aria-hidden="true">chevron_right</Icon>
                  </button>
                  <span className="deal-detail__counter">{activeImg + 1} / {gallery.length}</span>
                </>
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
          <div className="deal-detail__buy">
            <div className="deal-detail__meta-row">
              {deal.category && (
                <sky-badge variant="secondary" size="small"> {deal.category.name} </sky-badge>
              )}
              {deal.vendor?.businessName &&
                (deal.vendor.slug ? (
                  <Link to={`/vendor/${deal.vendor.slug}`}>
                    <sky-badge variant="primary" size="small">{deal.vendor.businessName}</sky-badge>
                  </Link>
                ) : (
                  <sky-badge variant="primary" size="small">{deal.vendor.businessName}</sky-badge>
                ))}
            </div>
            <h1 id="deal-title" className="deal-detail__title">{name}</h1>
            <div className="deal-detail__price-row">
              <span className="deal-detail__price">{formatINR(salePrice)}</span>
              {originalPrice !== undefined && originalPrice > salePrice && (
                <s className="deal-detail__original-price" aria-label={`${dealDetail.labels.originalPrice} ${formatINR(originalPrice)}`}>
                  {formatINR(originalPrice)}
                </s>
              )}
              {discountPct > 0 && (
                <sky-badge variant="error" size="small">{discountPct}% {dealDetail.labels.off}</sky-badge>
              )}
            </div>
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
          </div>
        </div>
      </PageSection>

      {/* Section 2 — 70/30: details left, location + hours right */}
      <PageSection tone="tint" aria-labelledby="deal-details-heading" className="deal-detail__details">
        <div className="deal-detail__details-grid">
          <div className="deal-detail__content">
            <h2 id="deal-details-heading" className="deal-detail__panel-heading">Details</h2>
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
          {branch && (
            <aside className="deal-detail__sidebar" aria-label="Location and hours">
              <div className="deal-detail__panel">
                <h3 className="deal-detail__panel-heading">{dealDetail.labels.location}</h3>
                <p className="deal-detail__address">
                  <Icon aria-hidden="true">location_on</Icon>
                  <span>{branchAddress.join(' — ')}</span>
                </p>
                {directionsUrl && (
                  <OutlinedButton href={directionsUrl} target="_blank" rel="noopener noreferrer" className="deal-detail__directions-btn">
                    <Icon slot="icon" aria-hidden="true">directions</Icon>
                    {dealDetail.labels.getDirections}
                  </OutlinedButton>
                )}
              </div>
              {hoursLoaded && (
                <div className="deal-detail__panel">
                  <h3 className="deal-detail__panel-heading">{dealDetail.labels.hours}</h3>
                  {vendorBranch?.openingHours && Object.keys(vendorBranch.openingHours).length > 0 ? (
                    <ul className="deal-detail__hours-list">
                      {DAY_ORDER.map((day) => {
                        const dayHours = vendorBranch.openingHours?.[day];
                        const closed = !dayHours || !dayHours.open || !dayHours.start || !dayHours.end;
                        return (
                          <li key={day} className="deal-detail__hours-row">
                            <span className="deal-detail__hours-day">{vendorContent.days[day]}</span>
                            <span className="deal-detail__hours-time">
                              {closed ? vendorContent.labels.closed : `${formatTime12h(dayHours.start!)} – ${formatTime12h(dayHours.end!)}`}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="deal-detail__hours-empty">{vendorContent.labels.timingsNotAvailable}</p>
                  )}
                </div>
              )}
            </aside>
          )}
        </div>
      </PageSection>

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
