import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AdminPage } from '../../../admin/admin-page/admin-page';
import { DriverWorkflowApiService, type WorkflowOffer } from '../../../core/drivers/driver-workflow-api.service';
import { httpErrorMessage } from '../../../core/http-error';
import { money } from '../money';

@Component({
  selector: 'md-driver-requests',
  imports: [AdminPage, DatePipe],
  templateUrl: './requests.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DriverRequests implements OnInit {
  private readonly workflow = inject(DriverWorkflowApiService);
  protected readonly money = money;

  protected readonly offers = signal<WorkflowOffer[]>([]);
  protected readonly loading = signal(true);
  protected readonly responding = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.workflow.overview().subscribe({
      next: o => { this.offers.set(o.offers); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  protected respond(offer: WorkflowOffer, accept: boolean): void {
    if (this.responding()) return;
    this.responding.set(offer.id);
    this.error.set(null);
    this.workflow.respondOffer(offer.id, accept).subscribe({
      next: () => { this.responding.set(null); this.load(); },
      error: async e => { this.responding.set(null); this.error.set(await httpErrorMessage(e)); },
    });
  }
}
