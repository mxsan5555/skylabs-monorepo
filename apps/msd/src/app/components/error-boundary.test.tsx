import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ErrorBoundary } from './error-boundary';

/**
 * Feature: ErrorBoundary — last-resort render-phase crash guard
 * Scenario: a component beneath the boundary throws while rendering
 *
 * Given: `<ErrorBoundary>` wraps a subtree (mirrors `app.tsx` wrapping `<AppRoutes />`)
 * When: a child component throws during render
 * Then: the boundary renders its "Something went wrong" fallback instead of the app going blank,
 *       and offers a reload action
 *
 * Edge cases:
 * - a subtree that does NOT throw renders completely unaffected (pure passthrough — the boundary
 *   must never alter normal render output, since it wraps every route in the app)
 * - the thrown error is still surfaced to the console (last line of defense must not swallow
 *   silently, per the component's own doc comment)
 */
function Bomb(): never {
  throw new Error('boom from child');
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children unaffected when nothing throws (happy path)', () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('renders the fallback UI instead of blanking the app when a child throws', () => {
    // React logs the caught error to console.error by default during the render pass that
    // triggers getDerivedStateFromError; silence it so the test output stays clean while still
    // asserting our own componentDidCatch console.error call below.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    // `sky-info-card` is a LIT web component; jsdom doesn't upgrade/render its shadow DOM in this
    // test environment, so its `heading`/`subheading` text lives in attributes, not text nodes —
    // assert via attribute the same way other tests in this app check `sky-*-card` content.
    const alertRegion = screen.getByRole('alert');
    expect(alertRegion).toBeInTheDocument();
    const infoCard = alertRegion.querySelector('sky-info-card');
    expect(infoCard).not.toBeNull();
    expect(infoCard).toHaveAttribute('heading', 'Something went wrong');
    // `<md-filled-button>`'s Material-internals-assigned role isn't understood by jsdom's
    // accessibility tree, so `getByRole('button', ...)` can't find it (same documented gap as
    // `categories.test.tsx`'s `saveButtonIn` / `vendor-wizard-modules.test.tsx`'s
    // `findSaveButton`) — query the custom element by text content instead.
    const reloadButton = Array.from(alertRegion.querySelectorAll('md-filled-button')).find(
      (node) => (node.textContent ?? '').trim() === 'Reload page',
    );
    expect(reloadButton).toBeTruthy();
    // The thrown child ("All good") must not still be present — the whole subtree was replaced.
    expect(screen.queryByText('All good')).not.toBeInTheDocument();
  });

  it('logs the caught error to the console rather than swallowing it silently', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      'Unhandled error caught by ErrorBoundary:',
      expect.any(Error),
      expect.anything(),
    );
  });
});
