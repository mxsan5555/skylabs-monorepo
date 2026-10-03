import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import '@skylabs-monorepo/shared-ui';
import pressData from '../../../../public/data/press.json';

export interface PressRelease {
  title: string;
  badge: string;
  publisher: string;
  date: string;
  author: string;
  image: string;
  paragraphs: string[];
  tags: string[];
}

@Component({
  selector: 'md-press-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './press-detail.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class PressDetail implements OnInit {
  private readonly http = inject(HttpClient);

  // Default sample press release data for the common dummy detail page
  protected readonly release = signal<PressRelease>({
    title: 'Mera Driver Expands On-Demand Chauffeur & Verified Driver Network Across Major Metros',
    badge: 'Official Press Release',
    publisher: 'Mera Driver Media Desk',
    date: 'Sep 2026',
    author: 'Corporate Communications',
    image: '/images/press/press_1.jpg',
    paragraphs: [
      'Mera Driver has officially announced the expansion of its person-to-person on-demand driver booking platform across top metropolitan areas in India. The service connects personal car owners with background-verified, professional drivers on an hourly and daily basis.',
      'With urban traffic congestion continuing to rise, vehicle owners are increasingly seeking reliable chauffeur services for daily office commutes, weekend getaways, outstation travel, and late-night hires without the financial burden of full-time driver employment.',
      'The platform features real-time GPS telemetry tracking, zero surge pricing, transparent hourly rate cards, and instant driver assignment within 15 minutes of booking.',
      'Moving forward, Mera Driver plans to onboard over 100,000 certified professional driver partners across tier-1 and tier-2 cities while expanding its enterprise corporate commute subscriptions.'
    ],
    tags: ['PressRelease', 'MeraDriver', 'UrbanMobility', 'TechInnovation'],
  });

  // Recent press articles for bottom related cards
  protected readonly recentArticles = signal<any[]>(pressData.articles || []);

  protected readonly labels = signal({
    breadcrumb: 'Press and Media',
    backToArticles: 'Back to all press articles',
    moreCoverageTitle: 'More Press Coverage',
    moreCoverageSubtitle: 'Read recent news releases and media features about Mera Driver.',
    knowMore: 'Know More',
  });

  ngOnInit(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });

    this.http.get<any>('/data/press.json').subscribe({
      next: (data) => {
        if (data && data.articles) {
          this.recentArticles.set(data.articles.slice(0, 3));
        }
      },
      error: (err) => {
        console.warn('Failed to load dynamic press.json for recent articles', err);
      },
    });
  }
}
