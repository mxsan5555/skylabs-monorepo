import { useRef, useState, type ReactNode } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import {
  Dialog,
  FilledButton,
  OutlinedButton,
  TextButton,
} from '@skylabs-monorepo/shared-ui/react';
import type { CatalogTherapist } from '../../api/catalog';
import { createBooking, type Booking } from '../../api/bookings';
import { ApiRequestError } from '../../api/rbac/client';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { useTherapistPurchaseSelection } from '../../hooks/use-therapist-purchase-selection';
import { TherapistPackageSelector } from './therapist-package-selector';
import './duration-package-selector.css';
import { formatINR } from '../../utils/format';
import { useToast } from '../../toast/toast-context';

/**
 * THE canonical "Book Now" dialog for booking a Therapist directly — no Deal involved at all
 * (see msd-api's Booking "exactly one of dealId/therapistId" doc comment). Mirrors
 * `DealBookingDialog`'s shape (same `renderTrigger`/`onBooked` contract, same "never asks for a
 * date/time" — this is a service purchase, not an appointment-scheduling system) but selects
 * from the Therapist's OWN `packages`, never a sibling-Deal list, and never fabricates a Deal
 * record to route through the Deal booking path.
 */
export function TherapistBookingDialog({
  therapist,
  renderTrigger,
  onBooked,
}: {
  therapist: CatalogTherapist;
  renderTrigger: (open: () => void) => ReactNode;
  /** `intent` distinguishes which button the customer pressed — the backend call is identical
   *  either way (`createBooking`; a Booking IS the commitment the moment it's created, there's
   *  no separate cart-accumulation step), only the caller's confirmation UI differs: "book" shows
   *  a full confirmation, "cart" shows a lighter "Added to cart" message and points at /cart,
   *  where this same PENDING booking is now listed alongside Product cart items. */
  onBooked?: (booking: Booking, intent: 'book' | 'cart') => void;
}) {
  const { token, isAuthenticated } = useAuth();
  const dialogRef = useRef<MdDialog>(null);
  const { showToast } = useToast();

  const [qty] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const selection = useTherapistPurchaseSelection(therapist.packages);
  const { activePackage, unitPrice, missingSelection } = selection;

  const open = () => dialogRef.current?.show();

  const submit = async (intent: 'book' | 'cart') => {
    if (!isAuthenticated) {
      setError('Please sign in to book.');
      return;
    }
    if (missingSelection || !activePackage) {
      setError(missingSelection ?? 'Please select a duration.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const { data } = await createBooking(token, {
        therapistId: therapist.id,
        durationMinutes: activePackage.durationMinutes,
        quantity: qty,
        // No date/time in this flow — this is a service purchase, not an appointment-scheduling
        // system (see Booking's schema doc comment in msd-api); never asked of the customer here.
      });
      dialogRef.current?.close();
      // Only fires after the API call above has actually resolved — never claims success early.
      const label = `${therapist.personName} — ${activePackage.durationMinutes} Minutes`;
      showToast(intent === 'cart' ? `Added to cart\n${label}` : `Booked\n${label}`);
      onBooked?.(data, intent);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409) {
        setError('Already booked. Your existing booking is still active.');
        showToast('Already booked. Your existing booking is still active.', 'error');
        return;
      }
      const message = err instanceof ApiRequestError ? err.message : 'Unable to add item to cart.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {renderTrigger(open)}
      <Dialog ref={dialogRef}>
        <div slot="headline">Book {therapist.therapistType} — {therapist.personName}</div>
        <div slot="content" className="form-grid">
          <TherapistPackageSelector selection={selection} />

          {activePackage && (
            <div className="dps__price-row">
              <span>Price</span>
              <strong>{formatINR(unitPrice)}</strong>
            </div>
          )}

          {missingSelection && <p className="field-hint">{missingSelection}</p>}

          {error && <p className="error-state" role="alert">{error}</p>}
        </div>
        <div slot="actions">
          <TextButton onClick={() => dialogRef.current?.close()}>Cancel</TextButton>
          <OutlinedButton onClick={() => submit('cart')} disabled={submitting || !!missingSelection}>
            {submitting ? 'Adding…' : 'Add to Cart'}
          </OutlinedButton>
          <FilledButton onClick={() => submit('book')} disabled={submitting || !!missingSelection}>
            {submitting ? 'Booking…' : 'Book Now'}
          </FilledButton>
        </div>
      </Dialog>
    </>
  );
}

export default TherapistBookingDialog;
