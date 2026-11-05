import { fillTemplate, formatINR } from '../../utils/format';
import content from '../../content.json';
import './duration-package-selector.css';

const t = content.detailPage;
const p = content.dealDetail.package;

/** A bookable duration of a service Deal or a Therapist (`DealPackage` / `TherapistPackage`).
 *  Deal packages also carry a name, people and inclusions (PLANNING §2.7). */
export interface DurationPackage {
  id: string;
  durationMinutes: number;
  sellingPrice: string | number;
  originalPrice: string | number | null;
  name?: string | null;
  persons?: number;
  inclusions?: string[];
}

/** What `useDealPurchaseSelection` and `useTherapistPurchaseSelection` both return. */
export interface PackageSelection<P extends DurationPackage = DurationPackage> {
  packages: P[];
  activePackage: P | null;
  selectPackage: (packageId: string) => void;
}

/**
 * THE duration/price picker for every purchase entry point (deal and therapist detail pages, the
 * add-to-cart dialogs, the vendor page), driven by a purchase-selection hook. Presentational only:
 * the caller owns the data and the cart call. With no packages it renders `emptyText`, if given.
 */
export function DurationPackageSelector({ selection, emptyText }: { selection: PackageSelection; emptyText?: string }) {
  const { packages, activePackage, selectPackage } = selection;

  if (packages.length === 0) return emptyText ? <p className="empty-state">{emptyText}</p> : null;

  return (
    <div className="dps">
      <div className="dps__section">
        <p className="dps__label">{t.selectPackage}</p>
        <div className="dps__package-list" role="group" aria-label={t.packageList}>
          {packages.map((pkg) => {
            const isSel = activePackage?.id === pkg.id;
            const minutes = fillTemplate(t.packageOption, { minutes: String(pkg.durationMinutes) });
            const people = pkg.persons && pkg.persons > 1 ? fillTemplate(p.forPeople, { count: String(pkg.persons) }) : '';
            const label = pkg.name?.trim() || minutes;
            const meta = [pkg.name?.trim() ? minutes : '', people].filter(Boolean).join(' · ');
            const price = Number(pkg.sellingPrice);
            return (
              <button
                key={pkg.id}
                type="button"
                className={`dps__package-row${isSel ? ' dps__package-row--selected' : ''}`}
                onClick={() => selectPackage(pkg.id)}
                aria-pressed={isSel}
              >
                <span className="dps__package-text">
                  <span className="dps__package-label">{label}</span>
                  {meta && <span className="dps__package-meta">{meta}</span>}
                  {pkg.inclusions && pkg.inclusions.length > 0 && (
                    <span className="dps__package-meta">
                      {p.includes}: {pkg.inclusions.join(', ')}
                    </span>
                  )}
                </span>
                <span className="dps__package-price-wrap">
                  <strong className="dps__package-price">{formatINR(price)}</strong>
                  {pkg.originalPrice != null && Number(pkg.originalPrice) !== price && (
                    <s className="dps__package-orig" aria-label={fillTemplate(t.originalPrice, { price: formatINR(Number(pkg.originalPrice)) })}>
                      {formatINR(Number(pkg.originalPrice))}
                    </s>
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
