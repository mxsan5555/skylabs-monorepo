import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { Otp } from './otp';
import { ApiClient } from '../../core/api/api-client.service';
import { AuthService } from '../../core/auth/auth.service';
import { AccountService } from '../../core/account/account.service';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Otp Component', () => {
  let routerMock: any;
  let apiMock: any;
  let authMock: any;
  let accountMock: any;
  let httpMock: any;

  beforeEach(() => {
    routerMock = {
      navigate: vi.fn(),
    };

    apiMock = {
      post: vi.fn(),
      getBaseUrl: vi.fn().mockReturnValue('/api'),
    };

    authMock = {
      signIn: vi.fn(),
      setRoles: vi.fn(),
    };

    accountMock = {
      updateProfile: vi.fn(),
    };

    httpMock = {
      get: vi.fn().mockImplementation((url: string) => {
        if (url === 'data/auth.json') {
          return of({
            otp: {
              titlePhone: 'Custom Verify Title'
            }
          });
        }
        if (url === 'data/mock-users.json') {
          return of([
            {
              id: 'admin-1',
              mail: 'admin@mera-driver.com',
              mobile: '9999933333',
              role: 'admin',
              otp: '333333',
              name: 'Amit Sharma (Admin)'
            }
          ]);
        }
        return of({});
      })
    };

    TestBed.configureTestingModule({
      providers: [
        Otp,
        { provide: Router, useValue: routerMock },
        { provide: ApiClient, useValue: apiMock },
        { provide: AuthService, useValue: authMock },
        { provide: AccountService, useValue: accountMock },
        { provide: HttpClient, useValue: httpMock },
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('should initialize component and load auth copy and mock users', () => {
    vi.stubGlobal('history', {
      state: {
        destination: '9999933333',
        method: 'phone',
        role: 'admin'
      }
    });
    const component = TestBed.inject(Otp);

    vi.useFakeTimers();
    component.ngOnInit();
    expect(httpMock.get).toHaveBeenCalledWith('data/auth.json');
    expect(httpMock.get).toHaveBeenCalledWith('data/mock-users.json');
    expect(component['content']().titlePhone).toBe('Custom Verify Title');
    expect(component['mockUsers'].length).toBe(1);

    // Let the interval fire once
    vi.advanceTimersByTime(1000);
    expect(component['seconds']()).toBe(23);

    // Destroy to clear interval
    component.ngOnDestroy();
  });

  it('should alert if code is empty on verify', () => {
    vi.stubGlobal('history', {
      state: {
        destination: '9999933333',
        method: 'phone',
        role: 'admin'
      }
    });
    const component = TestBed.inject(Otp);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    component['code'] = '';
    component['verify']();
    expect(alertSpy).toHaveBeenCalledWith(component['content']().errorOtpEmpty);
    alertSpy.mockRestore();
  });

  it('should verify OTP and navigate on success', () => {
    vi.stubGlobal('history', {
      state: {
        destination: '9999933333',
        method: 'phone',
        role: 'admin'
      }
    });
    const component = TestBed.inject(Otp);
    component['code'] = '112233';
    apiMock.post.mockReturnValue(of({ token: 'success-jwt-token' }));

    component['verify']();

    expect(apiMock.post).toHaveBeenCalledWith('/mobile-otp/verify', { mobile: '9999933333', otp: '112233' });
    expect(authMock.signIn).toHaveBeenCalledWith('success-jwt-token');
    expect(authMock.setRoles).toHaveBeenCalledWith(['admin']);
    expect(accountMock.updateProfile).toHaveBeenCalled();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/account']);
  });

  it('should show alert message if successful API response does not contain a token', () => {
    vi.stubGlobal('history', {
      state: {
        destination: '9999933333',
        method: 'phone',
        role: 'admin'
      }
    });
    const component = TestBed.inject(Otp);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    component['code'] = '112233';
    apiMock.post.mockReturnValue(of({})); // no token

    component['verify']();

    expect(alertSpy).toHaveBeenCalledWith(component['content']().msgSuccessNoToken);
    alertSpy.mockRestore();
  });

  it('should verify admin using offline mock credentials if in local dev mode', () => {
    vi.stubGlobal('history', {
      state: {
        destination: '9999933333',
        method: 'phone',
        role: 'admin'
      }
    });
    const component = TestBed.inject(Otp);
    vi.stubGlobal('location', { hostname: 'localhost' });
    component.ngOnInit(); // load mockUsers
    component['code'] = '333333';
    apiMock.post.mockReturnValue(throwError(() => new Error('Connection Refused')));

    component['verify']();

    expect(authMock.signIn).toHaveBeenCalledWith('mock-demo-jwt-token');
    expect(authMock.setRoles).toHaveBeenCalledWith(['admin']);
    expect(accountMock.updateProfile).toHaveBeenCalledWith({
      name: 'Amit Sharma (Admin)',
      email: 'admin@mera-driver.com',
      phone: '9999933333'
    });
    expect(routerMock.navigate).toHaveBeenCalledWith(['/account']);
    component.ngOnDestroy();
  });

  it('should fail verification if incorrect OTP in local dev mock mode', () => {
    vi.stubGlobal('history', {
      state: {
        destination: '9999933333',
        method: 'phone',
        role: 'admin'
      }
    });
    const component = TestBed.inject(Otp);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.stubGlobal('location', { hostname: 'localhost' });
    component.ngOnInit(); // load mockUsers
    component['code'] = '000000'; // wrong otp
    apiMock.post.mockReturnValue(throwError(() => new Error('Connection Refused')));

    component['verify']();

    expect(alertSpy).toHaveBeenCalledWith(
      'Verification failed: Invalid OTP code for admin. Please use 333333.'
    );
    alertSpy.mockRestore();
    component.ngOnDestroy();
  });

  it('should verify with fallback OTP 123456 for unregistered user in local dev mock mode', () => {
    vi.stubGlobal('location', { hostname: 'localhost' });
    vi.stubGlobal('history', {
      state: {
        destination: '9888877777',
        method: 'phone',
        role: 'customer'
      }
    });
    const component = TestBed.inject(Otp);
    component.ngOnInit();
    component['code'] = '123456';
    apiMock.post.mockReturnValue(throwError(() => new Error('Connection Refused')));

    component['verify']();

    expect(authMock.signIn).toHaveBeenCalledWith('mock-demo-jwt-token');
    expect(authMock.setRoles).toHaveBeenCalledWith(['customer']);
    expect(accountMock.updateProfile).toHaveBeenCalledWith({
      name: 'Customer User',
      email: 'customer@mera-driver.com',
      phone: '9888877777'
    });
    expect(routerMock.navigate).toHaveBeenCalledWith(['/account']);
    component.ngOnDestroy();
  });

  it('should show alert error if incorrect fallback OTP in local dev mock mode', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.stubGlobal('location', { hostname: 'localhost' });
    vi.stubGlobal('history', {
      state: {
        destination: '9888877777',
        method: 'phone',
        role: 'customer'
      }
    });
    const component = TestBed.inject(Otp);
    component.ngOnInit();
    component['code'] = '999999'; // wrong fallback otp
    apiMock.post.mockReturnValue(throwError(() => new Error('Connection Refused')));

    component['verify']();

    expect(alertSpy).toHaveBeenCalledWith(
      'Verification failed: Invalid OTP code. For demo, use 123456 or a valid mock user OTP.'
    );
    alertSpy.mockRestore();
    component.ngOnDestroy();
  });

  it('should show raw server error on verification failure if not in local dev mode', () => {
    vi.stubGlobal('history', {
      state: {
        destination: '9999933333',
        method: 'phone',
        role: 'admin'
      }
    });
    const component = TestBed.inject(Otp);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.stubGlobal('location', { hostname: 'production.com' });
    component['code'] = '112233';
    apiMock.post.mockReturnValue(throwError(() => ({ message: 'Server Expired' })));

    component['verify']();

    expect(alertSpy).toHaveBeenCalledWith('Verification failed: Server Expired');
    alertSpy.mockRestore();
  });

  it('should resend OTP successfully', () => {
    vi.stubGlobal('history', {
      state: {
        destination: '9999933333',
        method: 'phone',
        role: 'admin'
      }
    });
    const component = TestBed.inject(Otp);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    apiMock.post.mockReturnValue(of({}));

    component['resend']();

    expect(apiMock.post).toHaveBeenCalledWith('/mobile-otp/send', { mobile: '9999933333' });
    expect(component['seconds']()).toBe(24);
    expect(alertSpy).toHaveBeenCalledWith(component['content']().msgOtpSent);
    alertSpy.mockRestore();
  });

  it('should resend OTP mock successfully in local dev mode if API fails', () => {
    vi.stubGlobal('history', {
      state: {
        destination: '9999933333',
        method: 'phone',
        role: 'admin'
      }
    });
    const component = TestBed.inject(Otp);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.stubGlobal('location', { hostname: 'localhost' });
    apiMock.post.mockReturnValue(throwError(() => new Error('Offline')));

    component['resend']();

    expect(component['seconds']()).toBe(24);
    expect(alertSpy).toHaveBeenCalledWith(component['content']().msgOtpResentMock);
    alertSpy.mockRestore();
  });

  it('should show alert error on resend failure if not in local dev mode', () => {
    vi.stubGlobal('history', {
      state: {
        destination: '9999933333',
        method: 'phone',
        role: 'admin'
      }
    });
    const component = TestBed.inject(Otp);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.stubGlobal('location', { hostname: 'production.com' });
    apiMock.post.mockReturnValue(throwError(() => ({ message: 'Rate Limit' })));

    component['resend']();

    expect(alertSpy).toHaveBeenCalledWith('Failed to resend OTP: Rate Limit');
    alertSpy.mockRestore();
  });

  it('should navigate back to sign-in on back click', () => {
    vi.stubGlobal('history', {
      state: {
        destination: '9999933333',
        method: 'phone',
        role: 'admin'
      }
    });
    const component = TestBed.inject(Otp);
    component['back']();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/sign-in']);
  });
});
