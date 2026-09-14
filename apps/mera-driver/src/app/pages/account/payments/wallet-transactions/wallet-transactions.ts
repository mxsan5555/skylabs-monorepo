import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AdminPage } from '../../../../admin/admin-page/admin-page';

interface WalletTransaction {
  id?: string;
  owner_name: string;
  owner_type: 'customer' | 'driver';
  booking_code: string;
  type: 'credit' | 'debit';
  amount: number;
  balance_after: number;
  reason: string;
}

@Component({
  selector: 'md-wallet-transactions',
  standalone: true,
  imports: [CommonModule, AdminPage],
  templateUrl: './wallet-transactions.html',
  styleUrl: '../../masters/masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class WalletTransactions implements OnInit {
  private readonly http = inject(HttpClient);
  readonly list = signal<WalletTransaction[]>([]);
  readonly showAddForm = signal(false);
  readonly editingId = signal<string | 'new' | null>(null);

  // Search, Filter & Pagination Signals matching drivers.ts
  readonly searchQuery = signal<string>('');
  readonly typeFilter = signal<string>('all');
  readonly page = signal<number>(1);
  readonly pageSize = signal<number>(10);

  readonly inputOwner = signal('');
  readonly inputOwnerType = signal<'customer' | 'driver'>('customer');
  readonly inputBooking = signal('');
  readonly inputType = signal<'credit' | 'debit'>('credit');
  readonly inputAmount = signal(100);
  readonly inputBalance = signal(500);
  readonly inputReason = signal('trip_earning');

  readonly ownerTypeOptions = signal<string[]>(['customer', 'driver']);
  readonly typeOptions = signal<string[]>(['credit', 'debit']);
  readonly reasonOptions = signal<string[]>(['trip_earning', 'payout', 'refund', 'cashback', 'penalty']);

  readonly tableColumns = JSON.stringify([
    { key: 'owner_name', label: 'Owner Name', sortable: true },
    { key: 'owner_type', label: 'Owner Type', sortable: true },
    { key: 'booking_code', label: 'Booking Ref', sortable: true },
    { key: 'type', label: 'Txn Type', type: 'status', statusMap: { credit: 'success', debit: 'warning' } },
    { key: 'amount', label: 'Amount (₹)', sortable: true },
    { key: 'balance_after', label: 'Balance After (₹)', sortable: true },
    { key: 'reason', label: 'Reason', sortable: true },
  ]);

  readonly tableFilterOptions = JSON.stringify([
    { label: 'All Txn Types', value: 'all' },
    { label: 'Credit', value: 'credit' },
    { label: 'Debit', value: 'debit' }
  ]);

  readonly tableActions = JSON.stringify([
    { icon: 'edit', label: 'Edit Transaction', event: 'edit_option' },
    { icon: 'delete', label: 'Delete Entry', event: 'delete_option', variant: 'danger' },
  ]);

  readonly filteredTransactions = computed(() => {
    let list = [...this.list()];
    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      list = list.filter(w =>
        w.owner_name?.toLowerCase().includes(query) ||
        w.booking_code?.toLowerCase().includes(query) ||
        w.reason?.toLowerCase().includes(query)
      );
    }
    const filter = this.typeFilter();
    if (filter && filter !== 'all') {
      list = list.filter(w => w.type === filter);
    }
    return list;
  });

  readonly totalTransactions = computed(() => this.filteredTransactions().length);

  readonly tableRowsString = computed(() => JSON.stringify(this.filteredTransactions()));

  ngOnInit(): void {
    this.http.get<any[]>('data/wallet_transactions.json').subscribe({
      next: (data) => {
        if (data) {
          const mapped = data.map((item: any) => ({
            id: String(item.id || 'wt-' + Math.random()),
            owner_name: item.owner_name || item.driver_name || item.customer_name || 'Rahul Verma',
            owner_type: (item.owner_type || 'driver').toLowerCase(),
            booking_code: item.booking_code || 'BK-1001',
            type: (item.type || 'credit').toLowerCase(),
            amount: Number(item.amount || 250),
            balance_after: Number(item.balance_after || 1250),
            reason: item.reason || 'trip_earning',
          }));
          this.list.set(mapped);
        }
      },
      error: (err) => console.error('Failed to load wallet transactions', err),
    });
  }

  onParamsChange(event: Event): void {
    const detail = (event as CustomEvent).detail;
    if (detail) {
      if (detail.page !== undefined) this.page.set(detail.page);
      if (detail.pageSize !== undefined) this.pageSize.set(detail.pageSize);
      if (detail.search !== undefined) this.searchQuery.set(detail.search);
      if (detail.filter !== undefined) this.typeFilter.set(detail.filter || 'all');
    }
  }

  onRowAction(event: Event): void {
    const detail = (event as CustomEvent).detail;
    if (detail.action === 'edit_option') this.startEdit(detail.row);
    else if (detail.action === 'delete_option') this.deleteOption(detail.row);
  }

  startAdd(): void {
    this.editingId.set('new');
    this.inputOwner.set('');
    this.inputOwnerType.set('customer');
    this.inputBooking.set('BK-100' + (this.list().length + 1));
    this.inputType.set('credit');
    this.inputAmount.set(100);
    this.inputBalance.set(500);
    this.inputReason.set('trip_earning');
    this.showAddForm.set(true);
  }

  startEdit(row: WalletTransaction): void {
    this.editingId.set(row.id || null);
    this.inputOwner.set(row.owner_name);
    this.inputOwnerType.set(row.owner_type);
    this.inputBooking.set(row.booking_code);
    this.inputType.set(row.type);
    this.inputAmount.set(row.amount);
    this.inputBalance.set(row.balance_after);
    this.inputReason.set(row.reason);
    this.showAddForm.set(true);
  }

  saveOption(): void {
    if (!this.inputOwner().trim()) {
      alert('Owner name is required.');
      return;
    }
    const id = this.editingId();
    const record: WalletTransaction = {
      id: id === 'new' ? 'wt-' + Date.now() : id!,
      owner_name: this.inputOwner().trim(),
      owner_type: this.inputOwnerType(),
      booking_code: this.inputBooking().trim(),
      type: this.inputType(),
      amount: Number(this.inputAmount()),
      balance_after: Number(this.inputBalance()),
      reason: this.inputReason(),
    };
    if (id === 'new') this.list.update((l) => [...l, record]);
    else this.list.update((l) => l.map((x) => (x.id === id ? record : x)));
    this.cancelEdit();
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.showAddForm.set(false);
  }

  deleteOption(row: WalletTransaction): void {
    if (confirm(`Delete wallet transaction for "${row.owner_name}"?`)) {
      this.list.update((l) => l.filter((x) => x.id !== row.id));
    }
  }
}
