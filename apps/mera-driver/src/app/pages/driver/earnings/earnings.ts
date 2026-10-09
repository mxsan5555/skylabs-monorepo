import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AdminPage } from '../../../admin/admin-page/admin-page';
import { DriverWorkflowApiService, type MoneyMovement } from '../../../core/drivers/driver-workflow-api.service';
import { money } from '../money';

/** Earnings = driver payouts + commission adjustments + COD collected on the platform's
 *  behalf. Registration fee movements are a separate accounting concern (see the dedicated
 *  Registration Fee page) and are deliberately excluded here so they are never double
 *  counted as earnings. */
const EARNING_KINDS = ['driver_payout', 'driver_cod_collection', 'driver_cod_refund', 'commission_settlement', 'commission_refund', 'driver_recovery', 'booking_payment', 'booking_refund'];

@Component({
  selector: 'md-driver-earnings',
  imports: [AdminPage, DatePipe],
  templateUrl: './earnings.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DriverEarnings implements OnInit {
  private readonly workflow = inject(DriverWorkflowApiService);
  protected readonly money = money;

  protected readonly movements = signal<MoneyMovement[]>([]);
  protected readonly pendingPayoutPaise = signal(0);
  protected readonly loading = signal(true);

  protected readonly transactions = computed(() =>
    [...this.movements()].filter(m => EARNING_KINDS.includes(m.kind)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );

  private sum(kinds: string[]): number {
    return this.transactions().filter(m => kinds.includes(m.kind)).reduce((total, m) => total + m.amountPaise, 0);
  }

  protected readonly payoutsPaid = computed(() => this.sum(['driver_payout']));
  protected readonly codCollected = computed(() => this.sum(['driver_cod_collection']) - this.sum(['driver_cod_refund']));
  protected readonly commission = computed(() => this.sum(['commission_settlement']) - this.sum(['commission_refund']));

  ngOnInit(): void {
    this.loading.set(true);
    this.workflow.overview().subscribe({
      next: o => { this.movements.set(o.movements); this.pendingPayoutPaise.set(o.pendingPayoutPaise); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  protected movementLabel(kind: string): string {
    return ({
      booking_payment: 'Customer payment received by platform', driver_cod_collection: 'COD collected by you',
      commission_settlement: 'Platform commission', driver_payout: 'Payout to you',
      commission_refund: 'Commission returned', driver_recovery: 'Funds recovered from you',
      booking_refund: 'Customer refund', driver_cod_refund: 'COD refund',
    } as Record<string, string>)[kind] ?? kind;
  }
}
