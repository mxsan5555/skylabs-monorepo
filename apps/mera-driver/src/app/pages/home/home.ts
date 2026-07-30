import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, OnInit, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import '@skylabs-monorepo/shared-ui/carousel';

import homeDefaults from '../../../../public/data/home.json';

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

  @ViewChild('swiper', { static: false }) swiperEl?: ElementRef;

  protected readonly content = signal<any>(homeDefaults);

  protected readonly activeFilter = signal<string>('all');
  protected readonly searchQuery = signal<string>('');
  protected readonly activeSearchQuery = signal<string>('');

  protected readonly isDataLoaded = signal<boolean>(false);

  protected onSearchInputChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchQuery.set(value);
  }

  protected onSearchSubmit(): void {
    this.activeSearchQuery.set(this.searchQuery().trim().toLowerCase());
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
