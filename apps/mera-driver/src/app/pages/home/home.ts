import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, OnInit, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import '@skylabs-monorepo/shared-ui/carousel';

import homeDefaults from '../../../../public/data/home.json';

interface SearchResult {
  name: string;
  address: string;
  placeId: string;
}

/**
 * Sample landing page. A page composed from shared-ui components, themed by
 * mera-driver's palette. Real content/data arrives with the blog/contact pages
 * and the backend.
 */
@Component({
  selector: 'md-home',
  templateUrl: './home.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Home implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  @ViewChild('swiper', { static: false }) swiperEl?: ElementRef;

  protected readonly content = signal<any>(homeDefaults);

  protected readonly activeFilter = signal<string>('all');
  protected readonly searchQuery = signal<string>('');
  protected readonly activeSearchQuery = signal<string>('');

  protected readonly isDataLoaded = signal<boolean>(false);

  // --- Uber Booking Card States ---
  protected readonly tripType = signal<'one-way' | 'round-trip' | 'outstation'>('one-way');
  protected readonly activeInput = signal<'pickup' | 'drop'>('pickup');
  
  protected readonly pickupAddress = signal<string>('Sector 37, Noida, Uttar Pradesh, India');
  protected readonly pickupCoords = signal<[number, number]>([28.5665, 77.3410]);
  
  protected readonly dropAddress = signal<string>('');
  protected readonly dropCoords = signal<[number, number] | null>(null);
  
  protected readonly bookingTiming = signal<'now' | 'later'>('now');
  protected readonly autocompleteQuery = signal<string>('');
  protected readonly suggestions = signal<SearchResult[]>([]);
  protected readonly showSuggestions = signal<boolean>(false);
  protected readonly apiError = signal<string | null>(null);
  protected readonly isSearching = signal<boolean>(false);

  protected onSearchInputChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchQuery.set(value);
  }

  protected onSearchSubmit(): void {
    this.activeSearchQuery.set(this.searchQuery().trim().toLowerCase());
  }

  // --- Autocomplete Event Handlers ---
  protected onActiveInputFocus(type: 'pickup' | 'drop'): void {
    this.activeInput.set(type);
    this.autocompleteQuery.set(type === 'pickup' ? this.pickupAddress() : this.dropAddress());
    this.showSuggestions.set(false);
  }

  protected onAutocompleteInputChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.autocompleteQuery.set(value);
    
    if (this.activeInput() === 'pickup') {
      this.pickupAddress.set(value);
    } else {
      this.dropAddress.set(value);
    }
    
    this.onAutocompleteSearch();
  }

  private onAutocompleteSearch(): void {
    const val = this.autocompleteQuery();
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
        }
      });
    } else {
      this.showSuggestions.set(false);
      this.suggestions.set([]);
    }
  }

  protected selectLocation(place: SearchResult): void {
    this.autocompleteQuery.set(place.name);
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
          this.autocompleteQuery.set(addrText);
        } else {
          this.dropAddress.set(addrText);
          this.dropCoords.set([lat, lng]);
          this.autocompleteQuery.set(addrText);
        }
        this.apiError.set(null);
      }
    });
  }

  protected onSubmitBooking(): void {
    this.isSearching.set(true);
    setTimeout(() => {
      this.router.navigate(['/location'], {
        queryParams: {
          type: this.tripType(),
          pickup: this.pickupAddress(),
          pickupLat: this.pickupCoords()[0],
          pickupLng: this.pickupCoords()[1],
          drop: this.dropAddress(),
          dropLat: this.dropCoords() ? this.dropCoords()![0] : null,
          dropLng: this.dropCoords() ? this.dropCoords()![1] : null,
          timing: this.bookingTiming()
        }
      }).then(() => {
        this.isSearching.set(false);
      });
    }, 450); // Clean search loading animation delay
  }

  private filterCard(card: any, serviceFilter: string, searchQuery: string): boolean {
    if (serviceFilter !== 'all' && card.service !== serviceFilter) {
      return false;
    }
    if (searchQuery) {
      const eyebrow = (card.eyebrow || '').toLowerCase();
      const service = (card.service || '').toLowerCase();
      
      return eyebrow.includes(searchQuery) || service.includes(searchQuery);
    }
    return true;
  }

  protected readonly filteredFeaturedServices = computed(() => {
    const cards = this.content().featuredServices?.cards || [];
    const filter = this.activeFilter();
    const query = this.activeSearchQuery();
    return cards.filter((c: any) => this.filterCard(c, filter, query));
  });

  protected readonly filteredPackages = computed(() => {
    const cards = this.content().packages?.cards || [];
    const filter = this.activeFilter();
    const query = this.activeSearchQuery();
    return cards.filter((c: any) => this.filterCard(c, filter, query));
  });

  protected readonly popularRideTypes = computed(() => {
    return this.content().popularRideTypes?.cards || [];
  });

  private initSwiper(): void {
    setTimeout(() => {
      if (this.swiperEl && this.swiperEl.nativeElement) {
        try {
          this.swiperEl.nativeElement.initialize();
        } catch (e) {
          console.error('Swiper manual init error:', e);
        }
      }
    }, 150);
  }

  ngOnInit(): void {
    // Load Google Maps SDK script if not already loaded in the window
    const apiKey = 'AIzaSyCc0KQ40uWG_mnZOcmqYw324z9MXCjm28c';
    if (!window.google || !window.google.maps) {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.id = 'google-maps-api-script';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    this.http.get<any>('/data/home.json?v=' + new Date().getTime()).subscribe({
      next: (data) => {
        if (data) {
          this.content.set({
            ...this.content(),
            ...data
          });
        }
        this.isDataLoaded.set(true);
        this.initSwiper();
      },
      error: (err) => {
        console.error(err);
        this.isDataLoaded.set(true);
        this.initSwiper();
      }
    });
  }
}
