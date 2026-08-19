import type { DealPurchaseSelection } from '../../hooks/use-deal-purchase-selection';
import { formatINR } from '../../utils/format';
import './duration-package-selector.css';

/**
 * THE canonical duration/price selection UI for a service Deal — driven entirely by
 * `useDealPurchaseSelection`'s output, so every purchase entry point (deal detail, category
 * browse dialog, search "Book" dialog, vendor page) renders and behaves identically.
 * Presentational only: it never fetches data or calls an API — the caller owns the Deal feeding
 * the hook, and the eventual Book Now / cart submission.
 *
 * There is deliberately no therapist cross-selection here — a Therapist is only ever selected by
 * clicking its own card elsewhere, never as an optional add-on inside this Deal package list.
 */
export function DurationPackageSelector({ selection }: { selection: DealPurchaseSelection }) {
  const { packages, activePackage, selectPackage } = selection;

  if (packages.length === 0) return null;

  return (
    <div className="dps">
      <div className="dps__section">
        <p className="dps__label">Select your package</p>
        <div className="dps__package-list" role="group" aria-label="Select a duration">
          {packages.map((pkg) => {
            const isSel = activePackage?.id === pkg.id;
            const label = `${pkg.durationMinutes} min`;
            const price = Number(pkg.sellingPrice);
            return (
              <button
                key={pkg.id}
                type="button"
                className={`dps__package-row${isSel ? ' dps__package-row--selected' : ''}`}
                onClick={() => selectPackage(pkg.id)}
                aria-pressed={isSel}
                aria-label={`${label} — ${formatINR(price)}`}
              >
                <span className="dps__package-label">{label}</span>
                <span className="dps__package-price-wrap">
                  <strong className="dps__package-price">{formatINR(price)}</strong>
                  {pkg.originalPrice != null && Number(pkg.originalPrice) !== price && (
                    <s className="dps__package-orig">{formatINR(Number(pkg.originalPrice))}</s>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default DurationPackageSelector;
