import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import '@skylabs-monorepo/shared-ui';
import safetyDefaults from '../../../../public/data/safety.json';

export interface SafetyCoverItem {
  id: string;
  title: string;
  image: string;
  description: string;
  linkText: string;
}

export interface SafetyMeasureItem {
  icon: string;
  title: string;
  description: string;
}

export interface SafetyFeatureItem {
  icon: string;
  title: string;
  description: string;
}

export interface SafetyContent {
  hero: {
    badge: string;
    title: string;
    description: string;
    image1: string;
    image2: string;
  };
  coversEveryone: {
    title: string;
    items: SafetyCoverItem[];
  };
  measuresBanner: {
    title: string;
    icon: string;
    measures: SafetyMeasureItem[];
  };
  wayForward: {
    title: string;
    subtitle: string;
    features: SafetyFeatureItem[];
  };
}

@Component({
  selector: 'md-safety',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './safety.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Safety implements OnInit {
  private readonly http = inject(HttpClient);

  // Strongly-typed Dynamic Content Signal initialized from JSON defaults
  protected readonly content = signal<SafetyContent>(safetyDefaults as SafetyContent);

  ngOnInit(): void {
    this.http.get<SafetyContent>('/data/safety.json').subscribe({
      next: (data) => {
        if (data) {
          this.content.set(data);
        }
      },
      error: (err) => {
        console.warn('Failed to load /data/safety.json dynamically, fallback to defaults', err);
      },
    });
  }
}
