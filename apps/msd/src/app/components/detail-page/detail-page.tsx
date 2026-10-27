import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilledButton, Icon, OutlinedButton, OutlinedIconButton } from '@skylabs-monorepo/shared-ui/react';
import { getCatalogVendor, type CatalogVendorBranch } from '../../../api/catalog';
import { fillTemplate, formatINR, formatTime12h } from '../../../utils/format';
import content from '../../../content.json';
import './detail-page.css';

const t = content.detailPage;
const g = t.gallery;
/** Horizontal travel that counts as a swipe to the next or previous image. */
const SWIPE_MIN_PX = 40;
const days = content.vendor.days;
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** Whole-number discount between an original and a sale price; 0 when there is none. */
export function discountPercent(price: number, original?: number | null): number {
  return original != null && original > price ? Math.round(((original - price) / original) * 100) : 0;
}

/**
 * Deal and therapist gallery (PLANNING §2.7): the main image with the discount tag, previous /
 * next buttons, swipe on touch screens, thumbnails from 600px and dots below it, the video under
 * it, and a full-screen view (native `<dialog>`: arrow keys, Escape, "3 of 7"). `alts[i]` is the
 * image's own description; `alt` (the item's name) is the fallback.
 */
export function DetailGallery({
  images,
  alts = [],
  video,
  alt,
  discountPct = 0,
}: {
  images: string[];
  alts?: (string | null | undefined)[];
  video?: string | null;
  alt: string;
  discountPct?: number;
}) {
  // The active image belongs to one set of images: a new set starts at the first image again.
  // Kept with the set's key (callers build a new array every render, so the array itself can't be).
  const imagesKey = images.join('|');
  const [selection, setSelection] = useState({ key: imagesKey, index: 0 });
  const active = selection.key === imagesKey ? selection.index : 0;
  const setActive = (next: number | ((index: number) => number)) =>
    setSelection((prev) => {
      const current = prev.key === imagesKey ? prev.index : 0;
      return { key: imagesKey, index: typeof next === 'function' ? next(current) : next };
    });
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const swipeStart = useRef<number | null>(null);

  const count = images.length;
  const altOf = (index: number) => alts[index]?.trim() || alt;
  const go = (delta: number) => setActive((i) => (i + delta + count) % count);
  const counter = (n: number) => fillTemplate(g.counter, { n: String(n + 1), count: String(count) });

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (count < 2) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(1);
    }
  };
  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    swipeStart.current = e.clientX;
  };
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    if (swipeStart.current === null || count < 2) return;
    const dx = e.clientX - swipeStart.current;
    swipeStart.current = null;
    if (Math.abs(dx) > SWIPE_MIN_PX) go(dx < 0 ? 1 : -1);
  };

  const openFullScreen = () => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  };
  const closeFullScreen = () => {
    const dialog = dialogRef.current;
    if (dialog && typeof dialog.close === 'function') dialog.close();
    else dialog?.removeAttribute('open');
    openerRef.current?.focus();
  };

  return (
    <div className="detail-page__gallery" role="group" aria-roledescription="carousel" aria-label={alt} onKeyDown={onKey}>
      <div className="detail-page__main-img-wrap" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        {images[active] && (
          <button
            ref={openerRef}
            type="button"
            className="detail-page__main-btn"
            aria-label={fillTemplate(g.open, { n: String(active + 1), count: String(count) })}
            onClick={openFullScreen}
          >
            <img key={active} className="detail-page__main-img" src={images[active]} alt={altOf(active)} width={800} height={450} />
          </button>
        )}
        {discountPct > 0 && (
          <sky-badge className="detail-page__badge" variant="error" size="large">
            {fillTemplate(t.off, { percent: String(discountPct) })}
          </sky-badge>
        )}
        {count > 1 && (
          <>
            <OutlinedIconButton className="detail-page__nav detail-page__nav--prev" aria-label={g.previous} onClick={() => go(-1)}>
              <Icon aria-hidden="true">chevron_left</Icon>
            </OutlinedIconButton>
            <OutlinedIconButton className="detail-page__nav detail-page__nav--next" aria-label={g.next} onClick={() => go(1)}>
              <Icon aria-hidden="true">chevron_right</Icon>
            </OutlinedIconButton>
            <span className="detail-page__counter label-medium" aria-live="polite">{counter(active)}</span>
          </>
        )}
      </div>
      {count > 1 && (
        <>
          <div className="detail-page__thumbs" role="group" aria-label={t.thumbnails}>
            {images.map((image, index) => (
              <button
                key={`${image}-${index}`}
                type="button"
                className="detail-page__thumb"
                onClick={() => setActive(index)}
                aria-label={fillTemplate(t.viewImage, { n: String(index + 1), count: String(count) })}
                aria-pressed={index === active}
              >
                <img src={image} alt="" width={80} height={60} loading="lazy" />
              </button>
            ))}
          </div>
          <div className="detail-page__dots" role="group" aria-label={t.thumbnails}>
            {images.map((image, index) => (
              <button
                key={`dot-${image}-${index}`}
                type="button"
                className="detail-page__dot"
                onClick={() => setActive(index)}
                aria-label={fillTemplate(t.viewImage, { n: String(index + 1), count: String(count) })}
                aria-pressed={index === active}
              />
            ))}
          </div>
        </>
      )}
      {video && <video className="detail-page__video" controls src={video} />}

      <dialog
        ref={dialogRef}
        className="detail-page__lightbox"
        aria-label={fillTemplate(g.dialog, { title: alt })}
        onCancel={(e) => {
          e.preventDefault();
          closeFullScreen();
        }}
        onKeyDown={(e) => {
          // The gallery around it listens too; handle the key once.
          e.stopPropagation();
          onKey(e);
        }}
      >
        <div className="detail-page__lightbox-bar">
          <span className="label-large" aria-live="polite">{counter(active)}</span>
          <OutlinedIconButton aria-label={g.close} onClick={closeFullScreen}>
            <Icon aria-hidden="true">close</Icon>
          </OutlinedIconButton>
        </div>
        <div className="detail-page__lightbox-stage" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
          {count > 1 && (
            <OutlinedIconButton aria-label={g.previous} onClick={() => go(-1)}>
              <Icon aria-hidden="true">chevron_left</Icon>
            </OutlinedIconButton>
          )}
          {images[active] && <img className="detail-page__lightbox-img" src={images[active]} alt={altOf(active)} />}
          {count > 1 && (
            <OutlinedIconButton aria-label={g.next} onClick={() => go(1)}>
              <Icon aria-hidden="true">chevron_right</Icon>
            </OutlinedIconButton>
          )}
        </div>
      </dialog>
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
  /** Highest quantity allowed (stock left, per-customer limit); no cap when omitted. */
  maxQuantity?: number;
  /** Replaces Add to cart with a disabled "Sold out". */
  soldOut?: boolean;
  /** Extra icon buttons before Share (e.g. the wishlist heart). */
  actions?: ReactNode;
  /** Short lines under the buttons (bought count, ends in, limit). */
  notes?: ReactNode;
  error?: string;
}

/** Quantity stepper, total, Add to cart and the icon actions (extra + Share). */
export function DetailPurchase({ unitPrice, quantity, onQuantityChange, onAdd, addDisabled, maxQuantity, soldOut, actions, notes, error }: DetailPurchaseProps) {
  const atMax = maxQuantity !== undefined && quantity >= maxQuantity;
  return (
    <>
      <div className="detail-page__row body-large">
        <span id="detail-quantity">{t.quantity}</span>
        <div className="detail-page__stepper" role="group" aria-labelledby="detail-quantity">
          <OutlinedIconButton aria-label={t.decrease} disabled={quantity <= 1} onClick={() => onQuantityChange(Math.max(1, quantity - 1))}>
            <Icon aria-hidden="true">remove</Icon>
          </OutlinedIconButton>
          <output aria-live="polite">{quantity}</output>
          <OutlinedIconButton aria-label={t.increase} disabled={soldOut || atMax} onClick={() => onQuantityChange(quantity + 1)}>
            <Icon aria-hidden="true">add</Icon>
          </OutlinedIconButton>
        </div>
      </div>
      <div className="detail-page__row body-large">
        <span>{t.total}</span>
        <strong className="detail-page__total title-large">{formatINR(unitPrice * quantity)}</strong>
      </div>
      <div className="detail-page__actions">
        <FilledButton type="button" className="detail-page__add-btn" onClick={onAdd} disabled={addDisabled || soldOut}>
          <Icon slot="icon" aria-hidden="true">{soldOut ? 'block' : 'shopping_bag'}</Icon>
          {soldOut ? t.soldOut : t.addToCart}
        </FilledButton>
        {actions}
        <ShareButton />
      </div>
      {notes}
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
  addressLine2?: string | null;
  city: string | null;
  latitude: string | null;
  longitude: string | null;
  phone?: string | null;
  /** When the page already has the hours (deal page), no member lookup is made. */
  openingHours?: CatalogVendorBranch['openingHours'] | null;
}

function directionsUrl(branch: DetailBranch): string | undefined {
  if (branch.latitude != null && branch.longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${branch.latitude},${branch.longitude}`;
  }
  const query = [branch.name, branch.address, branch.city].filter(Boolean).join(', ');
  return query ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}` : undefined;
}

/** Location (address, Get directions, call) and the branch's weekly hours: given by the page, or
 *  read from the member's public page (`GET /catalog/vendors/:slug`). */
export function BranchPanels({ branch, vendorSlug }: { branch: DetailBranch; vendorSlug?: string | null }) {
  const given = branch.openingHours !== undefined;
  const [hours, setHours] = useState<CatalogVendorBranch['openingHours'] | null>(branch.openingHours ?? null);
  const [hoursLoaded, setHoursLoaded] = useState(given);

  useEffect(() => {
    if (given) {
      setHours(branch.openingHours ?? null);
      setHoursLoaded(true);
      return;
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- branch.openingHours is read through `given`
  }, [vendorSlug, branch.id, given]);

  const address = [branch.name, [branch.address, branch.addressLine2, branch.city].filter(Boolean).join(', ')].filter(Boolean).join(' — ');
  const directions = directionsUrl(branch);
  return (
    <aside className="detail-page__aside" aria-label={t.locationAndHours}>
      <section className="detail-page__panel" aria-labelledby="detail-location-heading">
        <h3 id="detail-location-heading" className="detail-page__heading title-medium">{t.location}</h3>
        <p className="detail-page__address body-medium">
          <Icon aria-hidden="true">location_on</Icon>
          <span>{address}</span>
        </p>
        <div className="detail-page__panel-actions">
          {directions && (
            <OutlinedButton href={directions} target="_blank" rel="noopener noreferrer" className="detail-page__directions">
              <Icon slot="icon" aria-hidden="true">directions</Icon>
              {t.getDirections}
            </OutlinedButton>
          )}
          {branch.phone && (
            <OutlinedButton href={`tel:${branch.phone.replace(/\s+/g, '')}`} className="detail-page__directions">
              <Icon slot="icon" aria-hidden="true">call</Icon>
              {fillTemplate(t.call, { phone: branch.phone })}
            </OutlinedButton>
          )}
        </div>
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
