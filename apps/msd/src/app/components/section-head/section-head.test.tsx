import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { SectionHead } from './section-head';

const renderHead = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('SectionHead', () => {
  it('renders an h2 with the given id and class', () => {
    renderHead(<SectionHead id="faq-heading" heading="Questions" />);
    const h2 = screen.getByRole('heading', { level: 2, name: 'Questions' });
    expect(h2.id).toBe('faq-heading');
    expect(h2.className).toContain('headline-small');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders the optional subheading', () => {
    renderHead(<SectionHead id="h" heading="How it works" subheading="Three steps." />);
    expect(screen.getByText('Three steps.').tagName).toBe('P');
  });

  it('renders a See all link named with its heading', () => {
    renderHead(<SectionHead id="h" heading="Shop by category" seeAll="See all" seeAllTo="/explore" />);
    const link = screen.getByRole('link', { name: 'See all: Shop by category' });
    expect(link.getAttribute('href')).toBe('/explore');
    expect(link.textContent).toContain('See all');
  });

  it('renders trailing actions after the link', () => {
    renderHead(
      <SectionHead id="h" heading="Deals" seeAll="See all" seeAllTo="/explore" actions={<button type="button">Next</button>} />,
    );
    const link = screen.getByRole('link');
    const button = screen.getByRole('button', { name: 'Next' });
    expect(link.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
