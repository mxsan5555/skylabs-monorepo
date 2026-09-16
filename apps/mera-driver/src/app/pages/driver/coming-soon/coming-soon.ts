import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AdminPage } from '../../../admin/admin-page/admin-page';

/**
 * Generic placeholder for driver-portal sections the backend doesn't support yet
 * (My Vehicle, My Trips, Notifications) — reused across all three via route
 * `data.title`/`data.description` rather than one component per section, since
 * there's nothing else to render until the backing API exists.
 */
@Component({
  selector: 'md-driver-coming-soon',
  imports: [AdminPage],
  templateUrl: './coming-soon.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DriverComingSoon {
  private readonly route = inject(ActivatedRoute);

  protected readonly title = this.route.snapshot.data['title'] as string;
  protected readonly description = this.route.snapshot.data['description'] as string;
}
