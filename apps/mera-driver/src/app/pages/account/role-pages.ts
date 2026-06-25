import { Component, CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { AdminPage } from '../../admin/admin-page/admin-page';

/**
 * Placeholder console pages. Dashboard is for everyone; the others are gated to
 * a single role (see routes) to demonstrate role-based access. Real content
 * arrives with the backend.
 */

@Component({
  selector: 'md-account-dashboard',
  imports: [AdminPage],
  template: `<md-admin-page
    title="Dashboard"
    subtitle="An overview of your account activity."
  >
    <sky-card>Welcome back. Pick a section from the sidebar.</sky-card>
  </md-admin-page>`,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Dashboard {}

@Component({
  selector: 'md-account-bookings',
  imports: [AdminPage],
  template: `<md-admin-page
    title="Bookings"
    subtitle="Admin only — manage driver bookings."
  >
    <sky-card>Booking management tools go here.</sky-card>
  </md-admin-page>`,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Bookings {}

@Component({
  selector: 'md-account-promotions',
  imports: [AdminPage],
  template: `<md-admin-page
    title="Promotions"
    subtitle="Marketing only — create and schedule promotions."
  >
    <sky-card>Promotion builder goes here.</sky-card>
  </md-admin-page>`,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Promotions {}

@Component({
  selector: 'md-account-sales',
  imports: [AdminPage],
  template: `<md-admin-page
    title="Sales"
    subtitle="Sales only — track revenue and conversions."
  >
    <sky-card>Sales dashboards go here.</sky-card>
  </md-admin-page>`,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Sales {}
