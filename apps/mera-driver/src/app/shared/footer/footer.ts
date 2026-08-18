import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Site footer. Clean and minimal; pairs with the marketing shell. */
@Component({
  selector: 'md-footer',
  imports: [RouterLink],
  templateUrl: './footer.html',
  styleUrl: './footer.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Footer {
  protected readonly year = new Date().getFullYear();
}
