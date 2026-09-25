import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as RouterDom from 'react-router-dom';
import { Otp } from './otp';

// Material-web custom text fields don't render their shadow-DOM internals under this app's
// jsdom test setup (no `installMaterialJsdomPolyfills`, unlike shared-ui's own suite — see
// settings.test.tsx's identical note), so typing a real OTP code can't be simulated here. These
// tests cover the parts of the returnUrl fix that don't require it (button clicks, mount-time
// redirects); the URL-resolution logic itself is covered exhaustively by role-routing.test.ts,
// and the post-verify `navigate(returnUrl ?? resolvePostLoginPath(bootstrap))` line was verified
// by direct code review plus a live browser check (see PR notes).

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof RouterDom>();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('../../../api/rbac/auth', () => ({
  requestOtp: vi.fn().mockResolvedValue(undefined),
  verifyOtp: vi.fn(),
}));

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ signIn: vi.fn(), bootstrap: undefined, token: null }),
}));

function renderOtp(state: Record<string, unknown> | undefined) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/otp', state }]}>
      <Otp />
    </MemoryRouter>,
  );
}

describe('Otp — returnUrl preserved when bouncing back to /sign-in', () => {
  beforeEach(() => navigateMock.mockClear());

  it('redirects to /sign-in with no ?next= when arriving with no identifier and no returnUrl', () => {
    renderOtp(undefined);
    expect(navigateMock).toHaveBeenCalledWith('/sign-in', { replace: true });
  });

  it('redirects to /sign-in?next=<returnUrl> when arriving with no identifier but a returnUrl', () => {
    renderOtp({ returnUrl: '/vendor/urban-wellness-spa' });
    expect(navigateMock).toHaveBeenCalledWith(
      '/sign-in?next=%2Fvendor%2Furban-wellness-spa',
      { replace: true },
    );
  });

  it('the back button preserves the returnUrl in the query string', () => {
    const { container } = renderOtp({
      identifier: '9999999999',
      method: 'phone',
      returnUrl: '/explore?q=spa',
    });
    const backButton = container.querySelector('.otp-back') as HTMLElement;
    fireEvent.click(backButton);
    expect(navigateMock).toHaveBeenCalledWith('/sign-in?next=%2Fexplore%3Fq%3Dspa');
  });

  it('the back button goes to plain /sign-in when there is no returnUrl', () => {
    const { container } = renderOtp({ identifier: '9999999999', method: 'phone' });
    const backButton = container.querySelector('.otp-back') as HTMLElement;
    fireEvent.click(backButton);
    expect(navigateMock).toHaveBeenCalledWith('/sign-in');
  });
});
