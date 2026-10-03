import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import '@skylabs-monorepo/shared-ui';
import aboutDefaults from '../../../../public/data/about.json';

export interface FounderItem {
  name: string;
  role: string;
  image: string;
}

export interface AboutContent {
  hero: {
    badge: string;
    title: string;
    subtitle1: string;
    description1: string;
    subtitle2: string;
    description2: string;
    heroImage1: string;
    heroImage2: string;
  };
  champions: {
    badge: string;
    title: string;
    description: string;
    founders: FounderItem[];
  };
  jobs: {
    title: string;
    subtitle: string;
    btnText: string;
    bgImage: string;
  };
}

@Component({
  selector: 'md-about',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './about.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class About implements OnInit {
  private readonly http = inject(HttpClient);

  // Strongly-typed Dynamic Content Signal initialized from JSON defaults
  protected readonly content = signal<AboutContent>(aboutDefaults as AboutContent);

  ngOnInit(): void {
    this.http.get<AboutContent>('/data/about.json').subscribe({
      next: (data) => {
        if (data) {
          this.content.set(data);
        }
      },
      error: (err) => {
        console.warn('Failed to load /data/about.json dynamically, fallback to defaults', err);
      },
    });
  }
}
