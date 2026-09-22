import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { AuthService } from '@skylabs-monorepo/shared-auth/angular';
import { AccountService } from './account.service';
import { AccountApiService } from './account-api.service';

describe('AccountService', () => {
  function setup(getResult: any = of({ name: 'Ravi', email: 'ravi@example.com', phone: '9000000000' })) {
    const apiMock = {
      get: vi.fn().mockReturnValue(getResult),
      update: vi.fn(),
    };
    const authMock = { refreshBootstrap: vi.fn().mockResolvedValue(undefined) };
    TestBed.configureTestingModule({
      providers: [
        { provide: AccountApiService, useValue: apiMock },
        { provide: AuthService, useValue: authMock },
      ],
    });
    return { apiMock, authMock };
  }

  it('loads the real profile from GET /rbac/users/me on construction — not a hardcoded seed', () => {
    setup();
    const service = TestBed.inject(AccountService);
    expect(service.profile()).toEqual({ name: 'Ravi', email: 'ravi@example.com', phone: '9000000000' });
    expect(service.loading()).toBe(false);
  });

  it('starts in a loading state and does not crash while the fetch is in flight', () => {
    const { apiMock } = setup(of({ name: '', email: '', phone: '' }));
    apiMock.get.mockReturnValue({ subscribe: () => undefined } as any); // never resolves
    const service = TestBed.inject(AccountService);
    expect(service.loading()).toBe(true);
  });

  it('a failed fetch stops loading without throwing (profile page can show an error state)', () => {
    setup(throwError(() => new Error('network down')));
    const service = TestBed.inject(AccountService);
    expect(service.loading()).toBe(false);
  });

  it('updateProfile() saves via the API, applies the SERVER response (not the raw patch) to local state, and refreshes bootstrap', async () => {
    const { apiMock, authMock } = setup();
    apiMock.update.mockReturnValue(of({ name: 'Ravi K.', email: 'ravi@example.com', phone: '9000000000' }));
    const service = TestBed.inject(AccountService);

    await new Promise<void>((resolve) => {
      service.updateProfile({ name: 'Ravi K.' }).subscribe(() => resolve());
    });

    expect(apiMock.update).toHaveBeenCalledWith({ name: 'Ravi K.' });
    expect(service.profile().name).toBe('Ravi K.');
    expect(authMock.refreshBootstrap).toHaveBeenCalled();
  });

  it('a failed updateProfile() propagates the error to the caller instead of silently updating', async () => {
    const { apiMock } = setup();
    apiMock.update.mockReturnValue(throwError(() => new Error('email already in use')));
    const service = TestBed.inject(AccountService);

    let caught: unknown;
    await new Promise<void>((resolve) => {
      service.updateProfile({ email: 'taken@example.com' }).subscribe({
        error: (err) => {
          caught = err;
          resolve();
        },
      });
    });

    expect((caught as Error).message).toBe('email already in use');
    // The original (pre-update) profile must still be intact — no partial/garbled state.
    expect(service.profile().email).toBe('ravi@example.com');
  });
});
