import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { Router } from '@angular/router';

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

  protected go(path: string): void {
    this.router.navigate([path]);
  }
}
