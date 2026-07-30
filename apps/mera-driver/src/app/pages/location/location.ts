import { Component, signal, inject, OnInit, ViewChild, ElementRef, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';

declare global {
  interface Window {
    google: any;
  }
}

interface SearchResult {
  name: string;
  address: string;
  placeId: string;
}

@Component({
  selector: 'md-location',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './location.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: {
    'class': 'block h-screen w-full'
  }
})
export class Location implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);

  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef;
  private map: any;
  private marker: any; // Pickup marker
  private dropMarker: any = null; // Dropoff marker
  private directionsService: any = null;
  private directionsRenderer: any = null;
  private driverMarkers: any[] = [];
  private driversData: any[] = [];

  // --- Saved Locations (Home & Office) ---
  savedHome = signal<{ name: string; address: string; lat: number; lon: number }>({
    name: 'Home',
    address: 'Not saved yet (Click "Save as Home" below to save)',
    lat: 0,
    lon: 0
  });

  savedOffice = signal<{ name: string; address: string; lat: number; lon: number }>({
    name: 'Office',
    address: 'Not saved yet (Click "Save as Office" below to save)',
    lat: 0,
    lon: 0
  });

  // --- Coordinate & Address State ---
  position = signal<[number, number]>([28.5665, 77.3410]); // Arun Vihar Noida default pickup
  address = signal<string>('Sector 37, Noida, Uttar Pradesh, India');

  // --- Autocomplete States ---
  searchQuery = signal<string>('');
  suggestions = signal<SearchResult[]>([]);
  showSuggestions = signal<boolean>(false);

  // --- DriveU Booking Wizard States ---
  tripType = signal<'one-way' | 'round-trip' | 'outstation'>('one-way');
  activeInput = signal<'pickup' | 'drop'>('pickup');
  
  pickupAddress = signal<string>('Sector 37, Noida, Uttar Pradesh, India');
  pickupCoords = signal<[number, number]>([28.5665, 77.3410]);
  
  dropAddress = signal<string>('');
  dropCoords = signal<[number, number] | null>(null);

  bookingDate = signal<string>('');
  bookingTime = signal<string>('');
  durationHours = signal<number>(4);
  bookingStep = signal<'form' | 'summary'>('form');

  // Detailed DriveU elements
  bookingTiming = signal<'now' | 'later'>('now');
  transmission = signal<'manual' | 'automatic'>('manual');
  carType = signal<'hatchback' | 'sedan' | 'suv' | 'luxury'>('hatchback');
  couponCode = signal<string>('');
  couponApplied = signal<boolean>(false);
  couponError = signal<string | null>(null);
  secureBooking = signal<boolean>(true);

  // Outstation specific elements
  outstationSubtype = signal<'one-way' | 'round-trip'>('round-trip');
  outstationDuration = signal<number>(12);

  // Mobile Verification Dialog Elements
  showPhoneModal = signal<boolean>(false);
  tempPhoneNumber = signal<string>('');
  phoneNumberError = signal<string | null>(null);
  userPhoneNumber = signal<string>('');

  estimatedDistance = signal<number>(0);
  estimatedPrice = signal<number>(599);

  // --- Errors ---
  apiError = signal<string | null>(null);

  // --- Detected City for Filtering ---
  detectedCity = signal<string>('noida');

  constructor() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    this.bookingDate.set(`${yyyy}-${mm}-${dd}`);

    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    this.bookingTime.set(`${hh}:${min}`);
  }

  ngOnInit(): void {
    // 0. Load drivers data
    this.http.get<any[]>('data/drivers.json').subscribe({
      next: (data) => {
        this.driversData = data;
        if (this.map) {
          this.renderDriversOnMap();
        }
      },
      error: (err) => {
        console.error('Failed to load mock drivers JSON in location portal', err);
      }
    });

    // 1. Load saved locations from localStorage
    const cachedHome = localStorage.getItem('mera_driver_saved_home');
    if (cachedHome) {
      try { this.savedHome.set(JSON.parse(cachedHome)); } catch(e) {}
    }

    const cachedOffice = localStorage.getItem('mera_driver_saved_office');
    if (cachedOffice) {
      try { this.savedOffice.set(JSON.parse(cachedOffice)); } catch(e) {}
    }
    // 2. Request user's live geolocation on startup
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          this.position.set([lat, lon]);
          this.address.set('Fetching address for current location...');
          this.searchQuery.set('My Current Location');
          
          if (window.google && window.google.maps) {
            this.reverseGeocode(lat, lon, 'pickup');
          }
        },
        (error) => {
          console.warn('Geolocation failed or denied, using default New Delhi coordinates.', error);
        }
      );
    }
    // 3. Load Google Maps SDK script
    const apiKey = 'AIzaSyCc0KQ40uWG_mnZOcmqYw324z9MXCjm28c';
    if (window.google && window.google.maps) {
      this.initializeMap();
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.id = 'google-maps-api-script';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      this.initializeMap();
    };
    script.onerror = () => {
      this.apiError.set('Failed to load Google Maps SDK script. Please check your internet connection or API Key restrictions.');
    };
    document.head.appendChild(script);

    // 3. Read query params for trip type redirection from header dropdown
    this.route.queryParams.subscribe(params => {
      const type = params['type'];
      if (type === 'one-way' || type === 'round-trip' || type === 'outstation') {
        this.tripType.set(type as any);
        this.calculatePrice();
      }
    });
  }

  // --- Initialize Google Map ---
  private initializeMap(): void {
    if (!this.mapContainer) return;

    const centerLatLng = { lat: this.position()[0], lng: this.position()[1] };

    // Create Map
    this.map = new window.google.maps.Map(this.mapContainer.nativeElement, {
      center: centerLatLng,
      zoom: 13,
      disableDefaultUI: true,
      clickableIcons: false
    });

    // Create Black Marker
    this.marker = new window.google.maps.Marker({
      position: centerLatLng,
      map: this.map,
      draggable: true,
      icon: {
        path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
        fillColor: '#000000',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
        scale: 1.8,
        anchor: new window.google.maps.Point(12, 22)
      }
    });

    // Update coordinates when map is clicked
    this.map.addListener('click', (e: any) => {
      if (e && e.latLng) {
        this.handleMapCoordsUpdate(e.latLng.lat(), e.latLng.lng());
      }
    });

    // Update coordinates when marker is dragged (always updates pickup!)
    this.marker.addListener('dragend', (e: any) => {
      if (e && e.latLng) {
        this.handlePickupMarkerDrag(e.latLng.lat(), e.latLng.lng());
      }
    });

    // Render static drivers nearby
    this.renderDriversOnMap();
  }

  // --- Handle Pickup Marker Drag (Always Pickup!) ---
  private handlePickupMarkerDrag(lat: number, lng: number): void {
    this.pickupCoords.set([lat, lng]);
    this.position.set([lat, lng]);
    this.updateMapMarker(lat, lng);
    
    this.address.set('Loading address from Google Maps...');
    this.searchQuery.set('Fetching address...');
    this.showSuggestions.set(false);
    this.reverseGeocode(lat, lng, 'pickup');
    this.renderDriversOnMap();
  }

  // --- Pan Map & Position Marker ---
  private updateMapMarker(lat: number, lng: number): void {
    if (this.map && this.marker) {
      const newLatLng = new window.google.maps.LatLng(lat, lng);
      this.map.panTo(newLatLng);
      this.marker.setPosition(newLatLng);
    }
  }

  // --- Handle Map Coordinates Change ---
  private handleMapCoordsUpdate(lat: number, lng: number): void {
    if (this.activeInput() === 'pickup') {
      this.pickupCoords.set([lat, lng]);
      this.position.set([lat, lng]);
      this.updateMapMarker(lat, lng);
    } else {
      this.dropCoords.set([lat, lng]);
      this.updateDropMarker(lat, lng);
    }
    this.address.set('Loading address from Google Maps...');
    this.searchQuery.set('Fetching address...');
    this.showSuggestions.set(false);
    this.reverseGeocode(lat, lng);
    this.renderDriversOnMap();
  }

  // --- Reverse Geocode (Coords to Text Address) ---
  private reverseGeocode(lat: number, lng: number, forceTarget?: 'pickup' | 'drop'): void {
    if (!window.google || !window.google.maps) return;

    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results: any, status: any) => {
      const target = forceTarget || this.activeInput();
      if (status === 'OK' && results && results[0]) {
        let formatted = results[0].formatted_address;
        
        // Mock remote sandbox/VM coordinates to a clean Delhi/Noida address
        if (formatted.toLowerCase().includes('khampur') || formatted.toLowerCase().includes('rz-176')) {
          formatted = 'Sector 37, Noida, Uttar Pradesh, India';
          lat = 28.5665;
          lng = 77.3410;
          
          if (target === 'pickup') {
            this.pickupCoords.set([lat, lng]);
            this.position.set([lat, lng]);
            this.updateMapMarker(lat, lng);
          } else {
            this.dropCoords.set([lat, lng]);
            this.updateDropMarker(lat, lng);
          }
        }
        
        if (target === 'pickup') {
          this.pickupAddress.set(formatted);
          this.address.set(formatted);
          if (this.searchQuery() === 'Fetching address...') {
            this.searchQuery.set(formatted);
          }
        } else {
          this.dropAddress.set(formatted);
          if (this.searchQuery() === 'Fetching address...') {
            this.searchQuery.set(formatted);
          }
        }
        
        // Detect city and update signal
        const city = this.getCityFromAddressComponents(results);
        this.detectedCity.set(city);
        
        this.calculateRoute();
        this.apiError.set(null);
      } else {
        if (status === 'REQUEST_DENIED') {
          this.apiError.set('Geocoding API is not enabled. Please enable the "Geocoding API" for this key in the Google Cloud Console.');
        } else if (status !== 'ZERO_RESULTS') {
          this.apiError.set(`Geocoding status error: ${status}`);
        }
        const coordsText = `Coordinates (Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)})`;
        if (target === 'pickup') {
          this.pickupAddress.set(coordsText);
          this.address.set(coordsText);
        } else {
          this.dropAddress.set(coordsText);
        }
        this.searchQuery.set(`Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`);
        this.calculateRoute();
      }
    });
  }

  // --- Autocomplete Input Change Event ---
  onSearchChange(): void {
    const val = this.searchQuery();
    this.address.set(val);

    if (!window.google || !window.google.maps || !window.google.maps.places) return;

    if (val.trim().length > 2) {
      const autocompleteService = new window.google.maps.places.AutocompleteService();
      autocompleteService.getPlacePredictions({ input: val }, (predictions: any, status: any) => {
        if (status === 'OK' && predictions) {
          const results = predictions.map((pred: any) => ({
            name: pred.structured_formatting.main_text,
            address: pred.description,
            placeId: pred.place_id
          }));
          this.suggestions.set(results);
          this.showSuggestions.set(true);
          this.apiError.set(null);
        } else {
          this.suggestions.set([]);
          if (status === 'REQUEST_DENIED') {
            this.apiError.set('Places API is not enabled. Please enable the "Places API" for this key in the Google Cloud Console.');
          } else if (status !== 'ZERO_RESULTS') {
            this.apiError.set(`Autocomplete status: ${status}`);
          }
        }
      });
    } else {
      this.showSuggestions.set(false);
      this.suggestions.set([]);
    }
  }

  // --- Handle Custom Text Field Input Change ---
  onSearchInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
    this.onSearchChange();
  }

  // --- Select Auto-Suggest Result ---
  selectLocation(place: SearchResult): void {
    this.searchQuery.set(place.name);
    this.showSuggestions.set(false);

    if (!window.google || !window.google.maps) return;

    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ placeId: place.placeId }, (results: any, status: any) => {
      if (status === 'OK' && results && results[0]) {
        const loc = results[0].geometry.location;
        const lat = loc.lat();
        const lng = loc.lng();
        
        const addrText = results[0].formatted_address || place.address || place.name;
        if (this.activeInput() === 'pickup') {
          this.pickupAddress.set(addrText);
          this.pickupCoords.set([lat, lng]);
          this.position.set([lat, lng]);
          this.address.set(addrText);
          this.updateMapMarker(lat, lng);
        } else {
          this.dropAddress.set(addrText);
          this.dropCoords.set([lat, lng]);
          this.updateDropMarker(lat, lng);
        }

        // Detect city and update signal
        const city = this.getCityFromAddressComponents(results);
        this.detectedCity.set(city);
        
        this.renderDriversOnMap();
        this.calculateRoute();
        this.apiError.set(null);
      } else {
        if (status === 'REQUEST_DENIED') {
          this.apiError.set('Geocoding API is not enabled. Please enable the "Geocoding API" for this key in the Google Cloud Console.');
        } else {
          this.apiError.set(`Geocoding place failed: ${status}`);
        }
      }
    });
  }

  // --- Select Saved Location (Home / Office) ---
  selectSavedLocation(place: { name: string; address: string; lat: number; lon: number }): void {
    if (place.lat === 0 && place.lon === 0) {
      alert(`Please select your location on the map first, then click "Save as ${place.name}" below to save it.`);
      return;
    }
    this.searchQuery.set(place.name);
    this.position.set([place.lat, place.lon]);
    this.showSuggestions.set(false);
    this.address.set(place.address);
    
    // Detect city from address text
    const cleanAddr = place.address.toLowerCase();
    let city = '';
    if (cleanAddr.includes('delhi')) city = 'delhi';
    else if (cleanAddr.includes('noida')) city = 'noida';
    else if (cleanAddr.includes('gurugram') || cleanAddr.includes('gurgaon')) city = 'gurugram';
    else if (cleanAddr.includes('mumbai')) city = 'mumbai';
    this.detectedCity.set(city);
    
    this.updateMapMarker(place.lat, place.lon);
    this.renderDriversOnMap();
  }

  // --- Save Location Config ---
  saveCurrentLocation(type: 'home' | 'office'): void {
    const userTypedAddress = window.prompt(
      `Edit address to save for ${type === 'home' ? 'Home' : 'Office'}:`,
      this.address()
    );

    if (userTypedAddress === null) return;

    const finalAddress = userTypedAddress.trim() || this.address();

    const newLocation = {
      name: type === 'home' ? 'Home' : 'Office',
      address: finalAddress,
      lat: this.position()[0],
      lon: this.position()[1]
    };

    if (type === 'home') {
      this.savedHome.set(newLocation);
      localStorage.setItem('mera_driver_saved_home', JSON.stringify(newLocation));
    } else {
      this.savedOffice.set(newLocation);
      localStorage.setItem('mera_driver_saved_office', JSON.stringify(newLocation));
    }
  }



  // --- Browser Live Geolocate ---
  handleUseCurrentLocation(): void {
    if (navigator.geolocation) {
      this.address.set('Loading current address...');
      this.searchQuery.set('Fetching current location...');
      this.showSuggestions.set(false);
      
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          this.position.set([lat, lon]);
          this.reverseGeocode(lat, lon, 'pickup');
          this.updateMapMarker(lat, lon);
          this.renderDriversOnMap();
        },
        (error) => {
          alert('Could not retrieve current location.');
          console.warn('Geolocation failed', error);
          this.address.set(this.address());
          this.searchQuery.set(this.searchQuery());
        }
      );
    }
  }

  // --- Go Back to Home ---
  goBack(): void {
    this.router.navigate(['/']);
  }

  // --- Calculate distance in km between two lat/lng coordinates (Haversine formula) ---
  private getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  // --- Render Drivers On Map ---
  private renderDriversOnMap(): void {
    // 1. Clear existing driver markers
    if (this.driverMarkers && this.driverMarkers.length) {
      this.driverMarkers.forEach(m => m.setMap(null));
    }
    this.driverMarkers = [];

    if (!window.google || !window.google.maps || !this.map || !this.driversData.length) return;

    const centerLat = this.position()[0];
    const centerLng = this.position()[1];

    // Filter drivers by currently detected city (fall back to delhi if city is not supported yet)
    const activeCity = this.detectedCity() || 'delhi';
    const cityDrivers = this.driversData.filter(d => d.city === activeCity);

    // Calculate distance to each driver
    const driversWithDistance = cityDrivers
      .filter(d => d.lat !== undefined && d.lng !== undefined)
      .map(d => {
        const dist = this.getDistance(centerLat, centerLng, d.lat, d.lng);
        return { ...d, distance: dist };
      });

    // Sort by distance ascending
    driversWithDistance.sort((a, b) => a.distance - b.distance);

    // Filter to show drivers within 6 km, but ensure we show at least 4 closest drivers if available in the city
    let displayDrivers = driversWithDistance.filter(d => d.distance <= 6.0);
    if (displayDrivers.length < 4 && driversWithDistance.length > 0) {
      displayDrivers = driversWithDistance.slice(0, 4);
    }

    // 2. Render these close drivers at their actual static positions
    displayDrivers.forEach((driver) => {
      const driverLatLng = {
        lat: driver.lat,
        lng: driver.lng
      };

      // Create Custom Taxi Marker
      const driverMarker = new window.google.maps.Marker({
        position: driverLatLng,
        map: this.map,
        title: driver.name,
        icon: {
          path: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
          fillColor: '#1175bc', // Theme blue
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 1,
          scale: 1.5,
          anchor: new window.google.maps.Point(12, 12)
        }
      });

      const infoWindow = new window.google.maps.InfoWindow({
        content: `
          <div class="font-sans p-1 text-slate-900">
            <h4 class="m-0 mb-1.5 text-sm font-semibold text-slate-800">${driver.name}</h4>
            
            <div class="flex items-center gap-1.5 mb-1 text-xs text-slate-600">
              <md-icon class="[--md-icon-size:16px] text-slate-500">person</md-icon>
              <span>${driver.vehicle}</span>
            </div>
            
            <div class="flex items-center gap-1.5 mb-1 text-xs text-slate-600">
              <md-icon class="[--md-icon-size:16px] text-slate-500">phone</md-icon>
              <span>${driver.phone}</span>
            </div>
            
            <div class="flex items-center gap-1.5 mb-1 text-[10px] text-slate-500 uppercase font-medium">
              <md-icon class="[--md-icon-size:14px] text-slate-400">location_on</md-icon>
              <span>Active in ${driver.city}</span>
            </div>
            
            <div class="flex items-center gap-1.5 text-[10px] text-blue-600 font-semibold">
              <md-icon class="[--md-icon-size:14px] text-blue-600">straighten</md-icon>
              <span>${driver.distance.toFixed(1)} km away</span>
            </div>
          </div>
        `
      });

      driverMarker.addListener('click', () => {
        infoWindow.open(this.map, driverMarker);
      });

      this.driverMarkers.push(driverMarker);
    });
  }

  // --- Helper to extract city from Google Maps geocode address components ---
  private getCityFromAddressComponents(results: any): string {
    if (!results || !results[0] || !results[0].address_components) return '';
    
    // 1. Try to find the city from address locality component
    for (const comp of results[0].address_components) {
      if (comp.types.includes('locality')) {
        const name = comp.long_name.toLowerCase();
        if (name.includes('delhi')) return 'delhi';
        if (name.includes('noida')) return 'noida';
        if (name.includes('gurugram') || name.includes('gurgaon')) return 'gurugram';
        if (name.includes('mumbai')) return 'mumbai';
      }
    }
    
    // 2. Fallback to parsing formatted_address string
    const cleanAddr = results[0].formatted_address.toLowerCase();
    if (cleanAddr.includes('delhi')) return 'delhi';
    if (cleanAddr.includes('noida')) return 'noida';
    if (cleanAddr.includes('gurugram') || cleanAddr.includes('gurgaon')) return 'gurugram';
    if (cleanAddr.includes('mumbai') || cleanAddr.includes('bombay')) return 'mumbai';
    
    return '';
  }

  // --- Booking Wizard Helper Methods ---
  private updateDropMarker(lat: number, lng: number): void {
    if (!this.map) return;
    const newLatLng = new window.google.maps.LatLng(lat, lng);

    if (this.dropMarker) {
      this.dropMarker.setPosition(newLatLng);
      this.dropMarker.setMap(this.map);
    } else {
      this.dropMarker = new window.google.maps.Marker({
        position: newLatLng,
        map: this.map,
        icon: {
          path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
          fillColor: '#d32f2f', // Red destination pin
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 1.8,
          anchor: new window.google.maps.Point(12, 22)
        }
      });
    }
  }

  calculateRoute(): void {
    if (this.tripType() === 'round-trip') {
      if (this.directionsRenderer) {
        this.directionsRenderer.setMap(null);
        this.directionsRenderer = null;
      }
      if (this.dropMarker) {
        this.dropMarker.setMap(null);
        this.dropMarker = null;
      }
      this.estimatedDistance.set(0);
      this.calculatePrice();
      return;
    }

    if (!this.pickupCoords() || !this.dropCoords() || !window.google || !window.google.maps) {
      this.calculatePrice();
      return;
    }

    if (!this.directionsService) {
      this.directionsService = new window.google.maps.DirectionsService();
    }
    if (!this.directionsRenderer) {
      this.directionsRenderer = new window.google.maps.DirectionsRenderer({
        map: this.map,
        suppressMarkers: true
      });
    }

    const origin = { lat: this.pickupCoords()[0], lng: this.pickupCoords()[1] };
    const dest = { lat: this.dropCoords()![0], lng: this.dropCoords()![1] };

    this.directionsService.route({
      origin: origin,
      destination: dest,
      travelMode: window.google.maps.TravelMode.DRIVING
    }, (response: any, status: any) => {
      if (status === 'OK' && response) {
        this.directionsRenderer.setMap(this.map);
        this.directionsRenderer.setDirections(response);
        const route = response.routes[0];
        const leg = route.legs[0];
        const distanceKm = (leg.distance.value || 0) / 1000;
        this.estimatedDistance.set(Math.round(distanceKm * 10) / 10);
      } else {
        console.error('Directions request failed due to: ' + status);
        const dist = this.getDistanceFromLatLng(origin.lat, origin.lng, dest.lat, dest.lng);
        this.estimatedDistance.set(Math.round(dist * 10) / 10);
      }
      this.calculatePrice();
    });
  }

  calculatePrice(): void {
    let basePrice = 0;
    if (this.tripType() === 'round-trip') {
      const hours = Number(this.durationHours());
      if (hours === 4) basePrice = 599;
      else if (hours === 8) basePrice = 999;
      else if (hours === 12) basePrice = 1399;
      else basePrice = hours * 150;
    } else {
      const dist = this.estimatedDistance();
      if (this.tripType() === 'one-way') {
        basePrice = Math.round(399 + (dist * 12));
      } else {
        // tripType is outstation
        if (this.outstationSubtype() === 'one-way') {
          basePrice = Math.round(999 + (dist * 6));
        } else {
          const hours = Number(this.outstationDuration());
          let durBase = 1199;
          if (hours === 24) durBase = 1599;
          else if (hours === 36) durBase = 2199;
          else if (hours === 48) durBase = 2799;
          basePrice = Math.round(durBase + (dist * 4));
        }
      }
    }

    // Add Transmission premium
    if (this.transmission() === 'automatic') {
      basePrice += 50;
    }



    // Add Security fee cover
    if (this.secureBooking()) {
      basePrice += 15;
    }

    // Subtract Promo discount
    if (this.couponApplied()) {
      basePrice = Math.max(0, basePrice - 99);
    }

    this.estimatedPrice.set(basePrice);
  }

  applyCoupon(): void {
    const code = this.couponCode().trim().toUpperCase();
    if (code === 'DRIVE99') {
      this.couponApplied.set(true);
      this.couponError.set(null);
    } else {
      this.couponApplied.set(false);
      this.couponError.set('Invalid Promo Code!');
    }
    this.calculatePrice();
  }

  removeCoupon(): void {
    this.couponApplied.set(false);
    this.couponCode.set('');
    this.couponError.set(null);
    this.calculatePrice();
  }

  private getDistanceFromLatLng(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  onActiveInputFocus(type: 'pickup' | 'drop'): void {
    this.activeInput.set(type);
    const currentVal = type === 'pickup' ? this.pickupAddress() : this.dropAddress();
    this.searchQuery.set(currentVal);
    this.showSuggestions.set(true);
  }

  onTripTypeToggle(type: 'one-way' | 'round-trip' | 'outstation'): void {
    this.tripType.set(type);
    this.bookingStep.set('form');
    this.calculateRoute();
  }

  onDurationSelect(hours: number): void {
    this.durationHours.set(hours);
    this.calculatePrice();
  }

  handleConfirmLocation(): void {
    if (this.tripType() !== 'round-trip' && !this.dropAddress()) {
      alert('Please select a destination drop location first.');
      return;
    }
    this.tempPhoneNumber.set('');
    this.phoneNumberError.set(null);
    this.showPhoneModal.set(true);
  }

  submitPhoneNumber(): void {
    const phone = this.tempPhoneNumber().trim();
    if (/^\d{10}$/.test(phone)) {
      this.userPhoneNumber.set(phone);
      this.showPhoneModal.set(false);
      this.bookingStep.set('summary');
    } else {
      this.phoneNumberError.set('Please enter a valid 10-digit mobile number.');
    }
  }

  closePhoneModal(): void {
    this.showPhoneModal.set(false);
    this.tempPhoneNumber.set('');
    this.phoneNumberError.set(null);
  }

  handleCreateBooking(): void {
    alert(`Success! Your driver has been booked for ${this.bookingDate()} at ${this.bookingTime()}.\nTrip Mode: ${this.tripType().toUpperCase()} (${this.tripType() === 'round-trip' ? this.durationHours() + ' Hours' : 'Outstation'})\nEstimated Charge: ₹${this.estimatedPrice()}\nMobile: +91 ${this.userPhoneNumber()}`);
    this.router.navigate(['/']);
  }
}

