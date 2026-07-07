import { describe, it, expect, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { AuthProvider, useAuth } from './auth-context';
import { AUTH_TOKEN_KEY } from './auth-storage';


let auth: ReturnType<typeof useAuth>;

function TestComponent() {
    auth = useAuth();
    return null;
}
function TestComponentWithoutProvider() {
    useAuth();
    return null;
}
beforeEach(() => {
    localStorage.clear();
});

describe('AuthProvider', () => {
    it('should provide default auth state', () => {
        render(
            <AuthProvider>
                <TestComponent />
            </AuthProvider>
        );

        expect(auth.token).toBeNull();
        expect(auth.isAuthenticated).toBe(false);
        expect(auth.roles).toEqual(['user']);
    });
    it('should sign in user', () => {
        render(
            <AuthProvider>
                <TestComponent />
            </AuthProvider>
        );

        act(() => {
            auth.signIn('abc123');
        });

        expect(auth.token).toBe('abc123');
        expect(auth.isAuthenticated).toBe(true);
        expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe('abc123');
    });
    it('should sign out user', () => {
        render(
            <AuthProvider>
                <TestComponent />
            </AuthProvider>
        );

        act(() => {
            auth.signIn('abc123');
        });
        act(() => {
            auth.signOut();
        });
        expect(auth.token).toBeNull();
        expect(auth.isAuthenticated).toBe(false);
        expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    });
    it('should update user roles', () => {
        render(
            <AuthProvider>
                <TestComponent />
            </AuthProvider>
        );

        act(() => {
            auth.setRoles(['admin']);
        });

        expect(auth.roles).toEqual(['admin']);
        expect(localStorage.getItem('msd_auth_roles')).toBe(
            JSON.stringify(['admin'])
        );
    });
    it('should return true when user has the required role', () => {
        render(
            <AuthProvider>
                <TestComponent />
            </AuthProvider>
        );

        act(() => {
            auth.setRoles(['admin']);
        });

        expect(auth.hasRole(['admin'])).toBe(true);
    });
    it('should return false when user does not have the required role', () => {
        render(
            <AuthProvider>
                <TestComponent />
            </AuthProvider>
        );

        act(() => {
            auth.setRoles(['user']);
        });

        expect(auth.hasRole(['admin'])).toBe(false);
    });
    it('should throw an error when useAuth is used outside AuthProvider', () => {
        expect(() =>
            render(<TestComponentWithoutProvider />)
        ).toThrow('useAuth must be used within <AuthProvider>');
    });
});

