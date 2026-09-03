import { TestBed } from '@angular/core/testing';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { SignIn } from './sign-in';
import { ApiClient } from '../../core/api/api-client.service';
import { AuthService } from '../../core/auth/auth.service';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('SignIn Component', () => {
  let component: SignIn;
  let routerMock: any;
  let routeMock: any;
  let apiMock: any;
  let authMock: any;
  let httpMock: any;

  beforeEach(() => {
    routerMock = {
      navigate: vi.fn(),
    };

    routeMock = {
      queryParams: of({}),
    };

    apiMock = {
      post: vi.fn(),
      getBaseUrl: vi.fn().mockReturnValue('/api'),
    };

    authMock = {
      signIn: vi.fn(),
    };

    httpMock = {
      get: vi.fn().mockReturnValue(of({
        signin: {
          title: 'Custom Sign In Title'
        }
      })),
    };

    TestBed.configureTestingModule({
      providers: [
        SignIn,
        { provide: Router, useValue: routerMock },
        { provide: ActivatedRoute, useValue: routeMock },
        { provide: ApiClient, useValue: apiMock },
        { provide: AuthService, useValue: authMock },
        { provide: HttpClient, useValue: httpMock },
      ],
    });

    component = TestBed.inject(SignIn);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should initialize component and load custom sign-in copy from auth.json', () => {
    component.ngOnInit();
    expect(httpMock.get).toHaveBeenCalledWith('data/auth.json');
    expect(component['content']().title).toBe('Custom Sign In Title');
  });

  it('should sign in and navigate to /account if token is present in queryParams', () => {
    routeMock.queryParams = of({ token: 'test-jwt-token' });
    component.ngOnInit();
    expect(authMock.signIn).toHaveBeenCalledWith('test-jwt-token');
    expect(routerMock.navigate).toHaveBeenCalledWith(['/account']);
  });

  it('should switch tab and clear inputs/errors when onTabChange is triggered', () => {
    const mockEvent = {
      target: { activeTabIndex: 0 }
    } as any as Event;
    
    component['onTabChange'](mockEvent);
    expect(component['method']()).toBe('email');
    expect(component['value']).toBe('');
    expect(component['emailError']()).toBe('');

    const mockEventPhone = {
      target: { activeTabIndex: 1 }
    } as any as Event;
    component['onTabChange'](mockEventPhone);
    expect(component['method']()).toBe('phone');
  });

  it('should set value and reset errors on input', () => {
    component['emailError'].set('Some error');
    component['onInput']('user@email.com');
    expect(component['value']).toBe('user@email.com');
    expect(component['emailError']()).toBe('');
  });

  it('should show error if phone field is empty on submit', () => {
    component['method'].set('phone');
    component['value'] = '';
    component['sendOtp']();
    expect(component['phoneError']()).toBe(component['content']().errorPhoneEmpty);
  });

  it('should show error if email field is empty on submit', () => {
    component['method'].set('email');
    component['value'] = '';
    component['sendOtp']();
    expect(component['emailError']()).toBe(component['content']().errorEmailEmpty);
  });

  it('should show error if email format is invalid', () => {
    component['method'].set('email');
    component['value'] = 'invalid-email';
    component['sendOtp']();
    expect(component['emailError']()).toBe(component['content']().errorEmailInvalid);
  });

  it('should show error if phone number is not 10 digits', () => {
    component['method'].set('phone');
    component['value'] = '1234';
    component['sendOtp']();
    expect(component['phoneError']()).toBe(component['content']().errorPhoneInvalid);
  });

  it('should navigate to /otp if OTP request succeeds', () => {
    component['method'].set('phone');
    component['value'] = '9999911111';
    apiMock.post.mockReturnValue(of({}));

    component['sendOtp']();

    expect(apiMock.post).toHaveBeenCalledWith('/mobile-otp/send', { mobile: '9999911111' });
    expect(routerMock.navigate).toHaveBeenCalledWith(['/otp'], {
      state: { destination: '9999911111', method: 'phone' }
    });
  });

  it('should navigate to /otp with mock data on failure if in local dev mode', () => {
    vi.stubGlobal('location', { hostname: 'localhost' });
    component['method'].set('phone');
    component['value'] = '9999911111';
    apiMock.post.mockReturnValue(throwError(() => new Error('Connection Refused')));
    apiMock.getBaseUrl.mockReturnValue('/api');

    component['sendOtp']();

    expect(routerMock.navigate).toHaveBeenCalledWith(['/otp'], {
      state: { destination: '9999911111', method: 'phone' }
    });
  });

  it('should set error on failure if not in local dev mode', () => {
    vi.stubGlobal('location', { hostname: 'production.com' });
    component['method'].set('phone');
    component['value'] = '9999911111';
    apiMock.post.mockReturnValue(throwError(() => ({ message: 'Forbidden' })));
    apiMock.getBaseUrl.mockReturnValue('https://api.production.com');

    component['sendOtp']();

    expect(component['phoneError']()).toContain('Failed to send OTP:');
  });

  it('should continue with Google using mock token in local dev mode', () => {
    vi.stubGlobal('location', { hostname: 'localhost' });
    apiMock.getBaseUrl.mockReturnValue('/api');

    component['continueWithGoogle']();

    expect(authMock.signIn).toHaveBeenCalledWith('mock-google-token');
    expect(routerMock.navigate).toHaveBeenCalledWith(['/account']);
  });

  it('should redirect to google auth in production mode', () => {
    vi.stubGlobal('location', { hostname: 'production.com', href: '' });
    apiMock.getBaseUrl.mockReturnValue('https://api.production.com');

    component['continueWithGoogle']();

    expect(window.location.href).toBe('https://api.production.com/auth/google');
  });
});