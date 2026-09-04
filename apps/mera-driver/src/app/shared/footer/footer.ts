import { Component } from '@angular/core';

/** App footer. Presentational; pairs with the app shell. */
@Component({
  selector: 'md-footer',
  template: `<footer class="app-footer">
    <span>© {{ year }} mera-driver</span>
  </footer>`,
})
export class Footer {
  protected readonly year = new Date().getFullYear();
}
