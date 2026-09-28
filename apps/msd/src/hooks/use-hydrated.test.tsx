import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { useHydrated } from './use-hydrated';

function Probe() {
  return <span data-testid="probe">{useHydrated() ? 'yes' : 'no'}</span>;
}

describe('useHydrated', () => {
  it('is false during server rendering', () => {
    expect(renderToString(<Probe />)).toContain('no');
  });

  it('is true once rendered on the client', () => {
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('yes');
  });
});
