import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireRole } from './require-role';
import { useAuth } from './auth-context';
import { vi } from 'vitest';

vi.mock('./auth-context', () => ({
  useAuth: vi.fn(),
}));

function renderWithRouter(ui: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={ui} />
        <Route path="/account/profile" element={<div>Profile Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('RequireRole', () => {

  it('renders children when user has required role', () => {
    (useAuth as any).mockReturnValue({
      hasRole: () => true,
    });

    const { getByText } = renderWithRouter(
      <RequireRole roles={['admin']}>
        <div>Admin Panel</div>
      </RequireRole>
    );

    expect(getByText('Admin Panel')).toBeTruthy();
  });

  it('redirects to profile when user does not have required role', () => {
    (useAuth as any).mockReturnValue({
      hasRole: () => false,
    });

    const { getByText } = renderWithRouter(
      <RequireRole roles={['admin']}>
        <div>Admin Panel</div>
      </RequireRole>
    );

    expect(getByText('Profile Page')).toBeTruthy();
  });

  it('allows access when role matches one of allowed roles', () => {
    const hasRoleMock = vi.fn((roles: string[]) =>
      roles.includes('admin')
    );

    (useAuth as any).mockReturnValue({
      hasRole: hasRoleMock,
    });

    const { getByText } = renderWithRouter(
      <RequireRole roles={['admin', 'marketing']}>
        <div>Admin Panel</div>
      </RequireRole>
    );

    expect(getByText('Admin Panel')).toBeTruthy();
    expect(hasRoleMock).toHaveBeenCalledWith(['admin', 'marketing']);
  });

  it('denies access when roles array is empty', () => {
    (useAuth as any).mockReturnValue({
      hasRole: () => false,
    });

    const { getByText } = renderWithRouter(
      <RequireRole roles={[]}>
        <div>Secret Panel</div>
      </RequireRole>
    );

    expect(getByText('Profile Page')).toBeTruthy();
  });

  it('calls hasRole with correct roles', () => {
    const hasRoleMock = vi.fn().mockReturnValue(true);

    (useAuth as any).mockReturnValue({
      hasRole: hasRoleMock,
    });

    renderWithRouter(
      <RequireRole roles={['admin', 'sales']}>
        <div>Dashboard</div>
      </RequireRole>
    );

    expect(hasRoleMock).toHaveBeenCalledWith(['admin', 'sales']);
  });
});