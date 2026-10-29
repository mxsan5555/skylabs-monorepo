import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { StatTile } from './stat-tile';

/** The dashboard card (item 7): icon, value, label, optional detail; the whole card is the link. */
describe('StatTile', () => {
  it('is one link named by its value, label and detail when it has a destination', () => {
    render(
      <MemoryRouter>
        <StatTile icon="local_offer" value="12" label="Deals" detail="9 live" to="/account/deals" />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: '12 Deals 9 live' });
    expect(link.getAttribute('href')).toBe('/account/deals');
    expect(link.className).toBe('dashboard-stat');
  });

  it('is plain text without a destination, and hides its icons from screen readers', () => {
    render(
      <MemoryRouter>
        <StatTile icon="verified_user" value="Active" label="Status" />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Active')).toBeTruthy();
    for (const icon of document.querySelectorAll('md-icon')) expect(icon.getAttribute('aria-hidden')).toBe('true');
  });
});
