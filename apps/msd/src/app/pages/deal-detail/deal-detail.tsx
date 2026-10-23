import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon, OutlinedIconButton } from '@skylabs-monorepo/shared-ui/react';
import '@skylabs-monorepo/shared-ui/carousel';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { addCartItem } from '../../../api/cart';
import { getCatalogDeal, listCatalogDeals, type CatalogDeal } from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { useRequireSignIn } from '../../../hooks/use-require-sign-in';
import { showCartAdded } from '../../../hooks/use-add-product-to-cart';
import { useDealPurchaseSelection } from '../../../hooks/use-deal-purchase-selection';
import { OfferCard } from '../../components/offer-card/offer-card';
import { CardRail } from '../../components/card-rail/card-rail';
import { Breadcrumb } from '../../components/breadcrumb';
import { PageSection } from '../../components/page-section/page-section';
import { DurationPackageSelector } from '../../components/duration-package-selector';
import { BranchPanels, DetailGallery, DetailNotFound, DetailPrice, DetailPurchase, discountPercent } from '../../components/detail-page/detail-page';
import { BannerSlot } from '../../components/banner-slot/banner-slot';
import { Seo } from '../../seo/seo';
import { fillTemplate, formatINR } from '../../../utils/format';
import { resolveDealMedia } from '../../../utils/media';
import { htmlToPlainText } from '../../../utils/rich-text';
import { dealPath } from '../../seo/public-urls';
import { absoluteUrl } from '../../seo/site-url';
import content from '../../../content.json';

const t = content.dealDetail;
const d = content.detailPage;

/**
 * A single service Deal (`GET /catalog/deals/:id`): gallery and buy box (package, quantity, Add to
 * cart, wishlist, share), details beside the branch location and hours, then more deals from the
 * same category. Products have their own page (/products/:id); therapists use the same layout
 * (therapist-detail.tsx) through `components/detail-page`.
 */
export function DealDetail() {
  const { slug: id = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const requireSignIn = useRequireSignIn();
  const { has: isWishlisted, toggle: toggleWishlist, isPending: wishlistPending } = useWishlist();
  const [deal, setDeal] = useState<CatalogDeal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [related, setRelated] = useState<CatalogDeal[]>([]);
  const [actionError, setActionError] = useState('');
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    // Guards against a slower, now-stale request (quick back-to-back navigation between deals,
    // or StrictMode's dev-only double-invoke) landing after a newer one and overwriting fresh
    // state with old data — the visible symptom is a content→loading→content flicker.
    let cancelled = false;

    if (!id) {
      setDeal(null);
      setError(t.errors.invalidDeal);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    getCatalogDeal(id)
      .then(({ data }) => { if (!cancelled) setDeal(data); })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiRequestError && err.status === 404) setDeal(null);
        else setError(err instanceof ApiRequestError ? err.message : t.errors.loadDeal);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const categoryId = deal?.category?.id;
  const dealId = deal?.id;
  useEffect(() => {
    if (!categoryId) {
      setRelated([]);
      return;
    }
    let cancelled = false;
    listCatalogDeals({ categoryId, pageSize: 7 })
      .then(({ data }) => { if (!cancelled) setRelated(data.filter((item) => item.id !== dealId).slice(0, 6)); })
      .catch(() => { if (!cancelled) setRelated([]); });
    return () => { cancelled = true; };
  }, [categoryId, dealId]);

  const purchaseSelection = useDealPurchaseSelection(deal);

  if (loading) return <p className="loading-state" role="status">{t.loading}</p>;
  if (error || !deal) return <DetailNotFound copy={t.notFound} to="/categories" />;

  const media = resolveDealMedia(deal);
  const description = deal.description ?? deal.shortDescription ?? '';
  const plainDescription = htmlToPlainText(description);
  const salePrice = purchaseSelection.unitPrice;
  const activeOriginal = purchaseSelection.activePackage?.originalPrice;
  const originalPrice = activeOriginal != null ? Number(activeOriginal) : deal.originalPrice != null ? Number(deal.originalPrice) : undefined;
  const discountPct = deal.discountPercent ?? discountPercent(salePrice, originalPrice);
  const saved = isWishlisted(deal.id);

  const handleAddToCart = async () => {
    if (!requireSignIn()) return;
    const activePackage = purchaseSelection.activePackage;
    if (!activePackage) {
      setActionError(purchaseSelection.missingSelection ?? d.selectDuration);
      return;
    }
    setActionError('');
    try {
      await addCartItem(token, { dealId: deal.id, dealPackageId: activePackage.id, quantity });
      showCartAdded(deal.title, () => navigate('/cart'));
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : t.errors.addToCart);
    }
  };

  return (
    <>
      <Seo
        title={`${deal.title} – ${deal.vendor?.businessName ?? 'MSD'}${t.meta.titleSuffix}`}
        description={`${description || fillTemplate(t.meta.defaultDescription, { name: deal.title })} ${formatINR(salePrice)}${deal.branch?.city ? ` ${t.meta.locationPrefix} ${deal.branch.city}` : ''}.`}
        path={`/deal/${deal.id}`}
        image={media.images[0]}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Service',
          name: deal.title,
          description,
          ...(deal.vendor?.businessName ? { provider: { '@type': 'Organization', name: deal.vendor.businessName } } : {}),
          offers: { '@type': 'Offer', price: salePrice, priceCurrency: 'INR', availability: 'https://schema.org/InStock' },
        }}
      />

      {/* Hero: gallery (70) + buy box (30) */}
      <PageSection stack aria-labelledby="detail-title">
        <Breadcrumb
          items={[
            { label: content.categories.breadcrumb.home, to: '/' },
            ...(deal.category ? [{ label: deal.category.name, to: `/category/${deal.category.slug}` }] : []),
            { label: deal.title },
          ]}
        />
        <div className="detail-page__grid">
          <DetailGallery images={media.images} video={media.video} alt={deal.title} discountPct={discountPct} />
          <div className="detail-page__buy">
            <div className="detail-page__chips">
              {deal.category && <sky-badge variant="secondary" size="small">{deal.category.name}</sky-badge>}
              {deal.vendor?.businessName &&
                (deal.vendor.slug ? (
                  <Link to={`/vendor/${deal.vendor.slug}`}>
                    <sky-badge variant="primary" size="small">{deal.vendor.businessName}</sky-badge>
                  </Link>
                ) : (
                  <sky-badge variant="primary" size="small">{deal.vendor.businessName}</sky-badge>
                ))}
            </div>
            <h1 id="detail-title" className="detail-page__title headline-medium">{deal.title}</h1>
            <DetailPrice price={salePrice} originalPrice={originalPrice} discountPct={discountPct} />
            <DurationPackageSelector selection={purchaseSelection} />
            <DetailPurchase
              unitPrice={salePrice}
              quantity={quantity}
              onQuantityChange={setQuantity}
              onAdd={() => void handleAddToCart()}
              addDisabled={!!purchaseSelection.missingSelection}
              error={actionError}
              actions={
                <OutlinedIconButton
                  aria-label={saved ? t.wishlist.remove : t.wishlist.save}
                  aria-pressed={saved}
                  disabled={wishlistPending(deal.id)}
                  onClick={() => { if (requireSignIn()) void toggleWishlist(deal.id); }}
                >
                  <Icon aria-hidden="true">{saved ? 'favorite' : 'favorite_border'}</Icon>
                </OutlinedIconButton>
              }
            />
          </div>
        </div>
      </PageSection>

      {/* Details (70) + location and hours (30) */}
      <PageSection tone="tint" aria-labelledby="detail-details-heading">
        <div className="detail-page__grid">
          <div className="detail-page__content">
            <h2 id="detail-details-heading" className="detail-page__heading title-large">{d.details}</h2>
            <sky-accordion>
              {description && (
                <sky-accordion-item header={t.description} level={3} open>
                  <p className="detail-page__text body-large">{description}</p>
                </sky-accordion-item>
              )}
              {deal.notes && (
                <sky-accordion-item header={d.notes} level={3}>
                  <p className="detail-page__text body-large">{deal.notes}</p>
                </sky-accordion-item>
              )}
              {deal.policy && (
                <sky-accordion-item header={d.policy} level={3}>
                  <p className="detail-page__text body-medium">{deal.policy}</p>
                </sky-accordion-item>
              )}
              <sky-accordion-item header={d.cancellationPolicy} level={3}>
                <p className="detail-page__text body-medium">{d.cancellationText}</p>
              </sky-accordion-item>
              {deal.termsAndConditions && (
                <sky-accordion-item header={d.terms} level={3}>
                  <p className="detail-page__text body-medium">{deal.termsAndConditions}</p>
                </sky-accordion-item>
              )}
            </sky-accordion>
          </div>
          {deal.branch && <BranchPanels branch={deal.branch} vendorSlug={deal.vendor?.slug} />}
        </div>
      </PageSection>

      {related.length > 0 && (
        <PageSection aria-labelledby="related-heading">
          <CardRail id="related-heading" heading={d.related}>
            {related.map((item) => (
              <swiper-slide key={item.id} className="card-rail__slide">
                <OfferCard slider item={{ type: 'deal', deal: item }} variant="outlined" layout="vertical" />
              </swiper-slide>
            ))}
          </CardRail>
        </PageSection>
      )}
      <BannerSlot slot="DEAL_BOTTOM" />
    </>
  );
}
export default DealDetail;
