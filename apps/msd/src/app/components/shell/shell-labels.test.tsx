import { renderHook } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { useAccountLinks } from './shell-labels';

/** ST-06: the header and tab bar Account link per role (`useAccountLinks`). */
const auth = vi.hoisted(() => ({ isAuthenticated: false, bootstrap: null as { roles: { key: string }[] } | null }));
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => auth }));

const signedInAs = (...roles: string[]) => {
  auth.isAuthenticated = true;
  auth.bootstrap = { roles: roles.map((key) => ({ key })) };
};

beforeEach(() => {
  auth.isAuthenticated = false;
  auth.bootstrap = null;
});

describe('useAccountLinks', () => {
  it('sends a signed-out visitor to sign in', () => {
    expect(renderHook(() => useAccountLinks()).result.current).toEqual({ isAuthenticated: false, isCustomer: false, accountPath: '/sign-in' });
  });

  it('sends a customer, including a customer who is also a member, to the customer dashboard', () => {
    signedInAs('customer');
    expect(renderHook(() => useAccountLinks()).result.current).toMatchObject({ isCustomer: true, accountPath: '/my-dashboard' });
    signedInAs('customer', 'member');
    expect(renderHook(() => useAccountLinks()).result.current.accountPath).toBe('/my-dashboard');
  });

  it.each([['member'], ['support'], ['admin', 'customer'], ['super_admin']])('sends %j to the console', (...roles) => {
    signedInAs(...roles);
    expect(renderHook(() => useAccountLinks()).result.current).toMatchObject({ isCustomer: false, accountPath: '/account/dashboard' });
  });

  it('waits for the bootstrap before treating a signed-in user as a customer', () => {
    auth.isAuthenticated = true;
    expect(renderHook(() => useAccountLinks()).result.current).toMatchObject({ isAuthenticated: true, isCustomer: false, accountPath: '/account/dashboard' });
  });
});
