import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AdminPage } from '../../../../admin/admin-page/admin-page';

interface DriverPayout {
  id?: string;
  driver_name: string;
  amount: number;
  bank_account_number: string;
  ifsc_code: string;
  status: string;
  processed_by: string;
  processed_at: string | null;
}

@Component({
  selector: 'md-driver-payouts',
  standalone: true,
  imports: [CommonModule, AdminPage],
  templateUrl: './driver-payouts.html',
  styleUrl: '../../masters/masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DriverPayouts implements OnInit {
  private readonly http = inject(HttpClient);
  readonly list = signal<DriverPayout[]>([]);
  readonly showAddForm = signal(false);
  readonly editingId = signal<string | 'new' | null>(null);

  // Search, Filter & Pagination Signals matching drivers.ts
  readonly searchQuery = signal<string>('');
  readonly statusFilter = signal<string>('all');
  readonly page = signal<number>(1);
  readonly pageSize = signal<number>(10);

  readonly inputDriver = signal('');
  readonly inputAmount = signal(1000);
  readonly inputAccount = signal('');
  readonly inputIfsc = signal('');
  readonly inputStatus = signal('pending');
  readonly inputProcessedBy = signal('SuperAdmin');
  readonly inputProcessedAt = signal('');

  readonly statusOptions = signal<string[]>(['pending', 'processed', 'rejected']);

  readonly tableColumns = JSON.stringify([
    { key: 'driver_name', label: 'Driver Name', sortable: true },
    { key: 'amount', label: 'Amount (₹)', sortable: true },
    { key: 'bank_account_number', label: 'Account Number', sortable: false },
    { key: 'ifsc_code', label: 'IFSC', sortable: true },
    { key: 'status', label: 'Status', type: 'status', statusMap: { processed: 'success', pending: 'warning', rejected: 'error' } },
    { key: 'processed_by', label: 'Processed By', sortable: true },
    { key: 'processed_at', label: 'Processed At', sortable: true },
  ]);

  readonly tableFilterOptions = JSON.stringify([
    { label: 'All Statuses', value: 'all' },
    { label: 'Pending', value: 'pending' },
    { label: 'Processed', value: 'processed' },
    { label: 'Rejected', value: 'rejected' }
  ]);

  readonly tableActions = JSON.stringify([
    { icon: 'edit', label: 'Edit Payout', event: 'edit_option' },
    { icon: 'delete', label: 'Delete Entry', event: 'delete_option', variant: 'danger' },
  ]);

  readonly filteredPayouts = computed(() => {
    let list = [...this.list()];
    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      list = list.filter(p =>
        p.driver_name?.toLowerCase().includes(query) ||
        p.bank_account_number?.toLowerCase().includes(query) ||
        p.ifsc_code?.toLowerCase().includes(query)
      );
    }
    const filter = this.statusFilter();
    if (filter && filter !== 'all') {
      list = list.filter(p => p.status === filter);
    }
    return list;
  });

  readonly totalPayouts = computed(() => this.filteredPayouts().length);

  readonly tableRowsString = computed(() =>
    JSON.stringify(this.filteredPayouts().map((r) => ({ ...r, processed_at: r.processed_at || '—' })))
  );

  ngOnInit(): void {
    this.http.get<any[]>('data/driver_payouts.json').subscribe({
      next: (data) => {
        if (data) {
          const mapped = data.map((item: any) => ({
            id: String(item.id || 'dp-' + Math.random()),
            driver_name: item.driver_name || 'Rahul Verma',
            amount: Number(item.amount || 1500),
            bank_account_number: item.bank_account_number || item.account || '918273645019',
            ifsc_code: item.ifsc_code || 'SBIN0001234',
            status: (item.status || 'pending').toLowerCase(),
            processed_by: item.processed_by || 'Admin',
            processed_at: item.processed_at || null,
          }));
          this.list.set(mapped);
        }
      },
      error: (err) => console.error('Failed to load driver payouts', err),
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

  onRowAction(event: Event): void {
    const detail = (event as CustomEvent).detail;
    if (detail.action === 'edit_option') this.startEdit(detail.row);
    else if (detail.action === 'delete_option') this.deleteOption(detail.row);
  }

  startAdd(): void {
    this.editingId.set('new');
    this.inputDriver.set('');
    this.inputAmount.set(1500);
    this.inputAccount.set('');
    this.inputIfsc.set('');
    this.inputStatus.set('pending');
    this.inputProcessedBy.set('SuperAdmin');
    this.inputProcessedAt.set('');
    this.showAddForm.set(true);
  }

  startEdit(row: DriverPayout): void {
    this.editingId.set(row.id || null);
    this.inputDriver.set(row.driver_name);
    this.inputAmount.set(row.amount);
    this.inputAccount.set(row.bank_account_number);
    this.inputIfsc.set(row.ifsc_code);
    this.inputStatus.set(row.status);
    this.inputProcessedBy.set(row.processed_by);
    this.inputProcessedAt.set(row.processed_at || '');
    this.showAddForm.set(true);
  }

  saveOption(): void {
    if (!this.inputDriver().trim()) {
      alert('Driver name is required.');
      return;
    }
    const id = this.editingId();
    const record: DriverPayout = {
      id: id === 'new' ? 'dp-' + Date.now() : id!,
      driver_name: this.inputDriver().trim(),
      amount: Number(this.inputAmount()),
      bank_account_number: this.inputAccount().trim(),
      ifsc_code: this.inputIfsc().trim(),
      status: this.inputStatus(),
      processed_by: this.inputProcessedBy().trim() || 'Admin',
      processed_at: this.inputProcessedAt().trim() || null,
    };
    if (id === 'new') this.list.update((l) => [...l, record]);
    else this.list.update((l) => l.map((x) => (x.id === id ? record : x)));
    this.cancelEdit();
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.showAddForm.set(false);
  }

  deleteOption(row: DriverPayout): void {
    if (confirm(`Delete payout record for "${row.driver_name}"?`)) {
      this.list.update((l) => l.filter((x) => x.id !== row.id));
    }
  }
}
