import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { AdminPage } from '../../../admin/admin-page/admin-page';

/** Static contact info — mirrors `DriverSupport` exactly; there's no ticketing backend yet. */
@Component({
  selector: 'md-customer-support',
  imports: [AdminPage],
  templateUrl: './support.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class CustomerSupport {}
