import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, OnInit, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import layoutDefaults from '../../../../public/data/layout.json';

/** App footer. Presentational; pairs with the app shell. */
@Component({
  selector: 'md-footer',
  imports: [RouterLink],
  templateUrl: './footer.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: {
    'class': 'block'
  }
})
export class Footer implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  protected readonly year = new Date().getFullYear();

  protected isHomePage(): boolean {
    return this.router.url === '/' || this.router.url === '/home';
  }

  /** Dynamic Copy Signals initialized as empty */
  protected readonly isLoading = signal<boolean>(true);
  protected readonly tagline = signal<string>('');
  protected readonly quickLinksTitle = signal<string>('');
  protected readonly accountLinksTitle = signal<string>('');
  protected readonly contactTitle = signal<string>('');
  protected readonly navLinks = signal<any[]>([]);
  protected readonly serviceLinks = signal<any[]>([]);
  protected readonly accountLinks = signal<any[]>([]);
  protected readonly contactInfo = signal<any>(null);
  protected readonly appPromoTagline = signal<string>('');
  protected readonly appPromoTitle = signal<string>('');
  protected readonly appPromoDescription = signal<string>('');
  protected readonly playStoreUrl = signal<string>('');
  protected readonly appStoreUrl = signal<string>('');
  protected readonly appPromoRatingText = signal<string>('');

  ngOnInit(): void {
    this.http.get<any>('/data/layout.json').subscribe({
      next: (data) => {
        if (data?.footer) {
          const f = data.footer;
          const d = layoutDefaults.footer;
          this.tagline.set(f.tagline || d.tagline);
          this.quickLinksTitle.set(f.quickLinksTitle || d.quickLinksTitle);
          this.accountLinksTitle.set(f.accountLinksTitle || d.accountLinksTitle);
          this.contactTitle.set(f.contactTitle || d.contactTitle);
          this.navLinks.set((f as any).quickLinks || (d as any).quickLinks);
          this.accountLinks.set(f.accountLinks || d.accountLinks);
          this.contactInfo.set(f.contactInfo || d.contactInfo);
          this.appPromoTagline.set((f as any).appPromo?.tagline || (d as any).appPromo?.tagline);
          this.appPromoTitle.set((f as any).appPromo?.title || (d as any).appPromo?.title);
          this.appPromoDescription.set((f as any).appPromo?.description || (d as any).appPromo?.description);
          this.playStoreUrl.set((f as any).appPromo?.playStoreUrl || (d as any).appPromo?.playStoreUrl);
          this.appStoreUrl.set((f as any).appPromo?.appStoreUrl || (d as any).appPromo?.appStoreUrl);
          this.appPromoRatingText.set((f as any).appPromo?.ratingText || (d as any).appPromo?.ratingText);
        }
        if (data?.header?.navLinks) {
          const s = data.header.navLinks.find((l: any) => l.label === 'Services');
          if (s && s.subItems) {
            this.serviceLinks.set(s.subItems);
          }
        }
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load footer layout from json', err);
        const f = layoutDefaults.footer;
        this.tagline.set(f.tagline);
        this.quickLinksTitle.set(f.quickLinksTitle);
        this.accountLinksTitle.set(f.accountLinksTitle);
        this.contactTitle.set(f.contactTitle);
        this.navLinks.set((f as any).quickLinks);
        this.accountLinks.set(f.accountLinks);
        this.contactInfo.set(f.contactInfo);
        this.appPromoTagline.set(f.appPromo.tagline);
        this.appPromoTitle.set(f.appPromo.title);
        this.appPromoDescription.set(f.appPromo.description);
        this.playStoreUrl.set(f.appPromo.playStoreUrl);
        this.appStoreUrl.set(f.appPromo.appStoreUrl);
        this.appPromoRatingText.set(f.appPromo.ratingText);

        const s = layoutDefaults.header.navLinks.find((l: any) => l.label === 'Services');
        if (s && s.subItems) {
          this.serviceLinks.set(s.subItems);
        }
        this.isLoading.set(false);
      }
    });
  }
}
