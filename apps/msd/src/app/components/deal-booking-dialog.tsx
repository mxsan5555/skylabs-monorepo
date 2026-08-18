import { useRef, useState, type ReactNode } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import {
  Dialog,
  FilledButton,
  OutlinedButton,
  TextButton,
} from '@skylabs-monorepo/shared-ui/react';
import type { CatalogDeal } from '../../api/catalog';
import { createBooking, type Booking } from '../../api/bookings';
import { ApiRequestError } from '../../api/rbac/client';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { useDealPurchaseSelection } from '../../hooks/use-deal-purchase-selection';
import { DurationPackageSelector } from './duration-package-selector';
import './duration-package-selector.css';
import { formatINR } from '../../utils/format';
import { useToast } from '../../toast/toast-context';

/**
 * THE canonical "Book Now" dialog for a service Deal — used by every purchase entry point that
 * shows a compact modal instead of a full page/sidebar (deal detail, category browse, search).
 * The Deal's own duration/price menu (`deal.packages`, a real DealPackage[] — mirrors
 * TherapistPackage exactly, see its schema doc comment in msd-api) already arrives with the Deal
 * itself, so no fetch is needed here at all. Never asks for a date/time — this is a service
 * purchase, not an appointment-scheduling system (see Booking's schema doc comment in msd-api),
 * so `bookingDate`/`timeSlot` are simply omitted from every `createBooking` call here. There is
 * deliberately no in-flow "select a therapist" cross-selection — a Therapist is only ever
 * selected by clicking its own card elsewhere (see `TherapistBookingDialog`).
 */
export function DealBookingDialog({
  deal,
  renderTrigger,
  onBooked,
}: {
  deal: CatalogDeal;
  /** Renders whatever trigger UI the caller wants (button label/variant differs per page) — call
   *  the given `open` function on click. */
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

  const selection = useDealPurchaseSelection(deal);
  const { activePackage, unitPrice, missingSelection } = selection;

  const open = () => dialogRef.current?.show();

  const submit = async (intent: 'book' | 'cart') => {
    if (!isAuthenticated) {
      setError('Please sign in to book.');
      return;
    }
    if (missingSelection) {
      setError(missingSelection);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const { data } = await createBooking(token, {
        dealId: deal.id,
        quantity: qty,
        ...(activePackage ? { dealPackageId: activePackage.id } : {}),
        // No date/time in this flow — this is a service purchase, not an appointment-scheduling
        // system (see Booking's schema doc comment in msd-api); never asked of the customer here.
      });
      dialogRef.current?.close();
      // Only fires after the API call above has actually resolved — never claims success early.
      const label = `${deal.service?.name ?? deal.title}${activePackage ? ` — ${activePackage.durationMinutes} Minutes` : ''}`;
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

  const name = deal.service?.name ?? deal.title;

  return (
    <>
      {renderTrigger(open)}
      <Dialog ref={dialogRef}>
        <div slot="headline">Book {name}</div>
        <div slot="content" className="form-grid">
          <DurationPackageSelector selection={selection} />

          <div className="dps__price-row">
            <span>Price</span>
            <strong>{formatINR(unitPrice)}</strong>
          </div>

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

export default DealBookingDialog;
