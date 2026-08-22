import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { Location } from './location';

describe('Location Component', () => {
  let component: Location;
  let fixture: ComponentFixture<Location>;
  let httpMock: HttpTestingController;
  let routerSpy: any;

  beforeEach(async () => {
    // Setup standard mock for window.google
    (window as any).google = {
      maps: {
        Map: class {
          addListener() {}
          setCenter() {}
          panTo() {}
        },
        Marker: class {
          setMap() {}
          setPosition() {}
          addListener() {}
        },
        Point: class {
          constructor(public x: number, public y: number) {}
        },
        LatLng: class {
          constructor(public latVal: number, public lngVal: number) {}
          lat() { return this.latVal; }
          lng() { return this.lngVal; }
        },
        Geocoder: class {
          geocode(req: any, cb: any) {
            cb([{
              formatted_address: 'Mock Geocoded Address',
              geometry: {
                location: {
                  lat: () => 28.5665,
                  lng: () => 77.3410
                }
              }
            }], 'OK');
          }
        },
        DirectionsService: class {
          route(req: any, cb: any) {
            cb({
              routes: [{
                legs: [{
                  distance: { value: 15000 } // 15 km
                }]
              }]
            }, 'OK');
          }
        },
        DirectionsRenderer: class {
          setMap() {}
          setDirections() {}
        },
        TravelMode: { DRIVING: 'DRIVING' },
        InfoWindow: class {
          open() {}
          close() {}
        },
        GeocoderStatus: { OK: 'OK' },
        places: {
          AutocompleteService: class {
            getPlacePredictions() {}
          }
        }
      }
    };

    routerSpy = { navigate: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [Location],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: routerSpy },
        { provide: ActivatedRoute, useValue: { queryParams: of({}) } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(Location);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    delete (window as any).google;
    localStorage.clear();
  });

  it('should create the component', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne('data/drivers.json');
    req.flush([]);
    
    expect(component).toBeTruthy();
    expect(component.tripType()).toBe('one-way');
  });

  it('should toggle trip type and update signals and route calculation', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne('data/drivers.json');
    req.flush([]);

    component.onTripTypeToggle('outstation');
    expect(component.tripType()).toBe('outstation');
    expect(component.bookingStep()).toBe('form');
  });

  it('should toggle trip type between round-trip, outstation, and one-way', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne('data/drivers.json');
    req.flush([]);

    component.onTripTypeToggle('round-trip');
    expect(component.tripType()).toBe('round-trip');

    component.onTripTypeToggle('outstation');
    expect(component.tripType()).toBe('outstation');

    component.onTripTypeToggle('one-way');
    expect(component.tripType()).toBe('one-way');
  });

  it('should select round-trip duration package and update estimated price', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne('data/drivers.json');
    req.flush([]);

    component.tripType.set('round-trip');
    component.secureBooking.set(false);

    component.onDurationSelect(8);
    expect(component.durationHours()).toBe(8);
    expect(component.estimatedPrice()).toBe(999);

    component.onDurationSelect(12);
    expect(component.estimatedPrice()).toBe(1399);

    component.onDurationSelect(2); // Custom hour rate: 2 * 150 = 300
    expect(component.estimatedPrice()).toBe(300);
  });

  it('should calculate correct outstation fares based on distance and type', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne('data/drivers.json');
    req.flush([]);

    component.secureBooking.set(false);
    component.estimatedDistance.set(50); // 50 km

    // In-City One-Way: ₹399 + (50 * 12) = 999
    component.tripType.set('one-way');
    component.calculatePrice();
    expect(component.estimatedPrice()).toBe(999);

    // Outstation One-Way subtype: ₹999 + (50 * 6) = 1299
    component.tripType.set('outstation');
    component.outstationSubtype.set('one-way');
    component.calculatePrice();
    expect(component.estimatedPrice()).toBe(1299);

    // Outstation Round-Trip 12h: ₹1199 + (50 * 4) = 1399
    component.outstationSubtype.set('round-trip');
    component.outstationDuration.set(12);
    component.calculatePrice();
    expect(component.estimatedPrice()).toBe(1399);

    // Outstation Round-Trip 24h: ₹1599 + (50 * 4) = 1799
    component.outstationDuration.set(24);
    component.calculatePrice();
    expect(component.estimatedPrice()).toBe(1799);
  });

  it('should set active autocomplete input and query values on focus', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne('data/drivers.json');
    req.flush([]);

    component.pickupAddress.set('Sector 15 Noida');
    component.dropAddress.set('Indirapuram Ghaziabad');

    component.onActiveInputFocus('drop');
    expect(component.activeInput()).toBe('drop');
    expect(component.searchQuery()).toBe('Indirapuram Ghaziabad');
  });

  it('should geocode and set pickup address and trigger route rendering', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne('data/drivers.json');
    req.flush([]);

    component.activeInput.set('pickup');
    component.selectLocation({ name: 'Noida City Center', address: 'Sector 32 Noida', placeId: '123' });

    expect(component.pickupAddress()).toBe('Mock Geocoded Address');
    expect(component.pickupCoords()).toEqual([28.5665, 77.341]);
  });

  it('should geocode and set drop destination address and trigger route rendering', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne('data/drivers.json');
    req.flush([]);

    component.activeInput.set('drop');
    component.selectLocation({ name: 'IGI Airport', address: 'New Delhi', placeId: '456' });

    expect(component.dropAddress()).toBe('Mock Geocoded Address');
    expect(component.dropCoords()).toEqual([28.5665, 77.341]);
  });

  it('should show alert and block confirm navigation if drop destination is missing in outstation mode', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne('data/drivers.json');
    req.flush([]);

    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    component.tripType.set('outstation');
    component.dropAddress.set('');

    component.handleConfirmLocation();
    expect(alertSpy).toHaveBeenCalledWith('Please select a destination drop location first.');
    expect(component.bookingStep()).toBe('form');
    alertSpy.mockRestore();
  });

  it('should route to summary step if details are confirmed and valid phone is provided', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne('data/drivers.json');
    req.flush([]);

    component.tripType.set('round-trip');
    component.handleConfirmLocation();
    
    // Modal is now open
    expect(component.showPhoneModal()).toBe(true);
    expect(component.bookingStep()).toBe('form');

    // Invalid phone number submission
    component.tempPhoneNumber.set('123');
    component.submitPhoneNumber();
    expect(component.showPhoneModal()).toBe(true);
    expect(component.bookingStep()).toBe('form');
    expect(component.phoneNumberError()).toBe('Please enter a valid 10-digit mobile number.');

    // Valid 10-digit phone number submission
    component.tempPhoneNumber.set('9876543210');
    component.submitPhoneNumber();
    expect(component.showPhoneModal()).toBe(false);
    expect(component.bookingStep()).toBe('summary');
    expect(component.userPhoneNumber()).toBe('9876543210');
  });

  it('should trigger alert and redirect to home on booking completion', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne('data/drivers.json');
    req.flush([]);

    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    component.handleCreateBooking();

    expect(alertSpy).toHaveBeenCalled();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/']);
    alertSpy.mockRestore();
  });

  it('should apply transmission surcharge to booking pricing', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne('data/drivers.json');
    req.flush([]);

    component.tripType.set('round-trip');
    component.durationHours.set(4);
    component.secureBooking.set(false);

    // Manual base: 599
    component.transmission.set('manual');
    component.calculatePrice();
    expect(component.estimatedPrice()).toBe(599);

    // Automatic surcharge (+50): 599 + 50 = 649
    component.transmission.set('automatic');
    component.calculatePrice();
    expect(component.estimatedPrice()).toBe(649);
  });

  it('should not apply car category premiums to booking pricing (flat rate)', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne('data/drivers.json');
    req.flush([]);

    component.tripType.set('round-trip');
    component.durationHours.set(4);
    component.secureBooking.set(false);
    component.transmission.set('manual');

    // Sedan premium (should remain 599)
    component.carType.set('sedan');
    component.calculatePrice();
    expect(component.estimatedPrice()).toBe(599);

    // SUV premium (should remain 599)
    component.carType.set('suv');
    component.calculatePrice();
    expect(component.estimatedPrice()).toBe(599);

    // Luxury premium (should remain 599)
    component.carType.set('luxury');
    component.calculatePrice();
    expect(component.estimatedPrice()).toBe(599);
  });

  it('should apply and remove coupon DRIVE99 correctly', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne('data/drivers.json');
    req.flush([]);

    component.tripType.set('round-trip');
    component.durationHours.set(4);
    component.secureBooking.set(false);
    component.transmission.set('manual');
    component.carType.set('hatchback');

    // Default base: 599
    expect(component.estimatedPrice()).toBe(599);

    // Invalid coupon
    component.couponCode.set('INVALID');
    component.applyCoupon();
    expect(component.couponApplied()).toBe(false);
    expect(component.couponError()).toBe('Invalid Promo Code!');
    expect(component.estimatedPrice()).toBe(599);

    // Valid coupon DRIVE99: 599 - 99 = 500
    component.couponCode.set('DRIVE99');
    component.applyCoupon();
    expect(component.couponApplied()).toBe(true);
    expect(component.couponError()).toBeNull();
    expect(component.estimatedPrice()).toBe(500);

    // Remove coupon
    component.removeCoupon();
    expect(component.couponApplied()).toBe(false);
    expect(component.couponCode()).toBe('');
    expect(component.estimatedPrice()).toBe(599);
  });
});
