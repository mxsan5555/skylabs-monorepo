import { createElement, type ChangeEvent } from 'react';
import '@skylabs-monorepo/shared-ui';
import type { CatalogDealFacets } from '../../../api/catalog';
import { CheckboxFacet } from '../checkbox-facet/checkbox-facet';
import { PriceRangeField, type PriceRange } from '../price-range-field/price-range-field';
import type content from '../../../content.json';
import './filter-panel.css';

type FilterPanelCopy = (typeof content)['category']['filterPanel'];

export interface FilterPanelProps {
  kind: 'deals' | 'products';
  facets: CatalogDealFacets | null;
  location: { city: string | null; hasCoords: boolean };
  onChangeLocation: () => void;
  radiusKm?: number;
  onRadius: (km: number | undefined) => void;
  price: PriceRange;
  priceBounds: { min: number; max: number; step: number };
  onPrice: (range: PriceRange) => void;
  vendorIds: string[];
  onVendors: (ids: string[]) => void;
  branchIds: string[];
  onBranches: (ids: string[]) => void;
  onClearAll: () => void;
  copy: FilterPanelCopy;
}

const textButton = (props: Record<string, unknown>, label: string) => createElement('md-text-button', props, label);

/** Groupon-style filter side panel: location, distance, price, business and branch facets in an
 *  accordion. Deal-only sections are skipped for `kind="products"`. Raw M3 elements (radios,
 *  buttons) so tests can drive them directly. */
export function FilterPanel({
  kind,
  facets,
  location,
  onChangeLocation,
  radiusKm,
  onRadius,
  price,
  priceBounds,
  onPrice,
  vendorIds,
  onVendors,
  branchIds,
  onBranches,
  onClearAll,
  copy,
}: FilterPanelProps) {
  const isDeals = kind === 'deals';
  const distance = facets?.distance ?? [];
  const distanceDisabled = !location.hasCoords;

  const onRadioChange = (e: ChangeEvent<HTMLElement & { value: string }>) => {
    const raw = e.currentTarget.value;
    onRadius(raw === '' ? undefined : Number(raw));
  };

  return (
    <div className="filter-panel">
      <h2 className="filter-panel__title title-medium">{copy.title}</h2>
      <sky-accordion>
        {isDeals && (
          <sky-accordion-item header={copy.location.title} open>
            <div className="filter-panel__location">
              <p className="body-medium">{location.city ?? copy.location.notSet}</p>
              {textButton({ onClick: onChangeLocation }, copy.location.change)}
            </div>
          </sky-accordion-item>
        )}

        {isDeals && (
          <sky-accordion-item header={copy.distance.title} open>
            <div className="filter-panel__distance">
              <ul className="checkbox-facet__list">
                <li>
                  <label className="filter-panel__radio">
                    {createElement('md-radio', {
                      name: 'radius',
                      value: '',
                      checked: radiusKm === undefined,
                      disabled: distanceDisabled,
                      onChange: onRadioChange,
                    })}
                    <span className="checkbox-facet__label body-medium">{copy.distance.any}</span>
                  </label>
                </li>
                {distance.map((bucket) => (
                  <li key={bucket.km}>
                    <label className="filter-panel__radio">
                      {createElement('md-radio', {
                        name: 'radius',
                        value: String(bucket.km),
                        checked: radiusKm === bucket.km,
                        disabled: distanceDisabled,
                        onChange: onRadioChange,
                      })}
                      <span className="checkbox-facet__label body-medium">
                        {copy.distance.within.replace('{km}', String(bucket.km))}
                      </span>
                      <span className="checkbox-facet__count label-small">{bucket.count}</span>
                    </label>
                  </li>
                ))}
              </ul>
              {distanceDisabled && <p className="filter-panel__hint body-small">{copy.distance.needsLocation}</p>}
            </div>
          </sky-accordion-item>
        )}

        <sky-accordion-item header={copy.price.title} open>
          <PriceRangeField bounds={priceBounds} value={price} onChange={onPrice} copy={copy.price} />
        </sky-accordion-item>

        {isDeals && (
          <sky-accordion-item header={copy.business.title} open>
            <CheckboxFacet
              options={(facets?.vendors ?? []).map((v) => ({ value: v.id, label: v.name, count: v.count }))}
              selected={vendorIds}
              onChange={onVendors}
              searchLabel={copy.business.search}
              showMore={copy.showMore}
              showLess={copy.showLess}
            />
          </sky-accordion-item>
        )}

        {isDeals && (
          <sky-accordion-item header={copy.branches.title} open>
            <CheckboxFacet
              options={(facets?.branches ?? []).map((b) => ({
                value: b.id,
                label: b.city ? `${b.name}, ${b.city}` : b.name,
                count: b.count,
              }))}
              selected={branchIds}
              onChange={onBranches}
              searchLabel={copy.branches.search}
              showMore={copy.showMore}
              showLess={copy.showLess}
            />
          </sky-accordion-item>
        )}
      </sky-accordion>
      <div className="filter-panel__footer">{textButton({ onClick: onClearAll }, copy.clearAll)}</div>
    </div>
  );
}
