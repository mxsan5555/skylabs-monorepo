import { useRef, useState, type ReactNode } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import { Dialog, FilledButton, TextButton } from '@skylabs-monorepo/shared-ui/react';
import type { CatalogTherapist } from '../../api/catalog';
import { addCartItem } from '../../api/cart';
import { ApiRequestError } from '../../api/rbac/client';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { useTherapistPurchaseSelection } from '../../hooks/use-therapist-purchase-selection';
import { TherapistPackageSelector } from './therapist-package-selector';
import './duration-package-selector.css';
import { formatINR } from '../../utils/format';
import { useToast } from '../../toast/toast-context';

/**
 * THE canonical "Add to Cart" dialog for a Therapist purchased directly — no Deal involved at
 * all (see msd-api's CartItem "exactly one of three shapes" schema doc comment). Mirrors
 * `DealAddToCartDialog`'s shape but selects from the Therapist's OWN `packages`, never a
 * sibling-Deal list. A Therapist is a normal purchasable OrderItem exactly like a Deal or
 * Product — there is no Book Now path anymore, only Add to Cart.
 */
export function TherapistAddToCartDialog({
  therapist,
  renderTrigger,
  onAdded,
}: {
  therapist: CatalogTherapist;
  renderTrigger: (open: () => void) => ReactNode;
  onAdded?: (label: string) => void;
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

  const submit = async () => {
    if (!isAuthenticated) {
      setError('Please sign in to add this to your cart.');
      return;
    }
    if (missingSelection || !activePackage) {
      setError(missingSelection ?? 'Please select a duration.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await addCartItem(token, {
        therapistId: therapist.id,
        therapistPackageId: activePackage.id,
        quantity: qty,
      });
      dialogRef.current?.close();
      // Only fires after the API call above has actually resolved — never claims success early.
      const label = `${therapist.therapistType} — ${therapist.personName} — ${activePackage.durationMinutes} Minutes`;
      showToast(`Added to cart\n${label}`);
      onAdded?.(label);
    } catch (err) {
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
        <div slot="headline">{therapist.therapistType} — {therapist.personName}</div>
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
          <FilledButton onClick={submit} disabled={submitting || !!missingSelection}>
            {submitting ? 'Adding…' : 'Add to Cart'}
          </FilledButton>
        </div>
      </Dialog>
    </>
  );
}

export default TherapistAddToCartDialog;
