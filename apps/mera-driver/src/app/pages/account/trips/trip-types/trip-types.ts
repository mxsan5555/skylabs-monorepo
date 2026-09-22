import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed, inject, OnInit } from '@angular/core';
import { AdminPage } from '../../../../admin/admin-page/admin-page';
import { TripTypesApiService, type TripType } from '../../../../core/trips/trip-types-api.service';

@Component({
  selector: 'md-trip-types',
  standalone: true,
  imports: [AdminPage],
  templateUrl: './trip-types.html',
  styleUrl: '../../masters/masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TripTypes implements OnInit {
  private readonly api = inject(TripTypesApiService);
  readonly list = signal<TripType[]>([]);
  readonly loading = signal(false);
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
        console.error('Failed to load trip types', err);
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
    const payload: TripType = {
      name: this.inputName().trim(),
      description: this.inputDescription().trim(),
      is_active: this.inputIsActive(),
    };
    const id = this.editingId();
    const request = id === 'new' || id === null ? this.api.create(payload) : this.api.update(id, payload);
    request.subscribe({
      next: () => {
        this.reload();
        this.cancelEdit();
      },
      error: (err) => {
        console.error('Failed to save trip type', err);
        alert('Failed to save trip type. Please try again.');
      },
    });
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.showAddForm.set(false);
  }

  deleteOption(row: TripType): void {
    if (confirm(`Delete trip type "${row.name}"?`) && row.id) {
      this.api.delete(row.id).subscribe({
        next: () => this.reload(),
        error: (err) => {
          console.error('Failed to delete trip type', err);
          alert('Failed to delete trip type. Please try again.');
        },
      });
    }
  }
}
