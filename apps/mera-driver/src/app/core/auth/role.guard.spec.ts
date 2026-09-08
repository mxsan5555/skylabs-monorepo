import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, ActivatedRouteSnapshot } from '@angular/router';
import { roleGuard } from './role.guard';
import { AuthService } from './auth.service';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('roleGuard', () => {
  let authServiceMock: any;
  let routerMock: any;

  beforeEach(() => {
    authServiceMock = {
      hasRole: vi.fn(),
    };

    routerMock = {
      createUrlTree: vi.fn().mockImplementation((path: any[]) => {
        return { path } as any as UrlTree;
      }),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: Router, useValue: routerMock },
      ],
    });
  });

  it('should allow navigation if the user has the allowed role', () => {
    authServiceMock.hasRole.mockReturnValue(true);
    const mockRouteSnapshot = {
      data: { roles: ['admin'] }
    } as any as ActivatedRouteSnapshot;

    const result = TestBed.runInInjectionContext(() => roleGuard(mockRouteSnapshot, {} as any));

    expect(authServiceMock.hasRole).toHaveBeenCalledWith(['admin']);
    expect(result).toBe(true);
  });

  it('should redirect to /account/profile if the user does not have the allowed role', () => {
    authServiceMock.hasRole.mockReturnValue(false);
    const mockRouteSnapshot = {
      data: { roles: ['admin'] }
    } as any as ActivatedRouteSnapshot;

    const result = TestBed.runInInjectionContext(() => roleGuard(mockRouteSnapshot, {} as any));

    expect(authServiceMock.hasRole).toHaveBeenCalledWith(['admin']);
    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/account/profile']);
    expect(result).toEqual({ path: ['/account/profile'] } as any);
  });

  it('should default to empty roles list if data.roles is undefined', () => {
    authServiceMock.hasRole.mockReturnValue(true);
    const mockRouteSnapshot = {
      data: {}
    } as any as ActivatedRouteSnapshot;

    const result = TestBed.runInInjectionContext(() => roleGuard(mockRouteSnapshot, {} as any));

    expect(authServiceMock.hasRole).toHaveBeenCalledWith([]);
    expect(result).toBe(true);
  });
});
