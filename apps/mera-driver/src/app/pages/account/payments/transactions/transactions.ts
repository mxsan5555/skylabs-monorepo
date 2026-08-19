import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AdminPage } from '../../../../admin/admin-page/admin-page';

interface PaymentTransaction {
  id?: string;
  booking_code: string;
  customer_name: string;
  final_fare: number;
  payment_mode: string;
  payment_status: string;
}

@Component({
  selector: 'md-payment-transactions',
  standalone: true,
  imports: [AdminPage],
  templateUrl: './transactions.html',
  styleUrl: '../../masters/masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class PaymentTransactions implements OnInit {
  private readonly http = inject(HttpClient);
  readonly list = signal<PaymentTransaction[]>([]);
  readonly showAddForm = signal(false);
  readonly editingId = signal<string | 'new' | null>(null);
  readonly inputCode = signal('');
  readonly inputCustomer = signal('');
  readonly inputFare = signal('0');
  readonly inputMode = signal('upi');
  readonly inputStatus = signal('pending');

  readonly tableColumns = JSON.stringify([
    { key: 'booking_code', label: 'Booking', sortable: true },
    { key: 'customer_name', label: 'Customer', sortable: true },
    { key: 'final_fare', label: 'Amount (₹)', sortable: true },
    { key: 'payment_mode', label: 'Mode', sortable: true },
    { key: 'payment_status', label: 'Status', type: 'status', statusMap: { paid: 'success', pending: 'warning', failed: 'error' } },
  ]);
  readonly tableActions = JSON.stringify([
    { icon: 'edit', label: 'Edit', event: 'edit_option' },
    { icon: 'delete', label: 'Delete', event: 'delete_option', variant: 'danger' },
  ]);
  readonly tableRowsString = computed(() => JSON.stringify(this.list()));

  ngOnInit(): void {
    this.http.get<Array<Record<string, unknown>>>('data/bookings.json').subscribe({
      next: (data) => {
        this.list.set(
          (data || []).map((b) => ({
            id: String(b['id'] ?? ''),
            booking_code: String(b['booking_code'] ?? ''),
            customer_name: String(b['customer_name'] ?? ''),
            final_fare: Number(b['final_fare'] ?? 0),
            payment_mode: String(b['payment_mode'] ?? ''),
            payment_status: String(b['payment_status'] ?? ''),
          }))
        );
      },
      error: (err) => console.error('Failed to load payment transactions', err),
    });
  }

  onRowAction(event: Event): void {
    const detail = (event as CustomEvent).detail;
    if (detail.action === 'edit_option') this.startEdit(detail.row);
    else if (detail.action === 'delete_option') this.deleteOption(detail.row);
  }

  startAdd(): void {
    this.editingId.set('new');
    this.inputCode.set('');
    this.inputCustomer.set('');
    this.inputFare.set('0');
    this.inputMode.set('upi');
    this.inputStatus.set('pending');
    this.showAddForm.set(true);
  }

  startEdit(row: PaymentTransaction): void {
    this.editingId.set(row.id || null);
    this.inputCode.set(row.booking_code);
    this.inputCustomer.set(row.customer_name);
    this.inputFare.set(String(row.final_fare));
    this.inputMode.set(row.payment_mode);
    this.inputStatus.set(row.payment_status);
    this.showAddForm.set(true);
  }

  saveOption(): void {
    if (!this.inputCode().trim()) {
      alert('Booking code is required.');
      return;
    }
    const id = this.editingId();
    const record: PaymentTransaction = {
      id: id === 'new' ? 'pay-' + Date.now() : id!,
      booking_code: this.inputCode().trim(),
      customer_name: this.inputCustomer().trim(),
      final_fare: +this.inputFare() || 0,
      payment_mode: this.inputMode(),
      payment_status: this.inputStatus(),
    };
    if (id === 'new') this.list.update((l) => [...l, record]);
    else this.list.update((l) => l.map((x) => (x.id === id ? record : x)));
    this.cancelEdit();
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.showAddForm.set(false);
  }

  deleteOption(row: PaymentTransaction): void {
    if (confirm(`Delete payment for "${row.booking_code}"?`)) {
      this.list.update((l) => l.filter((x) => x.id !== row.id));
    }
  }
}
