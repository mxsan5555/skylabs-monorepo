import { Component, CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { applyTheme, type ThemeMode } from '@skylabs-monorepo/shared-ui';

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

  toggleMode(): void {
    const next: ThemeMode = this.mode() === 'light' ? 'dark' : 'light';
    this.mode.set(next);
    applyTheme(next);
  }
}
