import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AdminPage } from '../../../admin/admin-page/admin-page';
import { DriverWorkflowApiService, type PortalMessage } from '../../../core/drivers/driver-workflow-api.service';

@Component({
  selector: 'md-driver-notifications',
  imports: [AdminPage, DatePipe, RouterLink],
  templateUrl: './notifications.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DriverNotifications implements OnInit {
  private readonly workflow = inject(DriverWorkflowApiService);

  private readonly messages = signal<PortalMessage[]>([]);
  protected readonly loading = signal(true);
  protected readonly notifications = computed(() => this.messages().filter(m => m.kind === 'notification'));

  ngOnInit(): void {
    this.workflow.messages().subscribe({
      next: m => { this.messages.set(m); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  /** Best-effort link from a notification's own subject/body text — there's no structured
   *  "related record" field on `PortalMessage` today, so this reads the existing copy rather
   *  than inventing new metadata. */
  protected relatedPath(message: PortalMessage): string | null {
    const text = `${message.subject} ${message.body}`.toLowerCase();
    if (text.includes('kyc') || text.includes('pill')) return '/driver/kyc';
    if (text.includes('registration fee') || text.includes('payment')) return '/driver/fee';
    if (text.includes('trip') || text.includes('booking') || text.includes('offer')) return '/driver/trips';
    return null;
  }
}
