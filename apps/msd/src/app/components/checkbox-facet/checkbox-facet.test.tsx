import { fireEvent, render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CheckboxFacet } from './checkbox-facet';

const options = [
  { value: 'v1', label: 'Glow Beauty Studio', count: 3 },
  { value: 'v2', label: 'Zen Spa', count: 2 },
  { value: 'v3', label: 'Serenity', count: 1 },
  { value: 'v4', label: 'Aura Wellness', count: 4 },
  { value: 'v5', label: 'Bliss Point', count: 0 },
  { value: 'v6', label: 'Calm Retreat', count: 1 },
  { value: 'v7', label: 'Divine Touch', count: 2 },
];

const copy = { searchLabel: 'Search businesses', showMore: 'Show more', showLess: 'Show less' };

const rowText = (el: Element) => Array.from(el.querySelectorAll('span')).map((s) => s.textContent).join(' ');
const rows = () => Array.from(document.querySelectorAll('.checkbox-facet__row'));

describe('CheckboxFacet', () => {
  it('shows the row text with its count', () => {
    render(<CheckboxFacet options={options} selected={[]} onChange={vi.fn()} {...copy} limit={5} />);
    expect(rowText(rows()[0])).toBe('Glow Beauty Studio 3');
  });

  it('limits rows and expands with Show more / Show less', () => {
    render(<CheckboxFacet options={options} selected={[]} onChange={vi.fn()} {...copy} limit={5} />);
    expect(rows()).toHaveLength(5);
    const showMore = document.querySelector('md-text-button') as HTMLElement;
    expect(showMore.textContent).toBe('Show more');
    fireEvent.click(showMore);
    expect(rows()).toHaveLength(7);
    const showLess = document.querySelector('md-text-button') as HTMLElement;
    expect(showLess.textContent).toBe('Show less');
  });

  it('does not render a search field or Show more when options fit within the limit', () => {
    render(<CheckboxFacet options={options.slice(0, 3)} selected={[]} onChange={vi.fn()} {...copy} limit={5} />);
    expect(rows()).toHaveLength(3);
    expect(document.querySelector('md-outlined-text-field')).toBeNull();
    expect(document.querySelector('md-text-button')).toBeNull();
  });

  it('disables a zero-count unselected option', () => {
    render(<CheckboxFacet options={options} selected={[]} onChange={vi.fn()} {...copy} limit={5} />);
    fireEvent.click(document.querySelector('md-text-button') as HTMLElement);
    const checkboxes = Array.from(document.querySelectorAll('md-checkbox')) as (HTMLElement & { disabled: boolean })[];
    const blissIndex = options.findIndex((o) => o.value === 'v5');
    expect(checkboxes[blissIndex].disabled).toBe(true);
  });

  it('adds a value when checked and removes it when unchecked', () => {
    const onChange = vi.fn();
    render(<CheckboxFacet options={options} selected={['v2']} onChange={onChange} {...copy} limit={5} />);
    const checkboxes = Array.from(document.querySelectorAll('md-checkbox')) as (HTMLElement & { checked: boolean; value: string })[];

    const v1 = checkboxes[0];
    v1.checked = true;
    fireEvent.change(v1);
    expect(onChange).toHaveBeenCalledWith(['v2', 'v1']);

    onChange.mockClear();
    const v2 = checkboxes[1];
    v2.checked = false;
    fireEvent.change(v2);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('filters rows by label, case-insensitively', () => {
    render(<CheckboxFacet options={options} selected={[]} onChange={vi.fn()} {...copy} limit={5} />);
    const search = document.querySelector('md-outlined-text-field') as HTMLElement & { value: string };
    search.value = 'zen';
    fireEvent.input(search);
    const visible = rows().map(rowText);
    expect(visible).toEqual(['Zen Spa 2']);
  });
});
