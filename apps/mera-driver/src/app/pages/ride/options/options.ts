import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BookingService } from '../../../core/booking/booking.service';
import { RideMap } from '../../../shared/ride-map/ride-map';
import type { RideCategoryId, RideOption } from '../../../models';

interface Category {
  id: RideCategoryId;
  label: string;
}

const CATEGORIES: Category[] = [
  { id: 'car', label: 'Car' },
  { id: 'package', label: 'Package' },
  { id: 'outstation', label: 'Outstation' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'language', label: 'Language' },
];

/**
 * "Choose a ride" step. Map draws the pickup→drop route; the bottom sheet has a
 * category tab strip (Car / Package / Outstation / Monthly / Language) over the
 * matching ride options. Selecting one and confirming moves to driver choice.
 */
@Component({
  selector: 'md-ride-options',
  imports: [RideMap],
  templateUrl: './options.html',
  styleUrl: './options.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class RideOptions {
  protected readonly booking = inject(BookingService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly categories = CATEGORIES;
  protected readonly category = signal<RideCategoryId>('car');
  protected readonly selectedId = signal<string | null>(null);

  /** Active tab index, kept in sync so a deep-linked category is highlighted. */
  protected readonly categoryIndex = computed(() =>
    Math.max(0, CATEGORIES.findIndex((c) => c.id === this.category())),
  );

  constructor() {
    // Header service links deep-link a category, e.g. /ride/options?category=monthly.
    const requested = this.route.snapshot.queryParamMap.get('category');
    if (requested && CATEGORIES.some((c) => c.id === requested)) {
      this.category.set(requested as RideCategoryId);
    }
  }

  /** Options in the active category. */
  protected readonly options = computed<RideOption[]>(() =>
    this.booking.rideOptions.filter((o) => o.category === this.category()),
  );

  /** The currently chosen option (defaults to the recommended one). */
  protected readonly selected = computed<RideOption | null>(() => {
    const list = this.options();
    const byId = list.find((o) => o.id === this.selectedId());
    return byId ?? list.find((o) => o.recommended) ?? list[0] ?? null;
  });

  protected pickCategory(index: number): void {
    const next = this.categories[index]?.id;
    if (next) {
      this.category.set(next);
      this.selectedId.set(null);
    }
  }

  protected pick(option: RideOption): void {
    this.selectedId.set(option.id);
  }

  protected back(): void {
    this.router.navigate(['/ride']);
  }

  protected confirm(): void {
    const ride = this.selected();
    if (!ride) return;
    this.booking.selectRide(ride);
    this.router.navigate(['/ride/drivers']);
  }
}
