import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { RouterLink } from '@angular/router';

/** App footer. Presentational; pairs with the app shell. */
@Component({
  selector: 'md-footer',
  imports: [RouterLink],
  templateUrl: './footer.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Footer {
  protected readonly year = new Date().getFullYear();
}
