import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AdminPage } from '../../../../admin/admin-page/admin-page';

interface TripType {
  id?: string;
  name: string;
  description: string;
  is_active: boolean;
}

@Component({
  selector: 'md-trip-types',
  standalone: true,
  imports: [AdminPage],
  templateUrl: './trip-types.html',
  styleUrl: '../../masters/masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TripTypes implements OnInit {
  private readonly http = inject(HttpClient);
  readonly list = signal<TripType[]>([]);
  readonly showAddForm = signal(false);
  readonly editingId = signal<string | 'new' | null>(null);
  readonly inputName = signal('');
  readonly inputDescription = signal('');
  readonly inputIsActive = signal(true);

  readonly tableColumns = JSON.stringify([
    { key: 'name', label: 'Name', sortable: true },
    { key: 'description', label: 'Description', sortable: false },
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
    this.http.get<TripType[]>('data/trip_types.json').subscribe({
      next: (data) => this.list.set(data || []),
      error: (err) => console.error('Failed to load trip types', err),
    });
  }

  onRowAction(event: Event): void {
    const detail = (event as CustomEvent).detail;
    if (detail.action === 'edit_option') this.startEdit(detail.row);
    else if (detail.action === 'delete_option') this.deleteOption(detail.row);
  }

  startAdd(): void {
    this.editingId.set('new');
    this.inputName.set('');
    this.inputDescription.set('');
    this.inputIsActive.set(true);
    this.showAddForm.set(true);
  }

  startEdit(row: TripType): void {
    this.editingId.set(row.id || null);
    this.inputName.set(row.name);
    this.inputDescription.set(row.description);
    this.inputIsActive.set(row.is_active);
    this.showAddForm.set(true);
  }

  saveOption(): void {
    if (!this.inputName().trim()) {
      alert('Name is required.');
      return;
    }
    const id = this.editingId();
    const record: TripType = {
      id: id === 'new' ? 'tt-' + Date.now() : id!,
      name: this.inputName().trim(),
      description: this.inputDescription().trim(),
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

  deleteOption(row: TripType): void {
    if (confirm(`Delete trip type "${row.name}"?`)) {
      this.list.update((l) => l.filter((x) => x.id !== row.id));
    }
  }
}
