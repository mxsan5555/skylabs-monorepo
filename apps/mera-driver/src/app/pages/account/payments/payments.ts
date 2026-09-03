import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, inject, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AdminPage } from '../../../admin/admin-page/admin-page';

interface PaymentRecord {
  id?: string;
  booking_code: string;
  payer_name: string;
  amount: number;
  payment_method: string;
  gateway: string;
  gateway_txn_id: string;
  status: string;
}

@Component({
  selector: 'md-account-payments',
  standalone: true,
  imports: [CommonModule, AdminPage],
  templateUrl: './payments.html',
  styleUrl: '../masters/masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class Payments implements OnInit {
  private readonly http = inject(HttpClient);

  readonly allPayments = signal<PaymentRecord[]>([]);

  // Search & Filter Signals
  readonly searchQuery = signal<string>('');
  readonly statusFilter = signal<string>('all');
  readonly page = signal<number>(1);
  readonly pageSize = signal<number>(10);

  // View Switcher
  readonly showAddForm = signal<boolean>(false);
  readonly editingPaymentId = signal<string | 'new' | null>(null);

  // Form Signals according to Schema
  readonly inputBookingCode = signal<string>('');
  readonly inputPayerName = signal<string>('');
  readonly inputAmount = signal<number>(500);
  readonly inputPaymentMethod = signal<string>('upi');
  readonly inputGateway = signal<string>('razorpay');
  readonly inputGatewayTxnId = signal<string>('');
  readonly inputStatus = signal<string>('pending');

  // Master Options
  readonly paymentMethods = signal<string[]>(['upi', 'card', 'netbanking', 'wallet', 'cash']);
  readonly gateways = signal<string[]>(['razorpay', 'stripe', 'paytm', 'cashfree']);
  readonly statuses = signal<string[]>(['pending', 'success', 'failed', 'refunded']);

  protected readonly content = signal({
    title: 'Payment Registry',
    subtitle: 'Manage booking transactions, payment gateways, and audit logs.',
  });

  // Table Columns
  readonly tableColumns = JSON.stringify([
    { key: 'booking_code', label: 'Booking Ref', sortable: true },
    { key: 'payer_name', label: 'Payer Customer', sortable: true },
    { key: 'amount', label: 'Amount (₹)', sortable: true },
    { key: 'payment_method', label: 'Method', sortable: true },
    { key: 'gateway', label: 'Gateway', sortable: true },
    { key: 'gateway_txn_id', label: 'Gateway Txn ID', sortable: true },
    { key: 'status', label: 'Status', type: 'status', statusMap: { success: 'success', pending: 'warning', refunded: 'info', failed: 'error' } },
  ]);

  readonly tableFilterOptions = JSON.stringify([
    { label: 'All Statuses', value: 'all' },
    { label: 'Success', value: 'success' },
    { label: 'Pending', value: 'pending' },
    { label: 'Failed', value: 'failed' },
    { label: 'Refunded', value: 'refunded' }
  ]);

  readonly tableActions = JSON.stringify([
    { icon: 'edit', label: 'Edit Transaction', event: 'edit_payment' },
    { icon: 'delete', label: 'Delete Entry', event: 'delete_payment', variant: 'danger' }
  ]);

  readonly filteredPayments = computed(() => {
    let list = [...this.allPayments()];
    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      list = list.filter(p =>
        p.booking_code?.toLowerCase().includes(query) ||
        p.payer_name?.toLowerCase().includes(query) ||
        p.gateway_txn_id?.toLowerCase().includes(query)
      );
    }
    const status = this.statusFilter();
    if (status && status !== 'all') {
      list = list.filter(p => p.status === status);
    }
    return list;
  });

  readonly totalPayments = computed(() => this.filteredPayments().length);

  readonly tableRowsString = computed(() => JSON.stringify(this.filteredPayments()));

  ngOnInit(): void {
    this.http.get<any[]>('data/payments.json').subscribe({
      next: (data) => {
        if (data) {
          const mapped: PaymentRecord[] = data.map((item: any) => ({
            id: String(item.id || 'pay-' + Math.random()),
            booking_code: item.booking_code || item.payment_uid || 'BK-1001',
            payer_name: item.payer_name || item.customer_name || 'Rohan Sharma',
            amount: Number(item.amount || 500),
            payment_method: (item.payment_method || 'upi').toLowerCase(),
            gateway: (item.gateway || 'razorpay').toLowerCase(),
            gateway_txn_id: item.gateway_txn_id || item.transaction_id || 'pay_987123',
            status: (item.status || item.payment_status || 'pending').toLowerCase(),
          }));
          this.allPayments.set(mapped);
        }
      },
      error: () => {
        this.allPayments.set([
          { id: 'pay-1', booking_code: 'BK-1001', payer_name: 'Rohan Sharma', amount: 1250, payment_method: 'upi', gateway: 'razorpay', gateway_txn_id: 'pay_987123', status: 'success' },
          { id: 'pay-2', booking_code: 'BK-1002', payer_name: 'Ananya Roy', amount: 850, payment_method: 'card', gateway: 'stripe', gateway_txn_id: 'ch_192837', status: 'success' },
          { id: 'pay-3', booking_code: 'BK-1003', payer_name: 'Karan Malhotra', amount: 450, payment_method: 'cash', gateway: 'cashfree', gateway_txn_id: 'cf_54321', status: 'pending' },
        ]);
      }
    });
  }

  onParamsChange(event: Event): void {
    const detail = (event as CustomEvent).detail;
    if (detail) {
      if (detail.page !== undefined) this.page.set(detail.page);
      if (detail.pageSize !== undefined) this.pageSize.set(detail.pageSize);
      if (detail.search !== undefined) this.searchQuery.set(detail.search);
      if (detail.filter !== undefined) this.statusFilter.set(detail.filter || 'all');
    }
  }

  onRowSelect(event: Event): void {
    const detail = (event as CustomEvent).detail;
    console.log('Selected Payments:', detail.selected);
  }

  onRowAction(event: Event): void {
    const detail = (event as CustomEvent).detail;
    if (detail.action === 'edit_payment') this.editPayment(detail.row);
    else if (detail.action === 'delete_payment') this.deletePayment(detail.row);
  }

  openAddPaymentForm(): void {
    this.editingPaymentId.set('new');
    this.inputBookingCode.set('BK-100' + (this.allPayments().length + 1));
    this.inputPayerName.set('');
    this.inputAmount.set(500);
    this.inputPaymentMethod.set('upi');
    this.inputGateway.set('razorpay');
    this.inputGatewayTxnId.set('pay_' + Math.random().toString(36).substring(7));
    this.inputStatus.set('pending');
    this.showAddForm.set(true);
  }

  editPayment(payment: PaymentRecord): void {
    this.editingPaymentId.set(payment.id || null);
    this.inputBookingCode.set(payment.booking_code);
    this.inputPayerName.set(payment.payer_name);
    this.inputAmount.set(payment.amount);
    this.inputPaymentMethod.set(payment.payment_method);
    this.inputGateway.set(payment.gateway);
    this.inputGatewayTxnId.set(payment.gateway_txn_id);
    this.inputStatus.set(payment.status);
    this.showAddForm.set(true);
  }

  closeAddPaymentForm(): void {
    this.editingPaymentId.set(null);
    this.showAddForm.set(false);
  }

  savePayment(): void {
    if (!this.inputBookingCode().trim()) {
      alert('Booking Ref code is required.');
      return;
    }
    const id = this.editingPaymentId();
    const record: PaymentRecord = {
      id: id === 'new' ? 'pay-' + Date.now() : id!,
      booking_code: this.inputBookingCode().trim(),
      payer_name: this.inputPayerName().trim() || 'Guest Customer',
      amount: Number(this.inputAmount()),
      payment_method: this.inputPaymentMethod(),
      gateway: this.inputGateway(),
      gateway_txn_id: this.inputGatewayTxnId().trim(),
      status: this.inputStatus(),
    };

    if (id === 'new') {
      this.allPayments.update(list => [record, ...list]);
    } else {
      this.allPayments.update(list => list.map(p => p.id === id ? record : p));
    }
    this.closeAddPaymentForm();
  }

  deletePayment(payment: PaymentRecord): void {
    if (confirm(`Delete payment transaction "${payment.booking_code}"?`)) {
      this.allPayments.update(list => list.filter(p => p.id !== payment.id));
    }
  }
}
