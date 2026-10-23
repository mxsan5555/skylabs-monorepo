import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilledButton, Icon, OutlinedButton, OutlinedIconButton } from '@skylabs-monorepo/shared-ui/react';
import { getCatalogVendor, type CatalogVendorBranch } from '../../../api/catalog';
import { fillTemplate, formatINR, formatTime12h } from '../../../utils/format';
import content from '../../../content.json';
import './detail-page.css';

const t = content.detailPage;
const days = content.vendor.days;
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** Whole-number discount between an original and a sale price; 0 when there is none. */
export function discountPercent(price: number, original?: number | null): number {
  return original != null && original > price ? Math.round(((original - price) / original) * 100) : 0;
}

/** Main image (with the discount tag), thumbnails to switch it, and the video when there is one. */
export function DetailGallery({ images, video, alt, discountPct = 0 }: { images: string[]; video?: string | null; alt: string; discountPct?: number }) {
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [images]);
  const count = String(images.length);
  return (
    <div className="detail-page__gallery">
      <div className="detail-page__main-img-wrap">
        {images[active] && (
          <img key={active} className="detail-page__main-img" src={images[active]} alt={alt} width={800} height={450} />
        )}
        {discountPct > 0 && (
          <sky-badge className="detail-page__badge" variant="error" size="large">
            {fillTemplate(t.off, { percent: String(discountPct) })}
          </sky-badge>
        )}
      </div>
      {images.length > 1 && (
        <div className="detail-page__thumbs" role="group" aria-label={t.thumbnails}>
          {images.map((image, index) => (
            <button
              key={`${image}-${index}`}
              type="button"
              className="detail-page__thumb"
              onClick={() => setActive(index)}
              aria-label={fillTemplate(t.viewImage, { n: String(index + 1), count })}
              aria-pressed={index === active}
            >
              <img src={image} alt="" width={80} height={60} loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {video && <video className="detail-page__video" controls src={video} />}
    </div>
  );
}

/** Current price, the struck-through original and the discount tag. */
export function DetailPrice({ price, originalPrice, discountPct }: { price: number; originalPrice?: number | null; discountPct: number }) {
  return (
    <div className="detail-page__price-row">
      <span className="detail-page__price headline-medium">{formatINR(price)}</span>
      {originalPrice != null && originalPrice > price && (
        <s className="detail-page__original-price body-large" aria-label={fillTemplate(t.originalPrice, { price: formatINR(originalPrice) })}>
          {formatINR(originalPrice)}
        </s>
      )}
      {discountPct > 0 && (
        <sky-badge variant="error" size="small">{fillTemplate(t.off, { percent: String(discountPct) })}</sky-badge>
      )}
    </div>
  );
}

function ShareButton() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <OutlinedIconButton aria-label={copied ? t.copied : t.share} onClick={() => void copy()}>
      <Icon aria-hidden="true">{copied ? 'check' : 'link'}</Icon>
    </OutlinedIconButton>
  );
}

export interface DetailPurchaseProps {
  unitPrice: number;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  onAdd: () => void;
  addDisabled?: boolean;
  /** Extra icon buttons before Share (e.g. the wishlist heart). */
  actions?: ReactNode;
  error?: string;
}

/** Quantity stepper, total, Add to cart and the icon actions (extra + Share). */
export function DetailPurchase({ unitPrice, quantity, onQuantityChange, onAdd, addDisabled, actions, error }: DetailPurchaseProps) {
  return (
    <>
      <div className="detail-page__row body-large">
        <span id="detail-quantity">{t.quantity}</span>
        <div className="detail-page__stepper" role="group" aria-labelledby="detail-quantity">
          <OutlinedIconButton aria-label={t.decrease} disabled={quantity <= 1} onClick={() => onQuantityChange(Math.max(1, quantity - 1))}>
            <Icon aria-hidden="true">remove</Icon>
          </OutlinedIconButton>
          <output aria-live="polite">{quantity}</output>
          <OutlinedIconButton aria-label={t.increase} onClick={() => onQuantityChange(quantity + 1)}>
            <Icon aria-hidden="true">add</Icon>
          </OutlinedIconButton>
        </div>
      </div>
      <div className="detail-page__row body-large">
        <span>{t.total}</span>
        <strong className="detail-page__total title-large">{formatINR(unitPrice * quantity)}</strong>
      </div>
      <div className="detail-page__actions">
        <FilledButton type="button" className="detail-page__add-btn" onClick={onAdd} disabled={addDisabled}>
          <Icon slot="icon" aria-hidden="true">shopping_bag</Icon>
          {t.addToCart}
        </FilledButton>
        {actions}
        <ShareButton />
      </div>
      {error && (
        <p className="error-state" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

export interface DetailBranch {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  latitude: string | null;
  longitude: string | null;
}

function directionsUrl(branch: DetailBranch): string | undefined {
  if (branch.latitude != null && branch.longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${branch.latitude},${branch.longitude}`;
  }
  const query = [branch.name, branch.address, branch.city].filter(Boolean).join(', ');
  return query ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}` : undefined;
}

/** Location (address + Get directions) and the branch's weekly hours (from the member's public
 *  page, `GET /catalog/vendors/:slug`). */
export function BranchPanels({ branch, vendorSlug }: { branch: DetailBranch; vendorSlug?: string | null }) {
  const [hours, setHours] = useState<CatalogVendorBranch['openingHours'] | null>(null);
  const [hoursLoaded, setHoursLoaded] = useState(false);

  useEffect(() => {
    if (!vendorSlug) {
      setHours(null);
      setHoursLoaded(true);
      return;
    }
    let cancelled = false;
    setHoursLoaded(false);
    getCatalogVendor(vendorSlug)
      .then(({ data }) => { if (!cancelled) setHours(data.branches.find((b) => b.id === branch.id)?.openingHours ?? null); })
      .catch(() => { if (!cancelled) setHours(null); })
      .finally(() => { if (!cancelled) setHoursLoaded(true); });
    return () => { cancelled = true; };
  }, [vendorSlug, branch.id]);

  const address = [branch.name, [branch.address, branch.city].filter(Boolean).join(', ')].filter(Boolean).join(' — ');
  const directions = directionsUrl(branch);
  return (
    <aside className="detail-page__aside" aria-label={t.locationAndHours}>
      <section className="detail-page__panel" aria-labelledby="detail-location-heading">
        <h3 id="detail-location-heading" className="detail-page__heading title-medium">{t.location}</h3>
        <p className="detail-page__address body-medium">
          <Icon aria-hidden="true">location_on</Icon>
          <span>{address}</span>
        </p>
        {directions && (
          <OutlinedButton href={directions} target="_blank" rel="noopener noreferrer" className="detail-page__directions">
            <Icon slot="icon" aria-hidden="true">directions</Icon>
            {t.getDirections}
          </OutlinedButton>
        )}
      </section>
      {hoursLoaded && (
        <section className="detail-page__panel" aria-labelledby="detail-hours-heading">
          <h3 id="detail-hours-heading" className="detail-page__heading title-medium">{t.hours}</h3>
          {hours && Object.keys(hours).length > 0 ? (
            <ul className="detail-page__hours body-small">
              {DAY_ORDER.map((day) => {
                const h = hours[day];
                const time = h?.open && h.start && h.end ? `${formatTime12h(h.start)} – ${formatTime12h(h.end)}` : content.vendor.labels.closed;
                return (
                  <li key={day}>
                    <strong>{days[day]}</strong>
                    <span>{time}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="detail-page__text body-small">{content.vendor.labels.timingsNotAvailable}</p>
          )}
        </section>
      )}
    </aside>
  );
}

/** Not-found state with a way back to browsing. */
export function DetailNotFound({ copy, to }: { copy: { metaTitle: string; heading: string; subheading: string; cta: string }; to: string }) {
  const navigate = useNavigate();
  return (
    <div className="detail-page__empty">
      <title>{copy.metaTitle}</title>
      <meta name="robots" content="noindex" />
      <sky-info-card icon="search_off" heading={copy.heading} subheading={copy.subheading} />
      <FilledButton type="button" onClick={() => navigate(to)}>
        {copy.cta}
      </FilledButton>
    </div>
  );
}
