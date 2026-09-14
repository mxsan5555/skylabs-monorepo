import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AdminPage } from '../../../../admin/admin-page/admin-page';

interface CancellationReason {
  id?: number | string;
  code: string;
  reason_text: string;
  applies_to: 'Customer' | 'Driver' | 'Both';
  penalty_applicable: 'Yes' | 'No';
  status: 'Active' | 'Inactive';
}

@Component({
  selector: 'md-cancellation-reasons',
  standalone: true,
  imports: [AdminPage],
  templateUrl: './cancellation-reasons.html',
  styleUrl: '../../masters/masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class CancellationReasons implements OnInit {
  private readonly http = inject(HttpClient);
  readonly list = signal<CancellationReason[]>([]);
  readonly showAddForm = signal(false);
  readonly editingId = signal<number | string | 'new' | null>(null);

  // --- Form Input Signals ---
  readonly inputCode = signal('');
  readonly inputReason = signal('');
  readonly inputAppliesTo = signal<'Customer' | 'Driver' | 'Both'>('Customer');
  readonly inputPenalty = signal<'Yes' | 'No'>('No');
  readonly inputStatus = signal<'Active' | 'Inactive'>('Active');

  readonly tableColumns = JSON.stringify([
    { key: 'code', label: 'Code', sortable: true },
    { key: 'reason_text', label: 'Reason Description', sortable: true },
    { key: 'applies_to', label: 'Applies To', sortable: true },
    { key: 'penalty_applicable', label: 'Penalty Applicable', sortable: true },
    { key: 'status', label: 'Status', type: 'status', statusMap: { Active: 'success', Inactive: 'error' } },
  ]);

  readonly tableActions = JSON.stringify([
    { icon: 'edit', label: 'Edit', event: 'edit_option' },
    { icon: 'delete', label: 'Delete', event: 'delete_option', variant: 'danger' },
  ]);

  readonly tableRowsString = computed(() => JSON.stringify(this.list()));

  ngOnInit(): void {
    this.http.get<CancellationReason[]>('data/cancellation_reasons.json').subscribe({
      next: (data) => this.list.set(data || []),
      error: (err) => console.error('Failed to load cancellation reasons', err),
    });
  }

  onRowAction(event: Event): void {
    const detail = (event as CustomEvent).detail;
    if (detail.action === 'edit_option') this.startEdit(detail.row);
    else if (detail.action === 'delete_option') this.deleteOption(detail.row);
  }

  startAdd(): void {
    this.editingId.set('new');
    this.inputCode.set('CR-0' + (this.list().length + 1));
    this.inputReason.set('');
    this.inputAppliesTo.set('Customer');
    this.inputPenalty.set('No');
    this.inputStatus.set('Active');
    this.showAddForm.set(true);
  }

  startEdit(row: CancellationReason): void {
    this.editingId.set(row.id || null);
    this.inputCode.set(row.code || '');
    this.inputReason.set(row.reason_text || '');
    this.inputAppliesTo.set(row.applies_to || 'Customer');
    this.inputPenalty.set(row.penalty_applicable || 'No');
    this.inputStatus.set(row.status || 'Active');
    this.showAddForm.set(true);
  }

  saveOption(): void {
    const reason = this.inputReason().trim();
    if (!reason) {
      alert('Reason description is required.');
      return;
    }
    const id = this.editingId();
    const record: CancellationReason = {
      id: id === 'new' ? Date.now() : id!,
      code: this.inputCode().trim() || 'CR-00',
      reason_text: reason,
      applies_to: this.inputAppliesTo(),
      penalty_applicable: this.inputPenalty(),
      status: this.inputStatus(),
    };

    if (id === 'new') {
      this.list.update((l) => [record, ...l]);
    } else {
      this.list.update((l) => l.map((x) => (x.id === id ? record : x)));
    }
    this.cancelEdit();
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.showAddForm.set(false);
  }

  deleteOption(row: CancellationReason): void {
    if (confirm(`Delete cancellation reason "${row.reason_text}"?`)) {
      this.list.update((l) => l.filter((x) => x.id !== row.id));
    }
  }
}
