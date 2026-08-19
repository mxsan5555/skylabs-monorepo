import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed } from '@angular/core';
import { AdminPage } from '../../../../admin/admin-page/admin-page';

interface VehicleType {
  vehicle_type_uid: string;
  name: string;
  code: string;
  description: string;
  status: 'Active' | 'Inactive';
}

@Component({
  selector: 'md-vehicle-types-master',
  standalone: true,
  imports: [AdminPage],
  templateUrl: './vehicle-types.html',
  styleUrl: '../masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class VehicleTypesMaster {
  readonly options = signal<VehicleType[]>([
    {
      vehicle_type_uid: 'vt-1',
      name: 'Sedan',
      code: 'SEDAN',
      description: 'Standard 4-door sedan, comfortable and economical.',
      status: 'Active'
    },
    {
      vehicle_type_uid: 'vt-2',
      name: 'SUV',
      code: 'SUV',
      description: 'Spacious Sports Utility Vehicle, perfect for family trips.',
      status: 'Active'
    },
    {
      vehicle_type_uid: 'vt-3',
      name: 'MUV',
      code: 'MUV',
      description: 'Multi Utility Vehicle for large groups and luggage.',
      status: 'Active'
    },
    {
      vehicle_type_uid: 'vt-4',
      name: 'HUV',
      code: 'HUV',
      description: 'Heavy Utility Vehicle for special transportation needs.',
      status: 'Active'
    },
    {
      vehicle_type_uid: 'vt-5',
      name: 'Hatchback',
      code: 'HATCHBACK',
      description: 'Compact city hatchback, easy to park and navigate.',
      status: 'Active'
    }
  ]);

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

    const id = this.editingId();
    if (id === 'new') {
      const newOption: VehicleType = {
        vehicle_type_uid: 'vt-' + Date.now(),
        name,
        code,
        description: this.inputDescription(),
        status: this.inputStatus()
      };
      this.options.update(list => [...list, newOption]);
    } else if (id) {
      this.options.update(list => list.map(opt => opt.vehicle_type_uid === id ? {
        ...opt,
        name,
        code,
        description: this.inputDescription(),
        status: this.inputStatus()
      } : opt));
    }

    this.cancelEdit();
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
      this.options.update(list => list.filter(opt => opt.vehicle_type_uid !== option.vehicle_type_uid));
    }
  }
}
