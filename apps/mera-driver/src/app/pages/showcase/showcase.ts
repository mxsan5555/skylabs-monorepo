import { Component, CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { applyTheme, type ThemeMode } from '@skylabs-monorepo/shared-ui';
// Opt-in: registers <swiper-container> / <swiper-slide> for the carousel demos.
import '@skylabs-monorepo/shared-ui/carousel';

/**
 * Demo page for mera-driver. Every control is a Material 3 web component from
 * @skylabs-monorepo/shared-ui, themed by mera-driver's own (blue) palette.
 * Raw <md-*> / <sky-*> tags are used directly; CUSTOM_ELEMENTS_SCHEMA tells
 * Angular to accept them. The toggle calls applyTheme() to re-theme live.
 */
@Component({
  selector: 'md-showcase',
  templateUrl: './showcase.html',
  styleUrl: './showcase.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Showcase {
  readonly mode = signal<ThemeMode>('light');

  /** Anchored menu open state. */
  readonly menuOpen = signal(false);

  /** Demo slides for the carousel section. */
  readonly slides = [1, 2, 3, 4, 5, 6, 7, 8];

  /** Placeholder copy for the accordion demo. */
  readonly lorem =
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse ' +
    'malesuada lacus ex, sit amet blandit leo lobortis eget.';

  /** Data Table Demo Columns & Rows */
  readonly tableColumns = JSON.stringify([
    { key: 'name', label: 'Driver Name', sortable: true },
    { key: 'phone', label: 'Phone Number', sortable: false },
    { key: 'rating', label: 'Rating', sortable: true },
    { key: 'status', label: 'Status', status: true },
    { key: 'joined', label: 'Joined Date', sortable: true }
  ]);

  readonly tableRows = JSON.stringify([
    { name: 'Rahul Sharma', phone: '+91 98765 43210', rating: '4.8 ★', status: 'success', joined: '15 May 2025' },
    { name: 'Amit Verma', phone: '+91 99988 77766', rating: '4.6 ★', status: 'success', joined: '10 June 2025' },
    { name: 'Sanjay Kumar', phone: '+91 91234 56789', rating: '4.2 ★', status: 'warning', joined: '22 Jan 2026' },
    { name: 'Vikram Singh', phone: '+91 88877 66655', rating: '3.9 ★', status: 'error', joined: '03 Feb 2026' },
    { name: 'Rohan Gupta', phone: '+91 77766 55544', rating: '4.9 ★', status: 'info', joined: '18 Mar 2026' }
  ]);

  toggleMode(): void {
    const next: ThemeMode = this.mode() === 'light' ? 'dark' : 'light';
    this.mode.set(next);
    applyTheme(next);
  }
}
