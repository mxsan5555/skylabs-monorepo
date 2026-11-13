import { Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, ViewChild, signal,AfterViewInit,OnDestroy} from '@angular/core';
import { applyTheme, type ThemeMode } from '@skylabs-monorepo/shared-ui';
// Opt-in: registers <swiper-container> / <swiper-slide> for the carousel demos.
import '@skylabs-monorepo/shared-ui/carousel';
import '@skylabs-monorepo/shared-ui/editor';
import type { SkySnackbar, SkySnackbarVariant } from '@skylabs-monorepo/shared-ui';

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
export class Showcase implements AfterViewInit, OnDestroy {
  readonly mode = signal<ThemeMode>('light');

  /** Anchored menu open state. */
  readonly menuOpen = signal(false);
  readonly navItems = signal<{ id: string; label: string }[]>([]);
  readonly activeNavId = signal<string>('');
  private cleanupScroll?: () => void;

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


   readonly tableColumns2 = JSON.stringify([
    { key: 'name', label: 'Driver Name', sortable: true },
    { key: 'phone', label: 'Phone Number', sortable: false },
    { key: 'rating', label: 'Rating', sortable: true },
    { key: 'status', label: 'Status', status: true },
    { key: 'joined', label: 'Joined Date', sortable: true }
  ]);

  readonly tableRows2 = JSON.stringify([
    { name: 'Rahul Sharma', phone: '+91 98765 43210', rating: '4.8 ★', status: 'success', joined: '15 May 2025' },
    { name: 'Amit Verma', phone: '+91 99988 77766', rating: '4.6 ★', status: 'success', joined: '10 June 2025' },
    { name: 'Sanjay Kumar', phone: '+91 91234 56789', rating: '4.2 ★', status: 'warning', joined: '22 Jan 2026' },
    { name: 'Vikram Singh', phone: '+91 88877 66655', rating: '3.9 ★', status: 'error', joined: '03 Feb 2026' },
    { name: 'Rohan Gupta', phone: '+91 77766 55544', rating: '4.9 ★', status: 'info', joined: '18 Mar 2026' }
  ]);
  // ── Table 1: Trip Bookings (Filter by Status — no PDF export) ───────────
  readonly bkColumns = JSON.stringify([
    { key: 'id', label: 'Trip ID', sortable: true, width: '110px' },
    { key: 'passenger', label: 'Passenger', sortable: true },
    { key: 'driver', label: 'Driver', sortable: true },
    { key: 'date', label: 'Date', sortable: true },
    {
      key: 'status',
      label: 'Status',
      type: 'status',
      statusMap: { Active: 'success', Completed: 'primary', Cancelled: 'error' },
    },
  ]);

  readonly bkRows = JSON.stringify([
    { id: 'TRIP-001', passenger: 'Aria Chen', driver: 'Rahul Sharma', date: '14 Oct 2026', status: 'Active' },
    { id: 'TRIP-002', passenger: 'Marcus Bell', driver: 'Amit Verma', date: '13 Oct 2026', status: 'Completed' },
    { id: 'TRIP-003', passenger: 'Priya Nair', driver: 'Sanjay Kumar', date: '12 Oct 2026', status: 'Cancelled' },
    { id: 'TRIP-004', passenger: 'Sofia Park', driver: 'Vikram Singh', date: '11 Oct 2026', status: 'Completed' },
    { id: 'TRIP-005', passenger: 'James Rivera', driver: 'Rohan Gupta', date: '10 Oct 2026', status: 'Active' },
  ]);

  readonly bkFilters = JSON.stringify([
    { label: 'Active', value: 'Active' },
    { label: 'Completed', value: 'Completed' },
    { label: 'Cancelled', value: 'Cancelled' },
  ]);

  readonly bkActions = JSON.stringify([
    { icon: 'visibility', label: 'View details', event: '__view_detail__' },
  ]);

  // ── Table 2: Top Routes (Minimal — sort only) ───────────────────────────
  readonly tsColumns = JSON.stringify([
    { key: 'rank', label: '#', width: '48px' },
    { key: 'route', label: 'Route', sortable: true },
    { key: 'trips', label: 'Trips', sortable: true },
    { key: 'avgRating', label: 'Avg Rating', sortable: true },
    { key: 'avgFare', label: 'Avg Fare', sortable: true },
  ]);

  readonly tsRows = JSON.stringify([
    { rank: '1', route: 'Airport Express', trips: '2,847', avgRating: '4.9', avgFare: '₹890' },
    { rank: '2', route: 'Cyber City Shuttle', trips: '2,431', avgRating: '4.8', avgFare: '₹450' },
    { rank: '3', route: 'Downtown Loop', trips: '1,986', avgRating: '4.7', avgFare: '₹350' },
    { rank: '4', route: 'Station Link', trips: '1,654', avgRating: '4.6', avgFare: '₹280' },
    { rank: '5', route: 'Suburban Express', trips: '1,322', avgRating: '4.5', avgFare: '₹620' },
  ]);

  // ── Table 3: Monthly Revenue (PDF export — no filter dropdown) ──────────
  readonly rvColumns = JSON.stringify([
    { key: 'month', label: 'Month', sortable: true, width: '120px' },
    { key: 'category', label: 'Category', sortable: true },
    { key: 'trips', label: 'Trips', sortable: true },
    { key: 'revenue', label: 'Revenue', sortable: true },
    { key: 'growth', label: 'Growth %' },
  ]);

  readonly rvRows = JSON.stringify([
    { month: 'Oct 2026', category: 'City Ride', trips: '1,420', revenue: '₹4,50,000', growth: '+12.4%' },
    { month: 'Sep 2026', category: 'Airport', trips: '980', revenue: '₹3,80,000', growth: '+8.1%' },
    { month: 'Aug 2026', category: 'Outstation', trips: '650', revenue: '₹5,20,000', growth: '+15.2%' },
    { month: 'Jul 2026', category: 'Rental', trips: '410', revenue: '₹2,90,000', growth: '-2.0%' },
  ]);

  // ── Snackbar State & Methods ──────────────────────────────────────────────
  @ViewChild('snackbar') snackbarRef?: ElementRef<SkySnackbar>;
  readonly snackbarLog = signal('');

  showSnackbar(
    variant: SkySnackbarVariant,
    message = 'Link copied to clipboard.',
    actionLabel?: string,
    closable = true,
    duration = 4000
  ): void {
    const el = this.snackbarRef?.nativeElement;
    if (!el) return;
    el.variant = variant;
    el.closable = closable;
    el.actionLabel = actionLabel;
    el.duration = duration;
    el.show(message);
  }

  onSnackbarAction(): void {
    this.snackbarLog.set('sky-action fired');
  }

  onSnackbarClosed(event: Event): void {
    const custom = event as CustomEvent<{ reason: string }>;
    this.snackbarLog.set(`sky-closed: reason="${custom.detail?.reason}"`);
  }

  
addToCart(): void {
  console.log('Added to cart');
}

  toggleMode(): void {
    const next: ThemeMode = this.mode() === 'light' ? 'dark' : 'light';
    this.mode.set(next);
    applyTheme(next);
  }
    ngAfterViewInit(): void {
    // with the help of DOM we can autodetect the sections
    const sections = Array.from(document.querySelectorAll<HTMLElement>('.showcase__card[id]'));
    const items = sections
      .map((s) => ({
        id: s.id,
        label: s.querySelector('h2')?.textContent?.trim() ?? s.id,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    this.navItems.set(items);

    // 2. Scroll-spy calculation
    const TRIGGER_RATIO = 0.2;
    let frame = 0;
    const recompute = () => {
      frame = 0;
      const triggerY = window.innerHeight * TRIGGER_RATIO;
      let current = sections[0]?.id ?? '';
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= triggerY) {
          current = section.id;
        } else {
          break;
        }
      }
      this.activeNavId.set(current);
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(recompute);
    };

    recompute();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    this.cleanupScroll = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }

  ngOnDestroy(): void {
    this.cleanupScroll?.();
  }

  // 3. Side nav item smooth scroll
  scrollToSection(event: Event, id: string): void {
    event.preventDefault();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    window.history.replaceState(null, '', `${window.location.pathname}#${id}`);
    this.activeNavId.set(id);
  }
}

