import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  OnInit,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { toDataURL } from 'qrcode';
import { BookingService } from '../../core/booking/booking.service';
import { LocationService } from '../../core/location/location.service';
import { RideMap } from '../../shared/ride-map/ride-map';
import { LocationPicker } from '../../shared/location-picker/location-picker';
import type { Place, RideCategoryId, TripType } from '../../models';

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
 * sign-up CTAs, a Safety & Trust band, and app-download QR cards.
 */
@Component({
  selector: 'md-home',
  imports: [RideMap, LocationPicker],
  templateUrl: './home.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Home implements OnInit {
  protected readonly booking = inject(BookingService);
  protected readonly locationService = inject(LocationService);
  private readonly router = inject(Router);

  protected readonly serviceCards = SERVICE_CARDS;

  // Hero form state.
  protected readonly tripType = signal<TripType>('one-way');
  protected readonly timing = signal<'now' | 'later'>('now');
  protected pickupText = this.booking.pickup()?.label ?? '';
  protected dropoffText = this.booking.drop()?.label ?? '';
  protected scheduleDate = '';
  protected scheduleTime = '';

  // Generated download QR codes (data URLs).
  protected readonly customerQr = signal<string>('');
  protected readonly driverQr = signal<string>('');

  constructor() {
    effect(() => {
      const p = this.booking.pickup();
      if (p) {
        this.pickupText = p.label;
      }
    });
    effect(() => {
      const d = this.booking.drop();
      if (d) {
        this.dropoffText = d.label;
      }
    });
  }

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

  protected readonly errorMessage = signal<string | null>(null);

  protected onPickupSelected(place: Place): void {
    this.errorMessage.set(null);
    this.pickupText = place.label;
    this.booking.setPickup(place);
    if (place.coord) {
      this.locationService.updateFromCoordinates(place.coord, place.label);
    }
  }

  protected onDropSelected(place: Place): void {
    this.errorMessage.set(null);
    this.dropoffText = place.label;
    this.booking.setDrop(place);
  }

  protected onPickupTextChange(text: string): void {
    this.pickupText = text;
    this.errorMessage.set(null);
    const current = this.booking.pickup();
    if (current && current.label !== text) {
      this.booking.setPickup(null);
    }
  }

  protected onDropTextChange(text: string): void {
    this.dropoffText = text;
    this.errorMessage.set(null);
    const current = this.booking.drop();
    if (current && current.label !== text) {
      this.booking.setDrop(null);
    }
  }

  /** Push the hero selections into the booking flow and open "Choose a ride". */
  protected seePrices(): void {
    this.errorMessage.set(null);

    const pickup = this.booking.pickup();
    const drop = this.booking.drop();

    if (!this.pickupText.trim() || !pickup || !pickup.coord) {
      this.errorMessage.set('Please select a valid pickup location from the suggestions or GPS.');
      return;
    }

    if (!this.dropoffText.trim() || !drop || !drop.coord) {
      this.errorMessage.set('Please select a valid dropoff destination from the suggestions.');
      return;
    }

    this.booking.setTripType(this.tripType());
    this.booking.setSchedule(
      this.timing() === 'later' && this.scheduleDate
        ? `${this.scheduleDate}T${this.scheduleTime || '09:00'}`
        : 'now',
    );

    this.router.navigate(['/ride/options']);
  }

  protected openService(category: RideCategoryId): void {
    this.router.navigate(['/ride/options'], { queryParams: { category } });
  }

  protected go(path: string, state?: Record<string, unknown>): void {
    this.router.navigate([path], state ? { state } : {});
  }
}
