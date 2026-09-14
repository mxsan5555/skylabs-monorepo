import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { Header } from './header';
import { AuthService } from '../../core/auth/auth.service';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Header Component', () => {
  let component: Header;
  let routerMock: any;
  let authMock: any;
  let httpMock: any;

  beforeEach(() => {
    routerMock = {
      navigate: vi.fn(),
    };

    authMock = {
      isAuthenticated: vi.fn(),
      signOut: vi.fn(),
    };

    httpMock = {
      get: vi.fn().mockReturnValue(of({
        header: {
          brand: 'test-brand',
          driversOnlineCount: 99,
          driversOnlineLabel: 'Online Drivers',
          helplineLabel: 'Emergency',
          helplineNumber: '+91 99999 99999',
          navLinks: [
            { label: 'Test Home', route: '/test-home', icon: 'test-icon' }
          ]
        }
      })),
    };

    TestBed.configureTestingModule({
      providers: [
        Header,
        { provide: Router, useValue: routerMock },
        { provide: AuthService, useValue: authMock },
        { provide: HttpClient, useValue: httpMock },
      ],
    });

    component = TestBed.inject(Header);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should initialize component and fetch header layout data from json', () => {
    component.ngOnInit();
    expect(httpMock.get).toHaveBeenCalledWith('/data/layout.json');
    expect(component['brandName']()).toBe('test-brand');
    expect(component['driversOnlineCount']()).toBe(99);
    expect(component['driversOnlineLabel']()).toBe('Online Drivers');
    expect(component['helplineLabel']()).toBe('Emergency');
    expect(component['helplineNumber']()).toBe('+91 99999 99999');
    expect(component['navLinks']().length).toBe(1);
    expect(component['navLinks']()[0].label).toBe('Test Home');
    expect(component['isLoading']()).toBe(false);
  });

  it('should fallback to defaults if get call fails', () => {
    httpMock.get.mockReturnValue(throwError(() => new Error('Not Found')));
    component.ngOnInit();

    expect(component['brandName']()).toBe('mera-driver');
    expect(component['driversOnlineCount']()).toBe(124);
    expect(component['isLoading']()).toBe(false);
  });

  it('should close mobile menu and navigate on onNavigate call', () => {
    component['mobileMenuOpen'].set(true);
    component['onNavigate']('/pricing');

    expect(component['mobileMenuOpen']()).toBe(false);
    expect(routerMock.navigate).toHaveBeenCalledWith(['/pricing']);
  });

  it('should navigate to sign-in on goSignIn', () => {
    component['goSignIn']();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/sign-in']);
  });

  it('should navigate to account on goAccount', () => {
    component['goAccount']();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/account']);
  });

  it('should navigate to dashboard on goDashboard', () => {
    component['goDashboard']();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/account/dashboard']);
  });

  it('should trigger tel redirection on callHelpline', () => {
    const locationMock = { href: '' };
    vi.stubGlobal('location', locationMock);
    component['helplineNumber'].set('+91 98765 43210');

    component['callHelpline']();

    expect(window.location.href).toBe('tel:+91 98765 43210');
  });
});
