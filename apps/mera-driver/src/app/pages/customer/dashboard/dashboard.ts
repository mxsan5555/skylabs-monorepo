import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AdminPage } from '../../../admin/admin-page/admin-page';
import { CustomerSelfApiService, type CustomerSelf } from '../../../core/customers/customer-self-api.service';

@Component({
  selector: 'md-customer-dashboard',
  imports: [AdminPage],
  templateUrl: './dashboard.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class CustomerDashboard implements OnInit {
  private readonly api = inject(CustomerSelfApiService);
  private readonly router = inject(Router);

  protected readonly customer = signal<CustomerSelf | null>(null);
  protected readonly loading = signal(true);

  ngOnInit(): void {
    this.api.get().subscribe({
      next: (c) => {
        this.customer.set(c);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected go(path: string): void {
    this.router.navigateByUrl(path);
  }
}
