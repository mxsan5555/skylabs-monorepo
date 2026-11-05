import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@skylabs-monorepo/shared-ui';
import { SnackbarHost, showSnackbar } from './snackbar';

function host(): HTMLElement & {
  variant: string;
  closable: boolean;
  actionLabel?: string;
  duration: number;
  open: boolean;
} {
  const el = document.querySelector('sky-snackbar');
  if (!el) throw new Error('sky-snackbar not found');
  return el as never;
}

describe('showSnackbar', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders exactly one sky-snackbar', () => {
    render(<SnackbarHost />);
    expect(document.querySelectorAll('sky-snackbar')).toHaveLength(1);
  });

  it('shows the message with the success variant and no close icon', async () => {
    render(<SnackbarHost />);
    showSnackbar('Saved.', { variant: 'success' });
    expect(await screen.findByText('Saved.')).toBeTruthy();
    expect(host().variant).toBe('success');
    expect(host().closable).toBe(false);
    expect(host().open).toBe(true);
  });

  it('makes errors closable and resets the previous action button on the next call', async () => {
    render(<SnackbarHost />);
    showSnackbar('Added.', { variant: 'info', actionLabel: 'View Cart', onAction: vi.fn() });
    expect(host().actionLabel).toBe('View Cart');

    showSnackbar('Could not save.', { variant: 'error' });
    expect(await screen.findByText('Could not save.')).toBeTruthy();
    expect(host().variant).toBe('error');
    expect(host().closable).toBe(true);
    expect(host().actionLabel).toBeUndefined();
  });

  it('runs onAction once when the action button fires sky-action', () => {
    const onAction = vi.fn();
    render(<SnackbarHost />);
    showSnackbar('Added.', { variant: 'info', actionLabel: 'View Cart', onAction });

    host().dispatchEvent(new CustomEvent('sky-action'));
    host().dispatchEvent(new CustomEvent('sky-action'));

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('does nothing and does not throw when no host is mounted', () => {
    expect(() => showSnackbar('Nobody home.')).not.toThrow();
  });
});
