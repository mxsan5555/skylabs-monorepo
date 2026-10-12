import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AdminPage } from '../../../admin/admin-page/admin-page';
import { DriverWorkflowApiService, type DriverWorkflowOverview, type MoneyMovement } from '../../../core/drivers/driver-workflow-api.service';
import { DriverSelfApiService, type DriverSelfDocument } from '../../../core/drivers/driver-self-api.service';
import { httpErrorMessage } from '../../../core/http-error';
import { money } from '../money';

const FEE_MOVEMENT_KINDS = ['registration_payment', 'registration_refund', 'registration_waiver'];

declare global {
  interface Window { Razorpay?: new (options: Record<string, unknown>) => { open(): void; on(event: string, handler: () => void): void } }
}

@Component({
  selector: 'md-driver-fee',
  imports: [AdminPage, RouterLink, DatePipe],
  templateUrl: './fee.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DriverFee implements OnInit {
  private readonly workflow = inject(DriverWorkflowApiService);
  private readonly api = inject(DriverSelfApiService);
  protected readonly money = money;

  protected readonly overview = signal<DriverWorkflowOverview | null>(null);
  protected readonly receipt = signal<DriverSelfDocument | null>(null);
  protected readonly loading = signal(true);
  protected readonly paying = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly movements = computed<MoneyMovement[]>(() =>
    (this.overview()?.movements ?? []).filter(m => FEE_MOVEMENT_KINDS.includes(m.kind)),
  );

  protected readonly canPay = computed(() => {
    const o = this.overview();
    return !!o?.driver.registrationFeeRequired && !['Paid', 'Waived'].includes(o.fee);
  });

  ngOnInit(): void {
    this.load();
    this.api.listDocuments().subscribe({
      next: docs => this.receipt.set(docs.find(d => d.type === 'Registration Fee Receipt' && !d.archivedAt) ?? null),
    });
  }

  private load(): void {
    this.loading.set(true);
    this.workflow.overview().subscribe({
      next: o => { this.overview.set(o); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  protected movementLabel(kind: string): string {
    return ({ registration_payment: 'Payment received', registration_refund: 'Refunded', registration_waiver: 'Waived' } as Record<string, string>)[kind] ?? kind;
  }

  protected async pay(): Promise<void> {
    if (this.paying()) return;
    this.paying.set(true);
    this.error.set(null);
    try {
      if (!window.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Unable to load the payment gateway'));
          document.head.appendChild(script);
        });
      }
      this.workflow.paymentOrder().subscribe({
        next: order => {
          const checkout = new window.Razorpay!({
            key: order.keyId, order_id: order.orderId, amount: order.amountPaise, currency: 'INR', name: 'Mera Driver',
            handler: (result: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
              this.paying.set(false);
              this.workflow.paymentConfirm({ paymentId: result.razorpay_payment_id, orderId: result.razorpay_order_id, signature: result.razorpay_signature }).subscribe({
                next: () => this.load(),
                error: async e => this.error.set(await httpErrorMessage(e)),
              });
            },
            modal: { ondismiss: () => { this.paying.set(false); this.error.set('Payment cancelled. Booking remains unpaid until backend confirmation.'); } },
          });
          checkout.on('payment.failed', () => { this.paying.set(false); this.error.set('Payment failed. No collection recorded. Retry or contact support if money was debited.'); });
          checkout.open();
        },
        error: async e => { this.paying.set(false); this.error.set(await httpErrorMessage(e)); },
      });
    } catch (e) {
      this.paying.set(false);
      this.error.set(e instanceof Error ? e.message : 'Unable to start payment');
    }
  }
}
