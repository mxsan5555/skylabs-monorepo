import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import { Dialog, Divider, FilledButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getCatalogTherapist, type CatalogTherapist } from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import type { Booking } from '../../../api/bookings';
import { Breadcrumb } from '../../components/breadcrumb';
import { TherapistBookingDialog } from '../../components/therapist-booking-dialog';
import { formatBookingSchedule, bookingDisplayName, pluralize } from '../../../utils/format';
import { resolveTherapistMedia } from '../../../utils/media';
import './therapist-detail.css';
/**
 * Therapist Detail — GET /catalog/therapists/:id. The customer-facing purchase entry point for
 * booking a Therapist directly: Therapist Listing → here → select a package → Book Now, entirely
 * independent of Deal (never requires selecting a Deal first — see msd-api's Therapist schema
 * doc comment). Reuses `deal-detail.css`'s layout classes for visual consistency with the Deal
 * detail page, without pulling in any Deal-specific logic (siblings, cart, wishlist — none of
 * those concepts apply to a Therapist purchased directly).
 */
export function TherapistDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [therapist, setTherapist] = useState<CatalogTherapist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const [activeImg, setActiveImg] = useState(0);
  const resultDialogRef = useRef<MdDialog>(null);
  useEffect(() => {
    if (confirmedBooking) resultDialogRef.current?.show();
  }, [confirmedBooking]);
  useEffect(() => {
    if (!id) {
      setTherapist(null);
      setError('Invalid therapist.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    getCatalogTherapist(id)
      .then(({ data }) => setTherapist(data))
      .catch((err: unknown) => {
        if (err instanceof ApiRequestError && err.status === 404) {
          setTherapist(null);
          return;
        }
        setError(err instanceof ApiRequestError ? err.message : 'Could not load this therapist.');
      })
      .finally(() => setLoading(false));
  }, [id]);
  if (loading) {
    return <p className="loading-state">Loading therapist…</p>;
  }
  if (error || !therapist) {
    return (
      <div className="therapist-detail therapist-detail--empty">
        <title>Therapist Not Found | MSD</title>
        <sky-info-card icon="search_off" heading="Therapist not found" subheading={error || 'This therapist may no longer be available.'} />
        <FilledButton type="button" onClick={() => navigate('/therapists')}>Browse Therapists</FilledButton>
      </div>
    );
  }
  const requireAuthOrRedirect = () => {
    if (isAuthenticated) return true;
    navigate(`/sign-in?next=${encodeURIComponent(`/therapist/${id}`)}`);
    return false;
  };
  const fromPrice = therapist.packages.length > 0 ? Math.min(...therapist.packages.map((p) => Number(p.sellingPrice))) : null;
  const media = resolveTherapistMedia(therapist);
  return (
    <div className="therapist-detail">
      <title>{`${therapist.therapistType} — ${therapist.personName} | MSD`}</title>
      <meta
        name="description"
        content={`Book ${therapist.therapistType} ${therapist.personName}${therapist.vendor?.businessName ? ` at ${therapist.vendor.businessName}` : ''}.`}
      />
      <Breadcrumb
        className="therapist-detail__breadcrumb"
        items={[
          { label: 'Home', to: '/' },
          { label: 'Therapists', to: '/therapists' },
          { label: therapist.therapistType },
        ]}
      />
      <div className="therapist-detail__layout">
        <div className="therapist-detail__gallery">
          <div className="therapist-detail__main-img-wrap">
            {media.images[activeImg] && (
              <img className="therapist-detail__main-img" src={media.images[activeImg]} alt={therapist.personName} width={800} height={450} />
            )}
          </div>
          {media.images.length > 1 && (
            <div className="therapist-detail__thumbs" aria-label="Gallery thumbnails">
              {media.images.map((image, index) => (
                <button
                  key={`${image}-${index}`}
                  type="button"
                  className={`therapist-detail__thumb${index === activeImg ? 'therapist-detail__thumb--active' : ''}`}
                  onClick={() => setActiveImg(index)}
                  aria-label={`View image ${index + 1}`}
                  aria-pressed={index === activeImg}
                >
                  <img src={image} alt="" width={80} height={60} loading="lazy" />
                </button>
              ))}
            </div>
          )}
          {media.video && <video className="therapist-detail__video" controls src={media.video} />}
        </div>
        <div className="therapist-detail__info">
          <div className="therapist-detail__meta-row">
            {therapist.vendor?.businessName && (
              <span className="therapist-detail__provider">{therapist.vendor.businessName}</span>
            )}
            <sky-badge variant="primary" size="small">Therapist</sky-badge>
          </div>
          <h1 className="therapist-detail__title">{therapist.therapistType}</h1>
          <p className="therapist-detail__dist" aria-label="Therapist name">
            <Icon aria-hidden="true">person</Icon>
            {therapist.personName}
            {therapist.gender ? ` · ${therapist.gender}` : ''}
          </p>
          {(therapist.branch?.city || therapist.branch?.address) && (
            <p className="therapist-detail__dist" aria-label="Location">
              <Icon aria-hidden="true">near_me</Icon>
              {[therapist.branch?.name, therapist.branch?.address ?? therapist.branch?.city].filter(Boolean).join(' · ')}
            </p>
          )}
          {therapist.experienceYears != null && (
            <p className="therapist-detail__duration">
              <Icon aria-hidden="true">schedule</Icon>
              {therapist.experienceYears} {pluralize(therapist.experienceYears, 'year')} experience
            </p>
          )}
          {therapist.specialization && <p>{therapist.specialization}</p>}
          {therapist.bio && <p>{therapist.bio}</p>}
          <Divider />
          {fromPrice != null && (
            <div className="therapist-detail__price-row">
              <div>
                <span className="therapist-detail__price">From ₹{fromPrice.toLocaleString('en-IN')}</span>
              </div>
            </div>
          )}
          <div className="therapist-detail__cta">
            <TherapistBookingDialog
              therapist={therapist}
              onBooked={(booking, intent) => {
                if (intent === 'cart') {
                  setActionMessage(`Added "${therapist.therapistType} — ${therapist.personName}" to your cart.`);
                } else {
                  setConfirmedBooking(booking);
                }
              }}
              renderTrigger={(open) => (
                <FilledButton
                  type="button"
                  className="therapist-detail__add-btn"
                  disabled={therapist.packages.length === 0}
                  onClick={() => {
                    if (requireAuthOrRedirect()) open();
                  }}
                >
                  <Icon slot="icon" aria-hidden="true">event_available</Icon>
                  Book Now
                </FilledButton>
              )}
            />
          </div>
          {therapist.packages.length === 0 && (
            <p className="field-hint">This therapist has no bookable packages yet.</p>
          )}
          {actionMessage && <p className="field-hint" role="status">{actionMessage}</p>}
          <Dialog ref={resultDialogRef} onClose={() => setConfirmedBooking(null)}>
            {confirmedBooking && (
              <>
                <span slot="headline">Booking confirmed successfully.</span>
                <div slot="content" className="form-grid">
                  <p><strong>{bookingDisplayName(confirmedBooking)}</strong></p>
                  {confirmedBooking.vendor.businessName && <p>{confirmedBooking.vendor.businessName}</p>}
                  <p>{confirmedBooking.branch.name}</p>
                  <p>{formatBookingSchedule(confirmedBooking.bookingDate, confirmedBooking.timeSlot)}</p>
                  <p className="field-hint">Booking ID: {confirmedBooking.id}</p>
                </div>
                <div slot="actions">
                  <FilledButton onClick={() => resultDialogRef.current?.close()}>Done</FilledButton>
                </div>
              </>
            )}
          </Dialog>
        </div>
      </div>
    </div>
  );
}
export default TherapistDetail;
