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

  /** Demo slides for the carousel section. */
  readonly slides = [1, 2, 3, 4, 5, 6, 7, 8];

  toggleMode(): void {
    const next: ThemeMode = this.mode() === 'light' ? 'dark' : 'light';
    this.mode.set(next);
    applyTheme(next);
  }
}
