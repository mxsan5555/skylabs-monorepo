import { fireEvent, render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FilterPanel } from './filter-panel';
import type { CatalogDealFacets } from '../../../api/catalog';
import content from '../../../content.json';

const copy = content.category.filterPanel;

const facets: CatalogDealFacets = {
  vendors: [
    { id: 'v1', name: 'Glow Beauty Studio', count: 5 },
    { id: 'v2', name: 'Zen Spa', count: 3 },
  ],
  branches: [
    { id: 'b1', name: 'Main', city: 'Gorakhpur', vendorName: 'Glow Beauty Studio', count: 4 },
    { id: 'b2', name: 'East', city: null, vendorName: 'Zen Spa', count: 2 },
  ],
  distance: [
    { km: 1, count: 0 },
    { km: 5, count: 3 },
    { km: 10, count: 5 },
    { km: 20, count: 6 },
    { km: 50, count: 6 },
    { km: 100, count: 6 },
  ],
  price: { min: 299, max: 3499 },
  tags: [
    { tag: 'expire_soon', count: 0 },
    { tag: 'hot', count: 2 },
    { tag: 'new', count: 4 },
    { tag: 'deal', count: 1 },
  ],
};

function baseProps(overrides: Partial<React.ComponentProps<typeof FilterPanel>> = {}) {
  return {
    kind: 'deals' as const,
    facets,
    location: { city: 'Gorakhpur', hasCoords: true },
    onChangeLocation: vi.fn(),
    radiusKm: undefined,
    onRadius: vi.fn(),
    price: {},
    priceBounds: { min: 0, max: 5000, step: 100 },
    onPrice: vi.fn(),
    vendorIds: [],
    onVendors: vi.fn(),
    branchIds: [],
    onBranches: vi.fn(),
    tags: [],
    onTags: vi.fn(),
    onClearAll: vi.fn(),
    copy,
    ...overrides,
  };
}

/** The md-checkbox whose `value` property (set by React, not reflected) is `value`. */
const checkboxIn = (root: ParentNode, value: string) =>
  (Array.from(root.querySelectorAll('md-checkbox')) as (HTMLElement & { checked: boolean; value: string })[]).find((c) => c.value === value) as HTMLElement & { checked: boolean };

const accordionItems = () => Array.from(document.querySelectorAll('sky-accordion-item')) as (HTMLElement & { header?: string })[];

describe('FilterPanel', () => {
  it('renders a sky-accordion with all 6 sections for deals', () => {
    render(<FilterPanel {...baseProps()} />);
    expect(document.querySelector('sky-accordion')).toBeTruthy();
    expect(accordionItems().map((i) => i.header)).toEqual([
      copy.location.title,
      copy.distance.title,
      copy.price.title,
      copy.tags.title,
      copy.business.title,
      copy.branches.title,
    ]);
  });

  it('therapists: location, distance, price, business and branches; no tags (ST-41)', () => {
    render(<FilterPanel {...baseProps({ kind: 'therapists' })} />);
    expect(accordionItems().map((i) => i.header)).toEqual([
      copy.location.title,
      copy.distance.title,
      copy.price.title,
      copy.business.title,
      copy.branches.title,
    ]);
  });

  it('products with a category facet: category, price and tags; no location or distance (ST-41)', () => {
    const onCategories = vi.fn();
    render(
      <FilterPanel
        {...baseProps({
          kind: 'products',
          facets: { ...facets, categories: [{ id: 'c1', name: 'Skin', slug: 'skin', count: 3 }] },
          categoryIds: [],
          onCategories,
        })}
      />,
    );
    expect(accordionItems().map((i) => i.header)).toEqual([copy.category.title, copy.price.title, copy.tags.title]);
    const box = checkboxIn(document.body, 'c1');
    box.checked = true;
    fireEvent.change(box);
    expect(onCategories).toHaveBeenCalledWith(['c1']);
  });

  it('lists the four tags with counts and reports a picked tag (ST-41)', () => {
    const onTags = vi.fn();
    render(<FilterPanel {...baseProps({ onTags })} />);
    const tagSection = accordionItems().find((i) => i.header === copy.tags.title) as HTMLElement;
    expect(Array.from(tagSection.querySelectorAll('.checkbox-facet__label')).map((l) => l.textContent)).toEqual([
      content.offerCard.tags.expire_soon,
      content.offerCard.tags.hot,
      content.offerCard.tags.new,
      content.offerCard.tags.deal,
    ]);
    const hot = checkboxIn(tagSection, 'hot');
    hot.checked = true;
    fireEvent.change(hot);
    expect(onTags).toHaveBeenCalledWith(['hot']);
  });

  it('all (explore): location, distance and price only (ST-43)', () => {
    render(<FilterPanel {...baseProps({ kind: 'all' })} />);
    expect(accordionItems().map((i) => i.header)).toEqual([copy.location.title, copy.distance.title, copy.price.title]);
  });

  it('has no Reviews section (no review system yet, ST-22)', () => {
    render(<FilterPanel {...baseProps()} />);
    expect(accordionItems().some((i) => /review/i.test(i.header ?? ''))).toBe(false);
  });

  it('shows the current city and calls onChangeLocation', () => {
    const onChangeLocation = vi.fn();
    render(<FilterPanel {...baseProps({ onChangeLocation })} />);
    expect(document.body.textContent).toContain('Gorakhpur');
    const changeButton = Array.from(document.querySelectorAll('md-text-button')).find((b) => b.textContent === copy.location.change) as HTMLElement;
    fireEvent.click(changeButton);
    expect(onChangeLocation).toHaveBeenCalled();
  });

  it('renders 7 distance radios with counts and reports the picked radius', () => {
    const onRadius = vi.fn();
    render(<FilterPanel {...baseProps({ onRadius })} />);
    const radios = Array.from(document.querySelectorAll('md-radio')) as (HTMLElement & { checked: boolean; value: string })[];
    expect(radios).toHaveLength(7);

    const fiveKmRadio = radios.find((r) => r.value === '5') as HTMLElement & { checked: boolean };
    const within5 = fiveKmRadio.closest('.filter-panel__radio') as HTMLElement;
    expect(within5.textContent).toContain('3');

    fiveKmRadio.checked = true;
    fireEvent.change(fiveKmRadio);
    expect(onRadius).toHaveBeenCalledWith(5);

    onRadius.mockClear();
    const anyRadio = radios.find((r) => r.value === '') as HTMLElement & { checked: boolean };
    anyRadio.checked = true;
    fireEvent.change(anyRadio);
    expect(onRadius).toHaveBeenCalledWith(undefined);
  });

  it('disables distance radios and shows a hint without coordinates', () => {
    render(<FilterPanel {...baseProps({ location: { city: null, hasCoords: false } })} />);
    const radios = Array.from(document.querySelectorAll('md-radio')) as (HTMLElement & { disabled: boolean })[];
    expect(radios.every((r) => r.disabled)).toBe(true);
    expect(document.body.textContent).toContain(copy.distance.needsLocation);
  });

  it('products without a category facet: price and tags only', () => {
    render(<FilterPanel {...baseProps({ kind: 'products' })} />);
    expect(accordionItems().map((i) => i.header)).toEqual([copy.price.title, copy.tags.title]);
  });

  it('clears all filters', () => {
    const onClearAll = vi.fn();
    render(<FilterPanel {...baseProps({ onClearAll })} />);
    const clearButton = Array.from(document.querySelectorAll('md-text-button')).find((b) => b.textContent === copy.clearAll) as HTMLElement;
    fireEvent.click(clearButton);
    expect(onClearAll).toHaveBeenCalled();
  });
});
