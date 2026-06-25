import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { Router } from '@angular/router';
// Registers <swiper-container> / <swiper-slide> — same as showcase.
import '@skylabs-monorepo/shared-ui/carousel';

/**
 * Sample landing page. A page composed from shared-ui components, themed by
 * mera-driver's palette. Real content/data arrives with the blog/contact pages
 * and the backend.
 */
@Component({
  selector: 'md-home',
  templateUrl: './home.html',
  styleUrl: './home.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Home {
  private readonly router = inject(Router);

  readonly slides = [
    {
      image: 'slides/slide-1.jpg',
      imageAlt: 'Person working on a laptop',
    },
    {
      image: 'slides/slide-2.jpg',
      imageAlt: 'Mobile analytics and network',
    },
    {
      image: 'slides/slide-3.jpg',
      imageAlt: 'Secured laptop with lock icon',
    },
    {
      image: 'slides/slide-4.jpg',
      imageAlt: 'Dual monitors with code',
    },
  ];

  protected go(path: string): void {
    this.router.navigate([path]);
  }
}
