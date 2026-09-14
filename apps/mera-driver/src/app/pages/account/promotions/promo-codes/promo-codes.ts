import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AdminPage } from '../../../../admin/admin-page/admin-page';

interface PromoCodeItem {
  id?: string;
  code: string;
  description: string;
  discount_type: 'flat' | 'percent';
  discount_value: number;
  max_discount_amount: number;
  min_fare_required: number;
  usage_limit_per_user: number;
  total_usage_limit: number;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
}

@Component({
  selector: 'app-promo-codes',
  standalone: true,
  imports: [CommonModule, AdminPage],
  styleUrl: '../../masters/masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './promo-codes.html',
})
export class PromoCodes implements OnInit {
  private http = inject(HttpClient);

  promoList = signal<PromoCodeItem[]>([]);
  showAddForm = signal(false);
  editingId = signal<string | 'new' | null>(null);

  // Form Signals according to Schema
  inputCode = signal('');
  inputDescription = signal('');
  inputDiscountType = signal<'flat' | 'percent'>('percent');
  inputDiscountValue = signal(20);
  inputMaxDiscountAmount = signal(100);
  inputMinFareRequired = signal(200);
  inputUsageLimitPerUser = signal(1);
  inputTotalUsageLimit = signal(500);
  inputValidFrom = signal(new Date().toISOString().slice(0, 10));
  inputValidUntil = signal('2026-12-31');
  inputIsActive = signal(true);

  discountTypeOptions = signal<string[]>(['flat', 'percent']);

  readonly tableColumns = JSON.stringify([
    { key: 'code', label: 'Promo Code', sortable: true },
    { key: 'discount_type', label: 'Discount Type', sortable: true },
    { key: 'discount_value', label: 'Discount Value', sortable: true },
    { key: 'max_discount_amount', label: 'Max Discount (₹)', sortable: true },
    { key: 'min_fare_required', label: 'Min Fare (₹)', sortable: true },
    { key: 'valid_from', label: 'Valid From', sortable: true },
    { key: 'valid_until', label: 'Valid Until', sortable: true },
    { key: 'is_active', label: 'Status', type: 'status', statusMap: { true: 'success', false: 'error' } },
  ]);

  readonly tableActions = JSON.stringify([
    { icon: 'edit', label: 'Edit', event: 'edit_option' },
    { icon: 'delete', label: 'Delete', event: 'delete_option', variant: 'danger' }
  ]);

  readonly tableRowsString = computed(() => JSON.stringify(this.promoList()));

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.http.get<any[]>('data/promo_codes.json').subscribe({
      next: (data) => {
        if (data) {
          const mapped = data.map((item: any) => ({
            id: String(item.id || 'pc-' + Math.random()),
            code: item.code || 'FIRST50',
            description: item.description || 'Welcome discount for new customers',
            discount_type: (item.discount_type || (item.discount_percentage ? 'percent' : 'flat')).toLowerCase(),
            discount_value: Number(item.discount_value || item.discount_percentage || 20),
            max_discount_amount: Number(item.max_discount_amount || item.max_discount || 100),
            min_fare_required: Number(item.min_fare_required || 150),
            usage_limit_per_user: Number(item.usage_limit_per_user || 1),
            total_usage_limit: Number(item.total_usage_limit || 1000),
            valid_from: item.valid_from || new Date().toISOString().slice(0, 10),
            valid_until: item.valid_until || item.valid_till || '2026-12-31',
            is_active: item.is_active !== undefined ? Boolean(item.is_active) : (item.status === 'Active'),
          }));
          this.promoList.set(mapped);
        }
      },
      error: () => {
        this.promoList.set([
          { id: 'pc-1', code: 'WELCOME50', description: 'Get 50% off on first ride', discount_type: 'percent', discount_value: 50, max_discount_amount: 150, min_fare_required: 200, usage_limit_per_user: 1, total_usage_limit: 1000, valid_from: '2026-01-01', valid_until: '2026-12-31', is_active: true },
          { id: 'pc-2', code: 'FLAT100', description: 'Flat Rs 100 cashback', discount_type: 'flat', discount_value: 100, max_discount_amount: 100, min_fare_required: 500, usage_limit_per_user: 2, total_usage_limit: 500, valid_from: '2026-01-01', valid_until: '2026-09-30', is_active: true },
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
    this.inputCode.set('');
    this.inputDescription.set('');
    this.inputDiscountType.set('percent');
    this.inputDiscountValue.set(20);
    this.inputMaxDiscountAmount.set(100);
    this.inputMinFareRequired.set(200);
    this.inputUsageLimitPerUser.set(1);
    this.inputTotalUsageLimit.set(500);
    this.inputValidFrom.set(new Date().toISOString().slice(0, 10));
    this.inputValidUntil.set('2026-12-31');
    this.inputIsActive.set(true);
    this.showAddForm.set(true);
  }

  startEdit(row: PromoCodeItem) {
    this.editingId.set(row.id || null);
    this.inputCode.set(row.code);
    this.inputDescription.set(row.description);
    this.inputDiscountType.set(row.discount_type);
    this.inputDiscountValue.set(row.discount_value);
    this.inputMaxDiscountAmount.set(row.max_discount_amount);
    this.inputMinFareRequired.set(row.min_fare_required);
    this.inputUsageLimitPerUser.set(row.usage_limit_per_user);
    this.inputTotalUsageLimit.set(row.total_usage_limit);
    this.inputValidFrom.set(row.valid_from);
    this.inputValidUntil.set(row.valid_until);
    this.inputIsActive.set(row.is_active);
    this.showAddForm.set(true);
  }

  cancelEdit() {
    this.showAddForm.set(false);
    this.editingId.set(null);
  }

  saveOption() {
    const code = this.inputCode().trim();
    if (!code) {
      alert('Promo Code is required.');
      return;
    }
    const id = this.editingId();
    const record: PromoCodeItem = {
      id: id === 'new' ? 'pc-' + Date.now() : id!,
      code,
      description: this.inputDescription().trim(),
      discount_type: this.inputDiscountType(),
      discount_value: Number(this.inputDiscountValue()),
      max_discount_amount: Number(this.inputMaxDiscountAmount()),
      min_fare_required: Number(this.inputMinFareRequired()),
      usage_limit_per_user: Number(this.inputUsageLimitPerUser()),
      total_usage_limit: Number(this.inputTotalUsageLimit()),
      valid_from: this.inputValidFrom(),
      valid_until: this.inputValidUntil(),
      is_active: Boolean(this.inputIsActive()),
    };

    if (id === 'new') this.promoList.update(list => [...list, record]);
    else this.promoList.update(list => list.map(item => item.id === id ? record : item));

    this.cancelEdit();
  }

  deleteOption(row: PromoCodeItem) {
    if (confirm(`Delete promo code "${row.code}"?`)) {
      this.promoList.update(list => list.filter(item => item.id !== row.id));
    }
  }
}
