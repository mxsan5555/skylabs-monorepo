import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Root shell. Renders the routed layout/pages via <router-outlet>. App-wide
 * providers live in app.config.ts.
 */
@Component({
  imports: [RouterOutlet],
  selector: 'md-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
