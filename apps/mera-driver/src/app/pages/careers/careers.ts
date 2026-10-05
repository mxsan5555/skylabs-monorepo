import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import '@skylabs-monorepo/shared-ui';
import '@skylabs-monorepo/shared-ui/carousel';
import careersDefaults from '../../../../public/data/careers.json';

export interface PerkItem {
  icon: string;
  text: string;
}

export interface EmployeeTestimonial {
  name: string;
  role: string;
  avatar: string;
  quote: string;
}

export interface CareersContent {
  hero: {
    badge: string;
    title: string;
    subtitle: string;
    heroImage1: string;
    heroImage2: string;
  };
  whyWorkWithUs: {
    title: string;
    perks: PerkItem[];
    images: string[];
  };
  testimonials: {
    title: string;
    items: EmployeeTestimonial[];
  };
}

@Component({
  selector: 'md-careers',
  standalone: true,
  imports: [],
  templateUrl: './careers.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Careers implements OnInit {
  private readonly http = inject(HttpClient);

  // Strongly-typed Dynamic Content Signal initialized from JSON defaults
  protected readonly content = signal<CareersContent>(careersDefaults as CareersContent);

  ngOnInit(): void {
    this.http.get<CareersContent>('/data/careers.json').subscribe({
      next: (data) => {
        if (data) {
          this.content.set(data);
        }
      },
      error: (err) => {
        console.warn('Failed to load /data/careers.json dynamically, fallback to defaults', err);
      },
    });
  }
}
