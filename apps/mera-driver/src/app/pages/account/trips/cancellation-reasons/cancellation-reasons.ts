import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AdminPage } from '../../../../admin/admin-page/admin-page';

interface CancellationReason {
  id?: string;
  reason_text: string;
  applies_to: 'customer' | 'driver' | 'both';
  is_active: boolean;
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
  readonly editingId = signal<string | 'new' | null>(null);
  readonly inputReason = signal('');
  readonly inputAppliesTo = signal<'customer' | 'driver' | 'both'>('customer');
  readonly inputIsActive = signal(true);

  readonly tableColumns = JSON.stringify([
    { key: 'reason_text', label: 'Reason', sortable: true },
    { key: 'applies_to', label: 'Applies To', sortable: true },
    { key: 'status_label', label: 'Status', type: 'status', statusMap: { Active: 'success', Inactive: 'error' } },
  ]);
  readonly tableActions = JSON.stringify([
    { icon: 'edit', label: 'Edit', event: 'edit_option' },
    { icon: 'delete', label: 'Delete', event: 'delete_option', variant: 'danger' },
  ]);
  readonly tableRowsString = computed(() =>
    JSON.stringify(this.list().map((r) => ({ ...r, status_label: r.is_active ? 'Active' : 'Inactive' })))
  );

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
    this.inputReason.set('');
    this.inputAppliesTo.set('customer');
    this.inputIsActive.set(true);
    this.showAddForm.set(true);
  }

  startEdit(row: CancellationReason): void {
    this.editingId.set(row.id || null);
    this.inputReason.set(row.reason_text);
    this.inputAppliesTo.set(row.applies_to);
    this.inputIsActive.set(row.is_active);
    this.showAddForm.set(true);
  }

  saveOption(): void {
    if (!this.inputReason().trim()) {
      alert('Reason is required.');
      return;
    }
    const id = this.editingId();
    const record: CancellationReason = {
      id: id === 'new' ? 'cr-' + Date.now() : id!,
      reason_text: this.inputReason().trim(),
      applies_to: this.inputAppliesTo(),
      is_active: this.inputIsActive(),
    };
    if (id === 'new') this.list.update((l) => [...l, record]);
    else this.list.update((l) => l.map((x) => (x.id === id ? record : x)));
    this.cancelEdit();
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.showAddForm.set(false);
  }

  deleteOption(row: CancellationReason): void {
    if (confirm('Delete this cancellation reason?')) {
      this.list.update((l) => l.filter((x) => x.id !== row.id));
    }
  }
}
