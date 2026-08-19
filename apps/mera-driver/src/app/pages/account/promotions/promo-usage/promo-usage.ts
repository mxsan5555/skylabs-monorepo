import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AdminPage } from '../../../../admin/admin-page/admin-page';

interface PromoUsageItem {
  id?: string;
  promo_code: string;
  customer_name: string;
  booking_code: string;
  discount_applied: number;
  used_at: string;
}

@Component({
  selector: 'app-promo-usage',
  standalone: true,
  imports: [CommonModule, AdminPage],
  styleUrl: '../../masters/masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './promo-usage.html',
})
export class PromoUsage implements OnInit {
  private http = inject(HttpClient);

  usageList = signal<PromoUsageItem[]>([]);
  showAddForm = signal(false);
  editingId = signal<string | 'new' | null>(null);

  // Form Signals according to Schema
  inputPromoCode = signal('');
  inputCustomerName = signal('');
  inputBookingCode = signal('');
  inputDiscountApplied = signal(100);
  inputUsedAt = signal(new Date().toISOString().replace('T', ' ').slice(0, 16));

  readonly tableColumns = JSON.stringify([
    { key: 'promo_code', label: 'Promo Code', sortable: true },
    { key: 'customer_name', label: 'Customer Name', sortable: true },
    { key: 'booking_code', label: 'Booking Ref', sortable: true },
    { key: 'discount_applied', label: 'Discount Applied (₹)', sortable: true },
    { key: 'used_at', label: 'Redeemed Date & Time', sortable: true },
  ]);

  readonly tableActions = JSON.stringify([
    { icon: 'edit', label: 'Edit', event: 'edit_option' },
    { icon: 'delete', label: 'Delete', event: 'delete_option', variant: 'danger' }
  ]);

  readonly tableRowsString = computed(() => JSON.stringify(this.usageList()));

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.http.get<any[]>('data/promo_usage.json').subscribe({
      next: (data) => {
        if (data) {
          const mapped = data.map((item: any) => ({
            id: String(item.id || 'pu-' + Math.random()),
            promo_code: item.promo_code || 'WELCOME50',
            customer_name: item.customer_name || 'Rohan Sharma',
            booking_code: item.booking_code || 'BK-1001',
            discount_applied: Number(item.discount_applied || 100),
            used_at: item.used_at || new Date().toISOString().replace('T', ' ').slice(0, 16),
          }));
          this.usageList.set(mapped);
        }
      },
      error: () => {
        this.usageList.set([
          { id: 'pu-1', promo_code: 'WELCOME50', customer_name: 'Rohan Sharma', booking_code: 'BK-1001', discount_applied: 100, used_at: '2026-08-18 10:30' },
          { id: 'pu-2', promo_code: 'FLAT100', customer_name: 'Ananya Roy', booking_code: 'BK-1002', discount_applied: 100, used_at: '2026-08-19 14:15' }
        ]);
      }
    });
  }

  onRowAction(event: any): void {
    const detail = event.detail || event;
    const action = detail.action;
    const row = detail.row;
    if (action === 'edit_option') {
      this.startEdit(row);
    } else if (action === 'delete_option') {
      this.deleteOption(row);
    }
  }

  startAdd() {
    this.editingId.set('new');
    this.inputPromoCode.set('WELCOME50');
    this.inputCustomerName.set('');
    this.inputBookingCode.set('BK-100' + (this.usageList().length + 1));
    this.inputDiscountApplied.set(100);
    this.inputUsedAt.set(new Date().toISOString().replace('T', ' ').slice(0, 16));
    this.showAddForm.set(true);
  }

  startEdit(row: PromoUsageItem) {
    this.editingId.set(row.id || null);
    this.inputPromoCode.set(row.promo_code);
    this.inputCustomerName.set(row.customer_name);
    this.inputBookingCode.set(row.booking_code);
    this.inputDiscountApplied.set(row.discount_applied);
    this.inputUsedAt.set(row.used_at);
    this.showAddForm.set(true);
  }

  cancelEdit() {
    this.showAddForm.set(false);
    this.editingId.set(null);
  }

  saveOption() {
    const code = this.inputPromoCode().trim();
    if (!code) {
      alert('Promo Code is required.');
      return;
    }
    const id = this.editingId();
    const record: PromoUsageItem = {
      id: id === 'new' ? 'pu-' + Date.now() : id!,
      promo_code: code,
      customer_name: this.inputCustomerName().trim() || 'Customer',
      booking_code: this.inputBookingCode().trim(),
      discount_applied: Number(this.inputDiscountApplied()),
      used_at: this.inputUsedAt().trim() || new Date().toISOString().replace('T', ' ').slice(0, 16),
    };

    if (id === 'new') this.usageList.update(list => [...list, record]);
    else this.usageList.update(list => list.map(item => item.id === id ? record : item));

    this.cancelEdit();
  }

  deleteOption(row: PromoUsageItem) {
    if (confirm(`Delete redemption entry for "${row.promo_code}"?`)) {
      this.usageList.update(list => list.filter(item => item.id !== row.id));
    }
  }
}
