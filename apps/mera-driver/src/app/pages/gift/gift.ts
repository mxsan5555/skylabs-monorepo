import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import '@skylabs-monorepo/shared-ui';
import giftDefaults from '../../../../public/data/gift.json';

export interface GiftOccasion {
  icon: string;
  title: string;
  desc: string;
}

export interface GiftStep {
  step: string;
  icon: string;
  title: string;
  tag?: string;
  desc: string;
}

export interface GiftBottomBanner {
  badge: string;
  title: string;
  subtitle: string;
  buttonText: string;
}

export interface GiftContent {
  badge: string;
  title: string;
  subtitle: string;
  heroImage: string;
  ctaPrimary: string;
  ctaSecondary: string;
  occasionsTitle: string;
  occasions: GiftOccasion[];
  stepsBadge?: string;
  stepsTitle: string;
  stepsSubtitle?: string;
  steps: GiftStep[];
  bottomBanner: GiftBottomBanner;
}

@Component({
  selector: 'md-gift',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './gift.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Gift implements OnInit {
  private readonly http = inject(HttpClient);

  // Strongly-typed Dynamic Content Signal initialized from JSON defaults
  protected readonly content = signal<GiftContent>(giftDefaults as GiftContent);

  ngOnInit(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });

    this.http.get<GiftContent>('/data/gift.json').subscribe({
      next: (data) => {
        if (data) {
          this.content.set(data);
        }
      },
      error: (err) => {
        console.warn('Failed to load /data/gift.json dynamically, fallback to defaults', err);
      },
    });
  }
}
