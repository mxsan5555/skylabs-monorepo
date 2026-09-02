import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

/** A navigation entry inside a dropdown / drawer sub-menu. */
interface NavLink {
  label: string;
  desc: string;
  icon: string;
  path: string;
  query?: Record<string, string>;
}

const SERVICES: NavLink[] = [
  {
    label: 'Hourly & Local Drives',
    desc: '1–8 hours, city errands, events',
    icon: 'schedule',
    path: '/ride/options',
    query: { category: 'package' },
  },
  {
    label: 'Inter-State / Outstation',
    desc: 'One-way or multi-day travel',
    icon: 'alt_route',
    path: '/ride/options',
    query: { category: 'outstation' },
  },
  {
    label: 'Luxury & Specialty Drivers',
    desc: 'EVs, manual, high-end vehicles',
    icon: 'workspace_premium',
    path: '/ride/options',
    query: { category: 'car' },
  },
];

const STAFFING: NavLink[] = [
  {
    label: 'Monthly & Annual Hiring',
    desc: 'Dedicated personal / business drivers',
    icon: 'calendar_month',
    path: '/ride/options',
    query: { category: 'monthly' },
  },
  {
    label: 'Post a Requirement',
    desc: 'Tell us exactly what you need',
    icon: 'post_add',
    path: '/sign-in',
  },
];

/**
 * Site header for the marketing shell (PublicLayout). Brand + primary nav with
 * two dropdown menus (Services, Long-Term Staffing) and right-aligned auth CTAs
 * on desktop; a hamburger slide-in drawer (sub-menus as sky-accordions) on
 * mobile. App-specific (knows the router + auth), so it lives in the app.
 */
@Component({
  selector: 'md-header',
  imports: [RouterLink],
  templateUrl: './header.html',
  styleUrl: './header.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: {
    'class': 'block sticky top-0 z-20'
  }
})
export class Header implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly services = SERVICES;
  protected readonly staffing = STAFFING;

  /** Which desktop dropdown is open (one at a time). */
  protected readonly openMenu = signal<'services' | 'staffing' | null>(null);
  /** Mobile drawer open state. */
  protected readonly drawerOpen = signal(false);

  protected toggleMenu(name: 'services' | 'staffing'): void {
    this.openMenu.update((cur) => (cur === name ? null : name));
  }

  protected openDrawer(): void {
    this.drawerOpen.set(true);
    document.body.classList.add('no-scroll');
  }

  protected closeDrawer(): void {
    this.drawerOpen.set(false);
    document.body.classList.remove('no-scroll');
  }

  /** Navigate (closing any open menu/drawer first), with optional query params. */
  protected go(path: string, query?: Record<string, string>): void {
    this.openMenu.set(null);
    this.closeDrawer();
    this.router.navigate([path], query ? { queryParams: query } : {});
  }

  /** Scroll the landing page to the Safety & Trust band. */
  protected goSafety(): void {
    this.openMenu.set(null);
    this.closeDrawer();
    this.router.navigate(['/'], { fragment: 'safety' });
  }

  /** Start sign-up already on the driver persona. */
  protected goDriver(): void {
    this.openMenu.set(null);
    this.closeDrawer();
    this.router.navigate(['/sign-in'], { state: { role: 'driver' } });
  }

  protected signOut(): void {
    this.closeDrawer();
    this.auth.signOut();
    this.router.navigate(['/']);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.openMenu.set(null);
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.openMenu.set(null);
    this.closeDrawer();
  }

  protected goDashboard(): void {
    this.router.navigate(['/account/dashboard']);
  }

  protected callHelpline(): void {
    window.location.href = `tel:${this.helplineNumber()}`;
  }
}
