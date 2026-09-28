import { Dialog, FilledTonalButton, Icon, TextButton } from '@skylabs-monorepo/shared-ui/react';
import { useCatalogShell } from '../../../catalog/catalog-shell';
import { useVisitorLocation } from '../../../location/location-context';
import content from '../../../content.json';
import './city-picker-dialog.css';

const t = content.header.city;

/** City picker dialog: choose a catalog city or use the browser location. Extracted from
 *  `CityChip` so other entry points (e.g. the filter panel) can open the same dialog. */
export function CityPickerDialog({ onClose }: { onClose: () => void }) {
  const { city, state, setCity, requestBrowser } = useVisitorLocation();
  const { locations } = useCatalogShell();

  return (
    <Dialog open onClose={onClose}>
      <span slot="headline">{t.dialogTitle}</span>
      <div slot="content" className="city-dialog">
        <FilledTonalButton
          onClick={() => {
            requestBrowser();
            onClose();
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
                  onClose();
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
        <TextButton onClick={onClose}>{t.close}</TextButton>
      </div>
    </Dialog>
  );
}
