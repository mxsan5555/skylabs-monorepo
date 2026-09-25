import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, inject, signal } from '@angular/core';
import { AdminPage } from '../../../admin/admin-page/admin-page';
import { CustomerSelfApiService, type CustomerSelfBooking } from '../../../core/customers/customer-self-api.service';

@Component({
  selector: 'md-customer-bookings',
  imports: [AdminPage],
  templateUrl: './bookings.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class CustomerBookings implements OnInit {
  private readonly api = inject(CustomerSelfApiService);

  protected readonly bookings = signal<CustomerSelfBooking[]>([]);
  protected readonly loading = signal(true);

  ngOnInit(): void {
    this.api.listBookings().subscribe({
      next: (b) => {
        this.bookings.set(b);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
