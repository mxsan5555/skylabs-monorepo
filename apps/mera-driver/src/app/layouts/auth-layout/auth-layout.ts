import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { RouterOutlet } from '@angular/router';

/**
 * Centered, minimal shell for auth screens (sign-in, otp). No app header/footer
 * — just a narrow column on the themed background. Marks auth routes noindex
 * while mounted (set once here, covering every auth screen).
 */
@Component({
  selector: 'md-auth-layout',
  imports: [RouterOutlet],
  template: `<div class="auth-layout">
    <main class="auth-layout__inner"><router-outlet></router-outlet></main>
  </div>`,
})
export class AuthLayout implements OnInit, OnDestroy {
  private readonly meta = inject(Meta);

  ngOnInit(): void {
    this.meta.updateTag({ name: 'robots', content: 'noindex' });
  }

  ngOnDestroy(): void {
    this.meta.removeTag("name='robots'");
  }
}
