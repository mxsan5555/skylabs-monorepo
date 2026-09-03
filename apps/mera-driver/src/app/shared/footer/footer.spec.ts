import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { Footer } from './footer';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Footer Component', () => {
  let component: Footer;
  let httpMock: any;
  let routerMock: any;

  beforeEach(() => {
    httpMock = {
      get: vi.fn().mockReturnValue(of({
        footer: {
          tagline: 'Test Tagline',
          quickLinksTitle: 'Test Quick Links',
          quickLinks: [
            { label: 'Test Home', route: '/test-home', icon: 'test-home-icon' }
          ],
          accountLinksTitle: 'Test Account',
          contactTitle: 'Test Contact',
          accountLinks: [
            { label: 'Test Sign In', route: '/test-signin', icon: 'test-login' }
          ],
          contactInfo: {
            email: 'test@support.com',
            phone: '+91 00000 00000',
            address: 'Test Address'
          },
          appPromo: {
            tagline: 'Test Tagline App',
            title: 'Test Title App',
            description: 'Test Description App',
            playStoreUrl: 'https://play.google.com/test',
            appStoreUrl: 'https://www.apple.com/app-store/test'
          }
        },
        header: {
          navLinks: [
            {
              label: 'Services',
              route: '#',
              icon: 'business_center',
              subItems: [
                { label: 'One Way', route: '/services/one-way', icon: 'trending_flat' }
              ]
            }
          ]
        }
      })),
    };

    routerMock = {
      url: '/'
    };

    TestBed.configureTestingModule({
      providers: [
        Footer,
        { provide: HttpClient, useValue: httpMock },
        { provide: Router, useValue: routerMock },
      ],
    });

    component = TestBed.inject(Footer);
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize component and fetch footer layout data from json', () => {
    component.ngOnInit();
    expect(httpMock.get).toHaveBeenCalledWith('/data/layout.json');
    expect(component['tagline']()).toBe('Test Tagline');
    expect(component['quickLinksTitle']()).toBe('Test Quick Links');
    expect(component['accountLinksTitle']()).toBe('Test Account');
    expect(component['contactTitle']()).toBe('Test Contact');
    expect(component['navLinks']().length).toBe(1);
    expect(component['navLinks']()[0].label).toBe('Test Home');
    expect(component['accountLinks']().length).toBe(1);
    expect(component['accountLinks']()[0].label).toBe('Test Sign In');
    expect(component['contactInfo']().email).toBe('test@support.com');
    expect(component['serviceLinks']().length).toBe(1);
    expect(component['serviceLinks']()[0].label).toBe('One Way');
    expect(component['appPromoTagline']()).toBe('Test Tagline App');
    expect(component['appPromoTitle']()).toBe('Test Title App');
    expect(component['appPromoDescription']()).toBe('Test Description App');
    expect(component['playStoreUrl']()).toBe('https://play.google.com/test');
    expect(component['appStoreUrl']()).toBe('https://www.apple.com/app-store/test');
    expect(component['appPromoRatingText']()).toBe('⭐ 4.8★ Play Store | 4.7★ App Store');
    expect(component['isLoading']()).toBe(false);
  });

  it('should fallback to defaults if get call fails', () => {
    httpMock.get.mockReturnValue(throwError(() => new Error('Not Found')));
    component.ngOnInit();

    expect(component['tagline']()).toBe('Your ride, your way.');
    expect(component['quickLinksTitle']()).toBe('Quick Links');
    expect(component['accountLinksTitle']()).toBe('Account');
    expect(component['contactTitle']()).toBe('Get in Touch');
    expect(component['isLoading']()).toBe(false);
  });

  it('should identify home page route correctly', () => {
    expect(component['isHomePage']()).toBe(true);

    routerMock.url = '/blog';
    expect(component['isHomePage']()).toBe(false);

    routerMock.url = '/home';
    expect(component['isHomePage']()).toBe(true);
  });
});
