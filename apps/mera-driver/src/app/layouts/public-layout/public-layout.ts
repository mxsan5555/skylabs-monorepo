import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from '../../shared/header/header';
import { Footer } from '../../shared/footer/footer';

/**
 * Public app shell: header + routed content + footer. Use for marketing/content
 * pages (home, blog, contact). Auth and admin can get their own layouts later
 * (auth-layout for sign-in/otp, admin-layout with a sidebar).
 */
@Component({
  selector: 'md-public-layout',
  imports: [RouterOutlet, Header, Footer],
  template: `<div class="app-shell">
    <md-header></md-header>
    <main class="app-main"><router-outlet></router-outlet></main>
    <md-footer></md-footer>
  </div>`,
})
export class PublicLayout {}
