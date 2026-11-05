import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { MemberStatusBanner } from './admin-layout';

describe('MemberStatusBanner', () => {
  it('tells an inactive member the account is view only', () => {
    render(
      <MemoryRouter>
        <MemberStatusBanner status="INACTIVE" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status').textContent).toMatch(/inactive and view only/i);
  });

  it('does not rely on colour alone: a decorative icon sits next to the words', () => {
    render(
      <MemoryRouter>
        <MemberStatusBanner status="INACTIVE" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status').querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('renders nothing for an active member or a non member', () => {
    const { container, rerender } = render(
      <MemoryRouter>
        <MemberStatusBanner status="ACTIVE" />
      </MemoryRouter>,
    );
    expect(container.textContent).toBe('');
    rerender(
      <MemoryRouter>
        <MemberStatusBanner status={undefined} />
      </MemoryRouter>,
    );
    expect(container.textContent).toBe('');
  });
});
