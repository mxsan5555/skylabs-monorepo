import { useRef, useState } from 'react';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import { useVisitorLocation } from '../../../location/location-context';
import { CityPickerDialog } from '../city-picker-dialog/city-picker-dialog';
import content from '../../../content.json';

const t = content.header.city;

/** Shows the visitor's city; opens a dialog to pick a city or use the browser location. */
export function CityChip() {
  const { status, city } = useVisitorLocation();
  const [open, setOpen] = useState(false);
  const chipRef = useRef<HTMLButtonElement>(null);
  const label = status === 'locating' ? t.locating : (city ?? t.setLocation);

  // The dialog unmounts on close, so md-dialog cannot restore focus itself; return it to the chip.
  const close = () => {
    setOpen(false);
    chipRef.current?.focus();
  };

  return (
    <>
      <button
        ref={chipRef}
        type="button"
        className="city-chip label-large"
        aria-haspopup="dialog"
        aria-label={`${t.changeLabel}: ${label}`}
        onClick={() => setOpen(true)}
      >
        <Icon aria-hidden="true">location_on</Icon>
        <span className="city-chip__text">{label}</span>
      </button>
      {open && <CityPickerDialog onClose={close} />}
    </>
  );
}
