import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed } from '@angular/core';
import { AdminPage } from '../../../../admin/admin-page/admin-page';

interface VehicleType {
  vehicle_type_uid: string;
  name: string;
  code: string;
  description: string;
  seating_capacity: number | null;
  luggage_capacity: number | null;
  minimum_fare: number | null;
  status: 'Active' | 'Inactive';
  sort_order: number | null;
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
      seating_capacity: 4,
      luggage_capacity: 2,
      minimum_fare: 150.00,
      status: 'Active',
      sort_order: 1
    },
    {
      vehicle_type_uid: 'vt-2',
      name: 'SUV',
      code: 'SUV',
      description: 'Spacious Sports Utility Vehicle, perfect for family trips.',
      seating_capacity: 6,
      luggage_capacity: 4,
      minimum_fare: 250.00,
      status: 'Active',
      sort_order: 2
    },
    {
      vehicle_type_uid: 'vt-3',
      name: 'Hatchback',
      code: 'HATCHBACK',
      description: 'Compact city hatchback, easy to park and navigate.',
      seating_capacity: 4,
      luggage_capacity: 1,
      minimum_fare: 100.00,
      status: 'Active',
      sort_order: 3
    }
  ]);

  readonly showAddForm = signal<boolean>(false);
  readonly editingId = signal<string | 'new' | null>(null);

  // Form Fields
  readonly inputName = signal<string>('');
  readonly inputCode = signal<string>('');
  readonly inputDescription = signal<string>('');
  readonly inputSeating = signal<number | null>(null);
  readonly inputLuggage = signal<number | null>(null);
  readonly inputMinFare = signal<number | null>(null);
  readonly inputStatus = signal<'Active' | 'Inactive'>('Active');
  readonly inputSortOrder = signal<number | null>(null);

  // --- Showcase Datatable Configuration ---
  readonly tableColumns = JSON.stringify([
    { key: 'name', label: 'Name', sortable: true },
    { key: 'code', label: 'Code', sortable: true },
    { key: 'seating_capacity', label: 'Seats', sortable: true },
    { key: 'luggage_capacity', label: 'Luggage (Bags)', sortable: true },
    { key: 'minimum_fare', label: 'Min Fare (₹)', sortable: true },
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
    this.inputSeating.set(null);
    this.inputLuggage.set(null);
    this.inputMinFare.set(null);
    this.inputStatus.set('Active');
    this.inputSortOrder.set(null);
    this.showAddForm.set(true);
  }

  startEdit(option: VehicleType): void {
    this.editingId.set(option.vehicle_type_uid);
    this.inputName.set(option.name);
    this.inputCode.set(option.code);
    this.inputDescription.set(option.description || '');
    this.inputSeating.set(option.seating_capacity);
    this.inputLuggage.set(option.luggage_capacity);
    this.inputMinFare.set(option.minimum_fare);
    this.inputStatus.set(option.status);
    this.inputSortOrder.set(option.sort_order);
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
        seating_capacity: this.inputSeating(),
        luggage_capacity: this.inputLuggage(),
        minimum_fare: this.inputMinFare(),
        status: this.inputStatus(),
        sort_order: this.inputSortOrder()
      };
      this.options.update(list => [...list, newOption]);
    } else if (id) {
      this.options.update(list => list.map(opt => opt.vehicle_type_uid === id ? {
        ...opt,
        name,
        code,
        description: this.inputDescription(),
        seating_capacity: this.inputSeating(),
        luggage_capacity: this.inputLuggage(),
        minimum_fare: this.inputMinFare(),
        status: this.inputStatus(),
        sort_order: this.inputSortOrder()
      } : opt));
    }

    this.cancelEdit();
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.inputName.set('');
    this.inputCode.set('');
    this.inputDescription.set('');
    this.inputSeating.set(null);
    this.inputLuggage.set(null);
    this.inputMinFare.set(null);
    this.inputStatus.set('Active');
    this.inputSortOrder.set(null);
    this.showAddForm.set(false);
  }

  deleteOption(option: VehicleType): void {
    if (confirm(`Are you sure you want to delete vehicle type "${option.name}"?`)) {
      this.options.update(list => list.filter(opt => opt.vehicle_type_uid !== option.vehicle_type_uid));
    }
  }
}
