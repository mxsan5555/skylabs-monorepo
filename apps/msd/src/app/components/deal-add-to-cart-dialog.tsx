import { useRef, useState, type ReactNode } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import {
  Dialog,
  FilledButton,
  TextButton,
} from '@skylabs-monorepo/shared-ui/react';
import type { CatalogDeal } from '../../api/catalog';
import { addCartItem } from '../../api/cart';
import { ApiRequestError } from '../../api/rbac/client';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { useDealPurchaseSelection } from '../../hooks/use-deal-purchase-selection';
import { DurationPackageSelector } from './duration-package-selector';
import './duration-package-selector.css';
import { formatINR } from '../../utils/format';
import { useToast } from '../../toast/toast-context';

/**
 * THE canonical "Add to Cart" dialog for a service Deal — used by every purchase entry point
 * that shows a compact modal instead of a full page (deal detail, category browse, search).
 * There is no Book Now path anymore: a service Deal is a normal purchasable OrderItem exactly
 * like a Product or a Therapist — select a package, add it to cart, and the ONE unified Cart ->
 * Checkout -> Payment -> Order flow takes it from there (see msd-api's CartItem schema doc
 * comment). The Deal's own duration/price menu (`deal.packages`, a real DealPackage[]) already
 * arrives with the Deal itself, so no fetch is needed here. There is deliberately no in-flow
 * "select a therapist" cross-selection — a Therapist is its own separate cart line, added by
 * clicking its own card elsewhere (see `TherapistAddToCartDialog`).
 */
export function DealAddToCartDialog({
  deal,
  renderTrigger,
  onAdded,
}: {
  deal: CatalogDeal;
  /** Renders whatever trigger UI the caller wants (button label/variant differs per page) — call
   *  the given `open` function on click. */
  renderTrigger: (open: () => void) => ReactNode;
  onAdded?: (label: string) => void;
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

  const submit = async () => {
    if (!isAuthenticated) {
      setError('Please sign in to add this to your cart.');
      return;
    }
    if (missingSelection) {
      setError(missingSelection);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await addCartItem(token, {
        dealId: deal.id,
        ...(activePackage ? { dealPackageId: activePackage.id } : {}),
        quantity: qty,
      });
      dialogRef.current?.close();
      // Only fires after the API call above has actually resolved — never claims success early.
      const label = `${deal.title}${activePackage ? ` — ${activePackage.durationMinutes} Minutes` : ''}`;
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

  const name = deal.title;

  return (
    <>
      {renderTrigger(open)}
      <Dialog ref={dialogRef}>
        <div slot="headline">{name}</div>
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
          <FilledButton onClick={submit} disabled={submitting || !!missingSelection}>
            {submitting ? 'Adding…' : 'Add to Cart'}
          </FilledButton>
        </div>
      </Dialog>
    </>
  );
}

export default DealAddToCartDialog;
