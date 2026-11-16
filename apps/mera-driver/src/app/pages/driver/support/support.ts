import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AdminPage } from '../../../admin/admin-page/admin-page';
import { DriverWorkflowApiService, type PortalMessage } from '../../../core/drivers/driver-workflow-api.service';
import { httpErrorMessage } from '../../../core/http-error';

@Component({
  selector: 'md-driver-support',
  imports: [AdminPage, DatePipe],
  templateUrl: './support.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DriverSupport implements OnInit {
  private readonly workflow = inject(DriverWorkflowApiService);

  private readonly messages = signal<PortalMessage[]>([]);
  protected readonly loading = signal(true);
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly sent = signal(false);
  protected subject = '';
  protected body = '';

  protected readonly tickets = computed(() =>
    [...this.messages()].filter(m => m.kind === 'support').sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.workflow.messages().subscribe({
      next: m => { this.messages.set(m); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  protected submit(): void {
    if (this.sending() || !this.subject.trim() || !this.body.trim()) return;
    this.sending.set(true);
    this.error.set(null);
    this.workflow.support(this.subject.trim(), this.body.trim()).subscribe({
      next: () => {
        this.sending.set(false);
        this.sent.set(true);
        this.subject = '';
        this.body = '';
        this.load();
        setTimeout(() => this.sent.set(false), 3000);
      },
      error: async e => { this.sending.set(false); this.error.set(await httpErrorMessage(e)); },
    });
  }
}
