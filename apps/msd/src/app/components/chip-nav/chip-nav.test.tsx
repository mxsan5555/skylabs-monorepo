import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

  it('renders link chips as a labelled nav of real links, the current one marked (ST-41)', () => {
    const links = [
      { value: '', label: 'All deals', href: '/deals' },
      { value: 'massage', label: 'Massage', href: '/category/massage' },
    ];
    render(
      <MemoryRouter>
        <ChipNav items={links} value="" onSelect={vi.fn()} ariaLabel="Deal categories" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('navigation', { name: 'Deal categories' })).toBeTruthy();
    const massage = screen.getByRole('link', { name: 'Massage' });
    expect(massage.getAttribute('href')).toBe('/category/massage');
    expect(screen.getByRole('link', { name: 'All deals' }).getAttribute('aria-current')).toBe('page');
    expect(massage.hasAttribute('aria-current')).toBe(false);
    expect(chips()).toHaveLength(0);
  });

  it('shows the end content (result count) on the chip row (ST-41)', () => {
    render(<ChipNav items={items} value="" onSelect={vi.fn()} ariaLabel="Sub-categories" end={<span>12 deals</span>} />);
    const row = document.querySelector('.chip-nav-row') as HTMLElement;
    expect(row.querySelector('md-chip-set')).toBeTruthy();
    expect(row.querySelector('.chip-nav-row__end')?.textContent).toBe('12 deals');
  });
});
