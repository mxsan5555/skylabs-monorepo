import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import '@skylabs-monorepo/shared-ui';
import citiesDefaults from '../../../../public/data/cities.json';

export interface CityItem {
  name: string;
  state: string;
  slug: string;
}

export interface CitiesContent {
  badge: string;
  title: string;
  subtitle: string;
  heroImage: string;
  cities: CityItem[];
}

@Component({
  selector: 'md-cities',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './cities.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Cities implements OnInit {
  private readonly http = inject(HttpClient);

  // Strongly-typed Dynamic Content Signal initialized from JSON defaults
  protected readonly content = signal<CitiesContent>(citiesDefaults as CitiesContent);

  ngOnInit(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });

    this.http.get<CitiesContent>('/data/cities.json').subscribe({
      next: (data) => {
        if (data) {
          this.content.set(data);
        }
      },
      error: (err) => {
        console.warn('Failed to load /data/cities.json dynamically, fallback to defaults', err);
      },
    });
  }
}
