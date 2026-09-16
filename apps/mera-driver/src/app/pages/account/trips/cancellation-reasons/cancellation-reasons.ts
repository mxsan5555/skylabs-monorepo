import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed, inject, OnInit } from '@angular/core';
import { AdminPage } from '../../../../admin/admin-page/admin-page';
import { CancellationReasonsApiService, type CancellationReason } from '../../../../core/trips/cancellation-reasons-api.service';

@Component({
  selector: 'md-cancellation-reasons',
  standalone: true,
  imports: [AdminPage],
  templateUrl: './cancellation-reasons.html',
  styleUrl: '../../masters/masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class CancellationReasons implements OnInit {
  private readonly api = inject(CancellationReasonsApiService);
  readonly list = signal<CancellationReason[]>([]);
  readonly loading = signal(false);
  readonly showAddForm = signal(false);
  readonly editingId = signal<string | 'new' | null>(null);

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
    this.reload();
  }

  private reload(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: (data) => {
        this.list.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load cancellation reasons', err);
        this.loading.set(false);
      },
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
    const payload: CancellationReason = {
      code: this.inputCode().trim() || 'CR-00',
      reason_text: reason,
      applies_to: this.inputAppliesTo(),
      penalty_applicable: this.inputPenalty(),
      status: this.inputStatus(),
    };

    const id = this.editingId();
    const request = id === 'new' || id === null ? this.api.create(payload) : this.api.update(id, payload);
    request.subscribe({
      next: () => {
        this.reload();
        this.cancelEdit();
      },
      error: (err) => {
        console.error('Failed to save cancellation reason', err);
        alert('Failed to save cancellation reason. Please try again.');
      },
    });
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.showAddForm.set(false);
  }

  deleteOption(row: CancellationReason): void {
    if (confirm(`Delete cancellation reason "${row.reason_text}"?`) && row.id) {
      this.api.delete(row.id).subscribe({
        next: () => this.reload(),
        error: (err) => {
          console.error('Failed to delete cancellation reason', err);
          alert('Failed to delete cancellation reason. Please try again.');
        },
      });
    }
  }
}
