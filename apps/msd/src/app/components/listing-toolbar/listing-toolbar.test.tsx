import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ListingToolbar } from './listing-toolbar';

describe('ListingToolbar', () => {
  it('renders a labelled group with start content before end content', () => {
    render(<ListingToolbar ariaLabel="Listing tools" start={<button type="button">Filters</button>} end={<button type="button">Sort</button>} />);
    const group = screen.getByRole('group', { name: 'Listing tools' });
    const [first, second] = Array.from(group.querySelectorAll('button'));
    expect(first.textContent).toBe('Filters');
    expect(second.textContent).toBe('Sort');
  });

  it('omits an empty start slot', () => {
    render(<ListingToolbar ariaLabel="Listing tools" end={<button type="button">Sort</button>} />);
    expect(document.querySelector('.listing-toolbar__start')).toBeNull();
  });
});
