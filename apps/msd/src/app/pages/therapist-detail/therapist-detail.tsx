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

import '../deal-detail/deal-detail.css';

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
      <div className="deal-detail deal-detail--empty">
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

  return (
    <div className="deal-detail">
      <title>{`${therapist.therapistType} — ${therapist.personName} | MSD`}</title>
      <meta
        name="description"
        content={`Book ${therapist.therapistType} ${therapist.personName}${therapist.vendor?.businessName ? ` at ${therapist.vendor.businessName}` : ''}.`}
      />

      <Breadcrumb
        className="deal-detail__breadcrumb"
        items={[
          { label: 'Home', to: '/' },
          { label: 'Therapists', to: '/therapists' },
          { label: therapist.therapistType },
        ]}
      />

      <div className="deal-detail__layout">
        <div className="deal-detail__gallery">
          <div className="deal-detail__main-img-wrap">
            {therapist.photoUrl && (
              <img className="deal-detail__main-img" src={therapist.photoUrl} alt={therapist.personName} width={800} height={450} />
            )}
          </div>
        </div>

        <div className="deal-detail__info">
          <div className="deal-detail__meta-row">
            {therapist.vendor?.businessName && (
              <span className="deal-detail__provider">{therapist.vendor.businessName}</span>
            )}
            <sky-badge variant="primary" size="small">Therapist</sky-badge>
          </div>

          {/* Type + Person are always shown separately, never merged into one field. */}
          <h1 className="deal-detail__title">{therapist.therapistType}</h1>
          <p className="deal-detail__dist" aria-label="Therapist name">
            <Icon aria-hidden="true">person</Icon>
            {therapist.personName}
            {therapist.gender ? ` · ${therapist.gender}` : ''}
          </p>

          {(therapist.branch?.city || therapist.branch?.address) && (
            <p className="deal-detail__dist" aria-label="Location">
              <Icon aria-hidden="true">near_me</Icon>
              {[therapist.branch?.name, therapist.branch?.address ?? therapist.branch?.city].filter(Boolean).join(' · ')}
            </p>
          )}

          {therapist.experienceYears != null && (
            <p className="deal-detail__duration">
              <Icon aria-hidden="true">schedule</Icon>
              {therapist.experienceYears} {pluralize(therapist.experienceYears, 'year')} experience
            </p>
          )}

          {therapist.specialization && <p>{therapist.specialization}</p>}
          {therapist.bio && <p>{therapist.bio}</p>}

          <Divider />

          {fromPrice != null && (
            <div className="deal-detail__price-row">
              <div>
                <span className="deal-detail__price">From ₹{fromPrice.toLocaleString('en-IN')}</span>
              </div>
            </div>
          )}

          <div className="deal-detail__cta">
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
                  className="deal-detail__add-btn"
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
