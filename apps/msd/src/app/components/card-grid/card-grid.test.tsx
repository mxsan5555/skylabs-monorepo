import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CardGrid } from './card-grid';

describe('CardGrid', () => {
  it('wraps each child in a list item', () => {
    render(
      <CardGrid>
        <article key="a">A</article>
        <article key="b">B</article>
      </CardGrid>,
    );
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe('A');
  });

  it('shows the fallback instead of the list', () => {
    render(
      <CardGrid fallback={<p>Loading</p>}>
        <article key="a">A</article>
      </CardGrid>,
    );
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByText('Loading')).toBeTruthy();
  });

  it('has no --list modifier by default', () => {
    render(
      <CardGrid>
        <article key="a">A</article>
      </CardGrid>,
    );
    expect(screen.getByRole('list').className).toBe('card-grid__list');
  });

  it('adds the --list modifier for layout="list"', () => {
    render(
      <CardGrid layout="list">
        <article key="a">A</article>
      </CardGrid>,
    );
    expect(screen.getByRole('list').className).toBe('card-grid__list card-grid__list--list');
  });

  it('renders above content first and wraps the grid in a tabpanel', () => {
    render(
      <CardGrid above={<div role="tablist" />} panel={{ id: 'p', labelledBy: 'tab-all' }}>
        <article key="a">A</article>
      </CardGrid>,
    );
    const panel = screen.getByRole('tabpanel');
    expect(panel.id).toBe('p');
    expect(panel.getAttribute('aria-labelledby')).toBe('tab-all');
    expect(within(panel).getByRole('list')).toBeTruthy();
    const tablist = screen.getByRole('tablist');
    expect(tablist.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
