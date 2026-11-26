import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { VendorStatusBanner } from './admin-layout';

describe('VendorStatusBanner', () => {
  it('tells an inactive vendor the account is view only', () => {
    render(
      <MemoryRouter>
        <VendorStatusBanner status="INACTIVE" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status').textContent).toMatch(/inactive and view only/i);
  });

  it('does not rely on colour alone: a decorative icon sits next to the words', () => {
    render(
      <MemoryRouter>
        <VendorStatusBanner status="INACTIVE" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status').querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('renders nothing for an active vendor or a non vendor', () => {
    const { container, rerender } = render(
      <MemoryRouter>
        <VendorStatusBanner status="ACTIVE" />
      </MemoryRouter>,
    );
    expect(container.textContent).toBe('');
    rerender(
      <MemoryRouter>
        <VendorStatusBanner status={undefined} />
      </MemoryRouter>,
    );
    expect(container.textContent).toBe('');
  });
});
