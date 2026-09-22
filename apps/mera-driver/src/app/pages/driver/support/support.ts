import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { AdminPage } from '../../../admin/admin-page/admin-page';

/** Static contact info — there's no ticketing/support backend yet (out of Phase 3B scope). */
@Component({
  selector: 'md-driver-support',
  imports: [AdminPage],
  templateUrl: './support.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DriverSupport {}
