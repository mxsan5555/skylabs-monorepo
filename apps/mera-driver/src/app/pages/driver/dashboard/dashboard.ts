import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AdminPage } from '../../../admin/admin-page/admin-page';
import { DriverSelfApiService, type DriverSelf } from '../../../core/drivers/driver-self-api.service';
import { statusVariant } from '../status-variant';

@Component({
  selector: 'md-driver-dashboard',
  imports: [AdminPage],
  templateUrl: './dashboard.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DriverDashboard implements OnInit {
  private readonly api = inject(DriverSelfApiService);
  private readonly router = inject(Router);

  protected readonly driver = signal<DriverSelf | null>(null);
  protected readonly loading = signal(true);
  protected readonly statusVariant = statusVariant;

  ngOnInit(): void {
    this.api.get().subscribe({
      next: (d) => {
        this.driver.set(d);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected go(path: string): void {
    this.router.navigateByUrl(path);
  }
}
