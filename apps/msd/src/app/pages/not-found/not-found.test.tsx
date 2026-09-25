import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import content from '../../../content.json';
import { NotFound } from './not-found';

describe('NotFound', () => {
  it('renders the 404 copy with noindexed Seo', async () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: content.notFound.title })).toBeTruthy();
    await waitFor(() => expect(document.title).toBe(content.notFound.metaTitle));
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      content.notFound.message,
    );
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
  });
});
