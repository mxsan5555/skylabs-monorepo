import { Component, signal, inject, OnInit, ViewChild, ElementRef, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
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
  styleUrl: './location.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class Location implements OnInit {
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);

  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef;
  private map: any;
  private marker: any;
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
  position = signal<[number, number]>([28.6304, 77.2177]); // Connaught Place, New Delhi default
  address = signal<string>('Select a location on the map or search above...');

  // --- Autocomplete States ---
  searchQuery = signal<string>('');
  suggestions = signal<SearchResult[]>([]);
  showSuggestions = signal<boolean>(false);

  // --- Errors ---
  apiError = signal<string | null>(null);

  // --- Detected City for Filtering ---
  detectedCity = signal<string>('delhi');

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
            this.reverseGeocode(lat, lon);
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

    // Update coordinates when marker is dragged
    this.marker.addListener('dragend', (e: any) => {
      if (e && e.latLng) {
        this.handleMapCoordsUpdate(e.latLng.lat(), e.latLng.lng());
      }
    });

    // Render static drivers nearby
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
    this.position.set([lat, lng]);
    this.address.set('Loading address from Google Maps...');
    this.searchQuery.set('Fetching address...');
    this.showSuggestions.set(false);
    this.reverseGeocode(lat, lng);
    this.updateMapMarker(lat, lng);
    this.renderDriversOnMap();
  }

  // --- Reverse Geocode (Coords to Text Address) ---
  private reverseGeocode(lat: number, lng: number): void {
    if (!window.google || !window.google.maps) return;

    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results: any, status: any) => {
      if (status === 'OK' && results && results[0]) {
        const formatted = results[0].formatted_address;
        this.address.set(formatted);
        this.searchQuery.set(formatted);
        
        // Detect city and update signal
        const city = this.getCityFromAddressComponents(results);
        this.detectedCity.set(city);
        
        this.apiError.set(null);
      } else {
        if (status === 'REQUEST_DENIED') {
          this.apiError.set('Geocoding API is not enabled. Please enable the "Geocoding API" for this key in the Google Cloud Console.');
        } else if (status !== 'ZERO_RESULTS') {
          this.apiError.set(`Geocoding status error: ${status}`);
        }
        const coordsText = `Coordinates (Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)})`;
        this.address.set(coordsText);
        this.searchQuery.set(`Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`);
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
    this.address.set(place.address);
    this.showSuggestions.set(false);

    if (!window.google || !window.google.maps) return;

    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ placeId: place.placeId }, (results: any, status: any) => {
      if (status === 'OK' && results && results[0]) {
        const loc = results[0].geometry.location;
        const lat = loc.lat();
        const lng = loc.lng();
        this.position.set([lat, lng]);
        
        // Detect city and update signal
        const city = this.getCityFromAddressComponents(results);
        this.detectedCity.set(city);
        
        this.updateMapMarker(lat, lng);
        this.renderDriversOnMap();
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

  // --- Confirm Selection ---
  handleConfirmLocation(): void {
    alert(`Location Confirmed:\nAddress: ${this.address()}\nCoords: Lat ${this.position()[0]}, Lng ${this.position()[1]}`);
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
          this.reverseGeocode(lat, lon);
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

  // --- Go Back to Dashboard ---
  goBack(): void {
    this.router.navigate(['/account/dashboard']);
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
          path: 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z',
          fillColor: '#1175bc', // Theme blue
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 1,
          scale: 1.5,
          anchor: new window.google.maps.Point(12, 12)
        }
      });

      // Show InfoWindow on Click
      const infoWindow = new window.google.maps.InfoWindow({
        content: `
          <div style="font-family: Roboto, Arial, sans-serif; padding: 4px; color: #191c1f;">
            <h4 style="margin: 0 0 4px; font-size: 14px; font-weight: 600;">${driver.name}</h4>
            <p style="margin: 0 0 2px; font-size: 12px; color: #42474e;">🚗 ${driver.vehicle}</p>
            <p style="margin: 0 0 2px; font-size: 12px; color: #42474e;">📞 ${driver.phone}</p>
            <p style="margin: 0 0 2px; font-size: 10px; color: #64748b; text-transform: uppercase;">📍 Active in ${driver.city}</p>
            <p style="margin: 0; font-size: 10px; color: #1175bc; font-weight: 500;">📏 ${driver.distance.toFixed(1)} km away</p>
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
}
