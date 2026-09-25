import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PageSection } from './page-section';

describe('PageSection', () => {
  it('renders a labelled section with the surface tone and a container', () => {
    render(
      <PageSection aria-labelledby="h">
        <h2 id="h">Deals</h2>
      </PageSection>,
    );
    const section = screen.getByRole('region', { name: 'Deals' });
    expect(section.tagName).toBe('SECTION');
    expect(section.className).toBe('page-section page-section--surface');
    expect(section.firstElementChild?.className).toBe('page-section__container');
  });

  it('applies tint, flush, stack and an extra class', () => {
    render(
      <PageSection tone="tint" flush stack className="home-hero" aria-label="Results">
        <p>one</p>
      </PageSection>,
    );
    const section = screen.getByRole('region', { name: 'Results' });
    expect(section.className).toBe('page-section page-section--tint page-section--flush home-hero');
    expect(section.firstElementChild?.className).toBe('page-section__container page-section__container--stack');
  });
});
