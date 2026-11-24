import { useState } from 'react';
import { FilledButton, OutlinedTextField } from '@skylabs-monorepo/shared-ui/react';

export interface ShipFormProps {
  onShip: (input: { carrier: string; trackingNumber: string }) => void | Promise<void>;
  busy?: boolean;
}

/** Carrier + tracking number + submit — "ship this product instead of handing it over in
 *  person," shared by the Orders page's "Ship instead" action and the Order Detail page's
 *  per-item "Ship" action (same form the old voucher wizard used, lifted out so it isn't
 *  duplicated in both places). */
export function ShipForm({ onShip, busy }: ShipFormProps) {
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');

  const submit = async () => {
    await onShip({ carrier: carrier.trim(), trackingNumber: trackingNumber.trim() });
    setCarrier('');
    setTrackingNumber('');
  };

  return (
    <div className="pending-row__ship-form member-action-row">
      <OutlinedTextField label="Carrier" value={carrier} onInput={(e: Event) => setCarrier((e.target as HTMLInputElement).value)} />
      <OutlinedTextField label="Tracking number" value={trackingNumber} onInput={(e: Event) => setTrackingNumber((e.target as HTMLInputElement).value)} />
      <FilledButton onClick={submit} disabled={busy || !carrier.trim() || !trackingNumber.trim()}>Ship</FilledButton>
    </div>
  );
}

export default ShipForm;
