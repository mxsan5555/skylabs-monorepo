import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed, inject, OnInit } from '@angular/core';
import { AdminPage } from '../../../../admin/admin-page/admin-page';
import { VehicleTypesApiService, type VehicleType } from '../../../../core/masters/vehicle-types-api.service';

@Component({
  selector: 'md-vehicle-types-master',
  standalone: true,
  imports: [AdminPage],
  templateUrl: './vehicle-types.html',
  styleUrl: '../masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class VehicleTypesMaster implements OnInit {
  private readonly api = inject(VehicleTypesApiService);

  readonly options = signal<VehicleType[]>([]);
  readonly loading = signal<boolean>(false);

  readonly showAddForm = signal<boolean>(false);
  readonly editingId = signal<string | 'new' | null>(null);

  // Form Fields
  readonly inputName = signal<string>('');
  readonly inputCode = signal<string>('');
  readonly inputDescription = signal<string>('');
  readonly inputStatus = signal<'Active' | 'Inactive'>('Active');

  // --- Showcase Datatable Configuration ---
  readonly tableColumns = JSON.stringify([
    { key: 'name', label: 'Vehicle Type Name', sortable: true },
    { key: 'code', label: 'Short Code', sortable: true },
    { key: 'description', label: 'Description', sortable: true },
    { key: 'status', label: 'Status', type: 'status', statusMap: { 'Active': 'success', 'Inactive': 'error' } }
  ]);

  readonly tableActions = JSON.stringify([
    { icon: 'edit', label: 'Edit', event: 'edit_option' },
    { icon: 'delete', label: 'Delete', event: 'delete_option', variant: 'danger' }
  ]);

  readonly tableRowsString = computed(() => JSON.stringify(this.options()));

  ngOnInit(): void {
    this.reload();
  }

  private reload(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: (data) => {
        this.options.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load vehicle types', err);
        this.loading.set(false);
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

  startAdd(): void {
    this.editingId.set('new');
    this.inputName.set('');
    this.inputCode.set('');
    this.inputDescription.set('');
    this.inputStatus.set('Active');
    this.showAddForm.set(true);
  }

  startEdit(option: VehicleType): void {
    this.editingId.set(option.vehicle_type_uid);
    this.inputName.set(option.name);
    this.inputCode.set(option.code);
    this.inputDescription.set(option.description || '');
    this.inputStatus.set(option.status);
    this.showAddForm.set(true);
  }

  saveOption(): void {
    const name = this.inputName().trim();
    const code = this.inputCode().trim().toUpperCase();

    if (!name) {
      alert('Vehicle Type Name is required.');
      return;
    }
    if (!code) {
      alert('Short Code is required.');
      return;
    }

    const payload = {
      name,
      code,
      description: this.inputDescription(),
      status: this.inputStatus()
    };

    const id = this.editingId();
    const request = id === 'new' || id === null ? this.api.create(payload) : this.api.update(id, payload);
    request.subscribe({
      next: () => {
        this.reload();
        this.cancelEdit();
      },
      error: (err) => {
        console.error('Failed to save vehicle type', err);
        alert('Failed to save vehicle type. Please try again.');
      }
    });
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.inputName.set('');
    this.inputCode.set('');
    this.inputDescription.set('');
    this.inputStatus.set('Active');
    this.showAddForm.set(false);
  }

  deleteOption(option: VehicleType): void {
    if (confirm(`Are you sure you want to delete "${option.name}"?`)) {
      this.api.delete(option.vehicle_type_uid).subscribe({
        next: () => this.reload(),
        error: (err) => {
          console.error('Failed to delete vehicle type', err);
          alert('Failed to delete vehicle type. Please try again.');
        }
      });
    }
  }
}
