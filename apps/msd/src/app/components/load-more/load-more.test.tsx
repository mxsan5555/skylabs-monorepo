import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { LoadMore } from './load-more';

const copy = { button: 'Show more', loading: 'Loading more', retry: 'Try again' };
const button = (text: string) =>
  Array.from(document.querySelectorAll('md-outlined-button')).find((b) => b.textContent === text) as HTMLElement | undefined;

describe('LoadMore', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the status and a Show more button while more remain', () => {
    const onLoadMore = vi.fn();
    render(<LoadMore hasMore loading={false} error="" status="Showing 12 of 24" onLoadMore={onLoadMore} copy={copy} />);
    expect(screen.getByText('Showing 12 of 24').getAttribute('aria-live')).toBe('polite');
    fireEvent.click(button('Show more') as HTMLElement);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('hides the button when everything is loaded', () => {
    render(<LoadMore hasMore={false} loading={false} error="" status="Showing 3 of 3" onLoadMore={vi.fn()} copy={copy} />);
    expect(button('Show more')).toBeUndefined();
  });

  it('shows the error with a retry button', () => {
    const onLoadMore = vi.fn();
    render(<LoadMore hasMore loading={false} error="Could not load." status="" onLoadMore={onLoadMore} copy={copy} />);
    expect(screen.getByRole('alert').textContent).toBe('Could not load.');
    fireEvent.click(button('Try again') as HTMLElement);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('loads more when the sentinel scrolls into view', () => {
    let fire!: (entries: { isIntersecting: boolean }[]) => void;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: typeof fire) {
          fire = cb;
        }
        observe() {
          /* no-op: test double */
        }
        disconnect() {
          /* no-op: test double */
        }
      },
    );
    const onLoadMore = vi.fn();
    render(<LoadMore hasMore loading={false} error="" status="" onLoadMore={onLoadMore} copy={copy} />);
    fire([{ isIntersecting: true }]);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});
