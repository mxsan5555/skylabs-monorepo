import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import '@skylabs-monorepo/shared-ui/carousel';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { addCartItem } from '../../../api/cart';
import { getCatalogTherapist, listCatalogTherapists, type CatalogTherapist } from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { useRequireSignIn } from '../../../hooks/use-require-sign-in';
import { showCartAdded } from '../../../hooks/use-add-product-to-cart';
import { useTherapistPurchaseSelection } from '../../../hooks/use-therapist-purchase-selection';
import { Breadcrumb } from '../../components/breadcrumb';
import { CardRail } from '../../components/card-rail/card-rail';
import { PageSection } from '../../components/page-section/page-section';
import { DurationPackageSelector } from '../../components/duration-package-selector';
import { BranchPanels, DetailGallery, DetailNotFound, DetailPrice, DetailPurchase, discountPercent } from '../../components/detail-page/detail-page';
import { TherapistCard, lowestPackagePrice } from '../../components/therapist-card/therapist-card';
import { Seo } from '../../seo/seo';
import { fillTemplate, formatINR } from '../../../utils/format';
import { resolveTherapistMedia } from '../../../utils/media';
import content from '../../../content.json';

const t = content.therapistDetail;
const d = content.detailPage;

/**
 * A single therapist (`GET /catalog/therapists/:id`), laid out like a service deal: gallery and
 * buy box (package, quantity, Add to cart, share), about and policy beside the branch location
 * and hours, then more therapists at the same member. A therapist is bought on its own (cart line
 * `therapistId` + `therapistPackageId`), never through a Deal.
 */
export function TherapistDetail() {
  const { slug: id = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const requireSignIn = useRequireSignIn();
  const [therapist, setTherapist] = useState<CatalogTherapist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [related, setRelated] = useState<CatalogTherapist[]>([]);
  const [actionError, setActionError] = useState('');
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    // Guards against a slower, now-stale request landing after a newer one and overwriting
    // fresh state with old data (see ProductDetail's/DealDetail's identical comment).
    let cancelled = false;

    if (!id) {
      setTherapist(null);
      setError(t.errors.invalid);
      setLoading(false);
      return;
    }
  
    setLoading(true);
    setError('');
    getCatalogTherapist(id)
      .then(({ data }) => { if (!cancelled) setTherapist(data); })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiRequestError && err.status === 404) setTherapist(null);
        else setError(err instanceof ApiRequestError ? err.message : t.errors.load);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const vendorId = therapist?.vendor?.id;
  const therapistId = therapist?.id;
  useEffect(() => {
    if (!vendorId) {
      setRelated([]);
      return;
    }
    let cancelled = false;
    listCatalogTherapists({ vendorId, pageSize: 7 })
      .then(({ data }) => { if (!cancelled) setRelated(data.filter((item) => item.id !== therapistId).slice(0, 6)); })
      .catch(() => { if (!cancelled) setRelated([]); });
    return () => { cancelled = true; };
  }, [vendorId, therapistId]);

  const selection = useTherapistPurchaseSelection(therapist?.packages ?? []);

  if (loading) return <p className="loading-state" role="status">{t.loading}</p>;
  if (error || !therapist) return <DetailNotFound copy={t.notFound} to="/therapists" />;

  const media = resolveTherapistMedia(therapist);
  const price = selection.unitPrice;
  const original = selection.activePackage?.originalPrice;
  const originalPrice = original != null ? Number(original) : undefined;
  const discountPct = discountPercent(price, originalPrice);
  const fromPrice = lowestPackagePrice(therapist.packages);
  const vendorName = therapist.vendor?.businessName;
  const experience = therapist.experienceYears;
  const place = [therapist.branch?.name, therapist.branch?.city].filter(Boolean).join(', ');

  const handleAddToCart = async () => {
    if (!requireSignIn()) return;
    const activePackage = selection.activePackage;
    if (!activePackage) {
      setActionError(selection.missingSelection ?? d.selectDuration);
      return;
    }
    setActionError('');
    try {
      await addCartItem(token, { therapistId: therapist.id, therapistPackageId: activePackage.id, quantity });
      showCartAdded(`${therapist.therapistType} – ${therapist.personName}`, () => navigate('/cart'));
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : content.dealDetail.errors.addToCart);
    }
  };

  return (
    <>
      <Seo
        title={fillTemplate(t.metaTitle, { type: therapist.therapistType, name: therapist.personName })}
        description={fillTemplate(t.metaDescription, {
          type: therapist.therapistType,
          name: therapist.personName,
          at: vendorName ? fillTemplate(t.metaAt, { vendor: vendorName }) : '',
          price: fromPrice != null ? formatINR(fromPrice) : '',
        })}
        path={`/therapist/${therapist.id}`}
        image={media.images[0]}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Service',
          name: `${therapist.therapistType} – ${therapist.personName}`,
          ...(therapist.bio ? { description: therapist.bio } : {}),
          ...(vendorName ? { provider: { '@type': 'Organization', name: vendorName } } : {}),
          ...(fromPrice != null
            ? { offers: { '@type': 'AggregateOffer', lowPrice: fromPrice, priceCurrency: 'INR', offerCount: therapist.packages.length } }
            : {}),
        }}
      />

      {/* Hero: gallery (70) + buy box (30) */}
      <PageSection stack aria-labelledby="detail-title">
        <Breadcrumb
          items={[
            { label: t.breadcrumb.home, to: '/' },
            { label: t.breadcrumb.therapists, to: '/therapists' },
            { label: therapist.therapistType },
          ]}
        />
        <div className="detail-page__grid">
          <DetailGallery images={media.images} video={media.video} alt={therapist.personName} discountPct={discountPct} />
          <div className="detail-page__buy">
            <div className="detail-page__chips">
              <sky-badge variant="secondary" size="small">{t.kind}</sky-badge>
              {vendorName &&
                (therapist.vendor?.slug ? (
                  <Link to={`/vendor/${therapist.vendor.slug}`}>
                    <sky-badge variant="primary" size="small">{vendorName}</sky-badge>
                  </Link>
                ) : (
                  <sky-badge variant="primary" size="small">{vendorName}</sky-badge>
                ))}
            </div>
            <h1 id="detail-title" className="detail-page__title headline-medium">{therapist.therapistType}</h1>
            <ul className="detail-page__facts body-large">
              <li>
                <Icon aria-hidden="true">person</Icon>
                {[therapist.personName, therapist.gender].filter(Boolean).join(' · ')}
              </li>
              {experience != null && (
                <li>
                  <Icon aria-hidden="true">workspace_premium</Icon>
                  {experience === 1 ? t.experienceOne : fillTemplate(t.experience, { years: String(experience) })}
                </li>
              )}
              {place && (
                <li>
                  <Icon aria-hidden="true">location_on</Icon>
                  {place}
                </li>
              )}
            </ul>
            {therapist.packages.length > 0 && <DetailPrice price={price} originalPrice={originalPrice} discountPct={discountPct} />}
            <DurationPackageSelector selection={selection} emptyText={t.noPackages} />
            <DetailPurchase
              unitPrice={price}
              quantity={quantity}
              onQuantityChange={setQuantity}
              onAdd={() => void handleAddToCart()}
              addDisabled={!!selection.missingSelection}
              error={actionError}
            />
          </div>
        </div>
      </PageSection>

      {/* About (70) + location and hours (30) */}
      <PageSection tone="tint" aria-labelledby="detail-details-heading">
        <div className="detail-page__grid">
          <div className="detail-page__content">
            <h2 id="detail-details-heading" className="detail-page__heading title-large">{d.details}</h2>
            <sky-accordion>
              {therapist.bio && (
                <sky-accordion-item header={t.about} level={3} open>
                  <p className="detail-page__text body-large">{therapist.bio}</p>
                </sky-accordion-item>
              )}
              {therapist.specialization && (
                <sky-accordion-item header={t.specialization} level={3} {...(!therapist.bio ? { open: true } : {})}>
                  <p className="detail-page__text body-large">{therapist.specialization}</p>
                </sky-accordion-item>
              )}
              <sky-accordion-item header={d.cancellationPolicy} level={3}>
                <p className="detail-page__text body-medium">{d.cancellationText}</p>
              </sky-accordion-item>
            </sky-accordion>
          </div>
          {therapist.branch && <BranchPanels branch={therapist.branch} vendorSlug={therapist.vendor?.slug} />}
        </div>
      </PageSection>

      {related.length > 0 && (
        <PageSection aria-labelledby="related-heading">
          <CardRail id="related-heading" heading={vendorName ? fillTemplate(t.related, { vendor: vendorName }) : d.related}>
            {related.map((item) => (
              <swiper-slide key={item.id} className="card-rail__slide">
                <TherapistCard therapist={item} variant="outlined" />
              </swiper-slide>
            ))}
          </CardRail>
        </PageSection>
      )}
    </>
  );
}
export default TherapistDetail;
