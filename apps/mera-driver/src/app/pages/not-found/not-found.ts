import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { Router } from '@angular/router';

/** 404 page. Rendered by the catch-all route inside the public layout. */
@Component({
  selector: 'md-not-found',
  templateUrl: './not-found.html',
  styleUrl: './not-found.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class NotFound {
  private readonly router = inject(Router);

  protected goHome(): void {
    this.router.navigate(['/']);
  }
}
