import type { TherapistPurchaseSelection } from '../../hooks/use-therapist-purchase-selection';
import { formatINR } from '../../utils/format';
import './duration-package-selector.css';

/**
 * THE canonical package/price selection UI for adding a Therapist to cart directly — reuses
 * `duration-package-selector.css`'s `.dps` classes so it reads identically to the Deal purchase
 * flow, but lists the Therapist's OWN packages (never a Deal's sibling rows). Presentational
 * only, driven entirely by `useTherapistPurchaseSelection`'s output.
 */
export function TherapistPackageSelector({ selection }: { selection: TherapistPurchaseSelection }) {
  const { packages, activePackage, selectPackage } = selection;

  if (packages.length === 0) {
    return <p className="empty-state">This therapist has no bookable packages yet.</p>;
  }

  return (
    <div className="dps">
      <div className="dps__section">
        <p className="dps__label">Select your package</p>
        <div className="dps__package-list" role="group" aria-label="Select a duration">
          {packages.map((pkg) => {
            const isSel = activePackage?.id === pkg.id;
            const price = Number(pkg.sellingPrice);
            return (
              <button
                key={pkg.id}
                type="button"
                className={`dps__package-row${isSel ? ' dps__package-row--selected' : ''}`}
                onClick={() => selectPackage(pkg.id)}
                aria-pressed={isSel}
                aria-label={`${pkg.durationMinutes} min — ${formatINR(price)}`}
              >
                <span className="dps__package-label">{pkg.durationMinutes} min</span>
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

export default TherapistPackageSelector;
