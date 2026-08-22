import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AuthService]
    });
    // Clear localStorage before each test run
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();0
    }
    service = TestBed.inject(AuthService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start unauthenticated with default customer role', () => {
    expect(service.isAuthenticated()).toBe(false);
    expect(service.roles()).toEqual(['customer']);
  });

  it('should authenticate when signIn is called', () => {
    service.signIn('my-test-token');
    expect(service.isAuthenticated()).toBe(true);
    expect(service.token()).toBe('my-test-token');
  });

  it('should clear authentication when signOut is called', () => {
    service.signIn('my-test-token');
    expect(service.isAuthenticated()).toBe(true);

    service.signOut();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.token()).toBeNull();
  });

  it('should set roles correctly', () => {
    service.setRoles(['admin']);
    expect(service.roles()).toEqual(['admin']);
  });

  it('should verify roles correctly using hasRole', () => {
    service.setRoles(['driver']);
    expect(service.hasRole(['admin'])).toBe(false);
    expect(service.hasRole(['driver', 'admin'])).toBe(true);
  });
});
