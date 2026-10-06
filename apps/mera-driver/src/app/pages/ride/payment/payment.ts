import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BookingService } from '../../../core/booking/booking.service';
import type { PaymentMethod } from '../../../models';
import { Workflow } from '../../workflow/workflow';

/**
 * "Pay with" step (reference Image #6). Personal/Business profile tabs, a wallet
 * balance row, and the saved payment methods with a selected check + expired
 * state. Confirming books the ride and moves to the confirmation screen.
 */
@Component({
  selector: 'md-ride-payment',
  imports: [Workflow],
  templateUrl: './payment.html',
  styleUrl: './payment.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class RidePayment {
  protected readonly booking = inject(BookingService);
  private readonly router = inject(Router);
  readonly preset = { fareId:this.booking.ride()?.id,pickupAddress:this.booking.pickup()?.address,dropAddress:this.booking.drop()?.address,startsAt:this.localSchedule(this.booking.schedule()) };
  private localSchedule(schedule:string){const date=new Date(schedule);return Number.isNaN(date.getTime())?'':new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}

  protected select(method: PaymentMethod): void {
    this.booking.selectPayment(method);
  }

  protected back(): void {
    this.router.navigate(['/ride/options']);
  }

  protected confirm(): void {
    this.router.navigate(['/ride/confirmed']);
  }
}
