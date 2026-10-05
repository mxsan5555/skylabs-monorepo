import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import '@skylabs-monorepo/shared-ui';
import pricingDefaults from '../../../../public/data/pricing.json';

export interface PricingHero {
  badge: string;
  title: string;
  subtitle: string;
  btnText: string;
  link: string;
  image: string;
}

export interface PricingOfferBanner {
  code: string;
  title: string;
  subtitle: string;
  badge: string;
  btnText: string;
  link: string;
}

export interface PricingPackage {
  id: string;
  name: string;
  badge: string;
  price: string;
  unit: string;
  subtext: string;
  features: string[];
  btnText: string;
  link: string;
}

export interface PricingStep {
  step: string;
  title: string;
  description: string;
  icon: string;
}

export interface PricingGuarantee {
  icon: string;
  title: string;
  description: string;
}

export interface PricingContent {
  packagesTitle: string;
  guaranteesTitle: string;
  hero: PricingHero;
  offerBanner: PricingOfferBanner;
  packages: PricingPackage[];
  steps: {
    title: string;
    subtitle: string;
    items: PricingStep[];
  };
  guarantees: PricingGuarantee[];
}

@Component({
  selector: 'md-pricing-public',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './pricing.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class PublicPricing implements OnInit {
  private readonly http = inject(HttpClient);

  // Strongly-typed Dynamic Content Signal initialized from JSON defaults
  protected readonly content = signal<PricingContent>(pricingDefaults as PricingContent);

  ngOnInit(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });

    this.http.get<PricingContent>('/data/pricing.json').subscribe({
      next: (data) => {
        if (data) {
          this.content.set(data);
        }
      },
      error: (err) => {
        console.warn('Failed to load /data/pricing.json dynamically, fallback to defaults', err);
      },
    });
  }
}
