import { fireEvent, render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChipNav } from './chip-nav';

type Chip = HTMLElement & { label?: string; selected?: boolean };
const chips = () => Array.from(document.querySelectorAll('md-filter-chip')) as Chip[];
const labelOf = (c: Chip) => c.label ?? c.getAttribute('label');
const isSelected = (c: Chip) => c.selected ?? c.hasAttribute('selected');

const items = [
  { value: '', label: 'All' },
  { value: 'swedish', label: 'Swedish' },
];

describe('ChipNav', () => {
  it('renders one filter chip per item inside a labelled chip set', () => {
    render(<ChipNav items={items} value="" onSelect={vi.fn()} ariaLabel="Sub-categories" />);
    expect(document.querySelector('md-chip-set')?.getAttribute('aria-label')).toBe('Sub-categories');
    expect(chips().map(labelOf)).toEqual(['All', 'Swedish']);
  });

  it('marks the active item selected and reports clicks', () => {
    const onSelect = vi.fn();
    render(<ChipNav items={items} value="swedish" onSelect={onSelect} ariaLabel="Sub-categories" />);
    expect(isSelected(chips()[1])).toBe(true);
    expect(isSelected(chips()[0])).toBe(false);
    fireEvent.click(chips()[0]);
    expect(onSelect).toHaveBeenCalledWith('');
  });
});
