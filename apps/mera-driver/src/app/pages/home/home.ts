import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { toDataURL } from 'qrcode';
import { BookingService } from '../../core/booking/booking.service';
import { RideMap } from '../../shared/ride-map/ride-map';
import type { RideCategoryId, TripType } from '../../models';

interface ServiceCard {
  title: string;
  desc: string;
  icon: string;
  category: RideCategoryId;
}

const SERVICE_CARDS: ServiceCard[] = [
  {
    title: 'Short-Term',
    desc: 'Hourly (1–8 hrs), city errands, event drivers',
    icon: 'schedule',
    category: 'package',
  },
  {
    title: 'Outstation Trips',
    desc: 'Inter-state / point-to-point, multi-day allowance',
    icon: 'alt_route',
    category: 'outstation',
  },
  {
    title: 'Long-Term Hire',
    desc: '1 month to 1 year dedicated driver placement',
    icon: 'calendar_month',
    category: 'monthly',
  },
  {
    title: 'Luxury & Specialty',
    desc: 'EVs, manual, and high-end vehicle experts',
    icon: 'workspace_premium',
    category: 'car',
  },
];

/**
 * Marketing landing page. Hero "find drivers" form (trip type + now/schedule +
 * pickup/drop) that feeds the booking flow, a services grid, customer + driver
 * sign-up CTAs, a Safety & Trust band, and app-download QR cards. Built from
 * shared-ui; themed by mera-driver's blue palette.
 */
@Component({
  selector: 'md-home',
  imports: [RideMap],
  templateUrl: './home.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Home implements OnInit {
  protected readonly booking = inject(BookingService);
  private readonly router = inject(Router);

  protected readonly serviceCards = SERVICE_CARDS;

  // Hero form state.
  protected readonly tripType = signal<TripType>('one-way');
  protected readonly timing = signal<'now' | 'later'>('now');
  protected pickupText = this.booking.pickup()?.label ?? '';
  protected dropoffText = '';
  protected scheduleDate = '';
  protected scheduleTime = '';

  // Generated download QR codes (data URLs).
  protected readonly customerQr = signal<string>('');
  protected readonly driverQr = signal<string>('');

  async ngOnInit(): Promise<void> {
    const opts = { margin: 1, width: 220, color: { dark: '#101418', light: '#ffffff' } };
    this.customerQr.set(
      await toDataURL('https://mera-driver.app/download/customer', opts),
    );
    this.driverQr.set(
      await toDataURL('https://mera-driver.app/download/driver', opts),
    );
  }

  protected onTripTab(event: Event): void {
    const index = (event.target as HTMLElement & { activeTabIndex: number })
      .activeTabIndex;
    this.tripType.set(index === 1 ? 'round-trip' : 'one-way');
  }

  protected setTiming(value: 'now' | 'later'): void {
    this.timing.set(value);
  }

  /** Push the hero selections into the booking flow and open "Choose a ride". */
  protected seePrices(): void {
    this.booking.setTripType(this.tripType());
    this.booking.setSchedule(
      this.timing() === 'later' && this.scheduleDate
        ? `${this.scheduleDate}T${this.scheduleTime || '09:00'}`
        : 'now',
    );

    // Reuse the current pickup; derive a drop from the typed destination so the
    // flow has an endpoint (mock coord until geocoding exists).
    const pickup = this.booking.pickup();
    if (pickup && this.pickupText.trim()) {
      this.booking.setPickup({ ...pickup, label: this.pickupText.trim() });
    }
    const dest = this.dropoffText.trim() || 'Destination';
    const recent = this.booking.recentPlaces[0];
    this.booking.setDrop({
      id: 'hero-drop',
      label: dest,
      address: dest,
      coord: recent.coord,
      kind: 'recent',
    });

    this.router.navigate(['/ride/options']);
  }

  protected openService(category: RideCategoryId): void {
    this.router.navigate(['/ride/options'], { queryParams: { category } });
  }

  protected go(path: string, state?: Record<string, unknown>): void {
    this.router.navigate([path], state ? { state } : {});
  }
}
