import { useRef, useState } from 'react';
import { Dialog, FilledTonalButton, Icon, TextButton } from '@skylabs-monorepo/shared-ui/react';
import { useCatalogShell } from '../../../catalog/catalog-shell';
import { useVisitorLocation } from '../../../location/location-context';
import content from '../../../content.json';

const t = content.header.city;

/** Shows the visitor's city; opens a dialog to pick a city or use the browser location. */
export function CityChip() {
  const { status, city, state, setCity, requestBrowser } = useVisitorLocation();
  const { locations } = useCatalogShell();
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
      {open && (
        <Dialog open onClose={close}>
          <span slot="headline">{t.dialogTitle}</span>
          <div slot="content" className="city-dialog">
            <FilledTonalButton
              onClick={() => {
                requestBrowser();
                close();
              }}
            >
              <Icon slot="icon" aria-hidden="true">
                my_location
              </Icon>
              {t.useCurrent}
            </FilledTonalButton>
            <ul className="city-dialog__list" aria-label={t.listLabel}>
              {locations.map((loc) => (
                <li key={`${loc.state}|${loc.city}`}>
                  <button
                    type="button"
                    className="city-dialog__option body-large"
                    aria-current={loc.city === city && loc.state === state ? 'true' : undefined}
                    onClick={() => {
                      setCity(loc);
                      close();
                    }}
                  >
                    {loc.city}
                    <span className="city-dialog__state body-small">{loc.state}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div slot="actions">
            <TextButton onClick={close}>{t.close}</TextButton>
          </div>
        </Dialog>
      )}
    </>
  );
}
