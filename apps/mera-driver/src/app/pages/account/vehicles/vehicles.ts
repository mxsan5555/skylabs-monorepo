import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, inject, OnInit, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AdminPage } from '../../../admin/admin-page/admin-page';

interface Vehicle {
  id?: number;
  vehicle_uid: string;
  customer_id: number;
  vehicle_number: string;
  vehicle_type_id: number;
  vehicle_type_name?: string;
  make?: string;
  model?: string;
  variant?: string;
  manufacturing_year?: string;
  fuel_type?: string;
  transmission?: string;
  color?: string;
  rc_number?: string;
  rc_expiry_date?: string;
  insurance_number?: string;
  insurance_expiry_date?: string;
  status: string;
  notes?: string;
}

@Component({
  selector: 'md-account-vehicles',
  standalone: true,
  imports: [AdminPage],
  templateUrl: './vehicles.html',
  styleUrl: './vehicles.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class Vehicles implements OnInit {
  private readonly http = inject(HttpClient);

  // --- All Vehicles Repository ---
  readonly allVehicles = signal<Vehicle[]>([]);

  // --- Search, Filter, Sort & Pagination Signals ---
  readonly searchQuery = signal<string>('');
  readonly statusFilter = signal<string>('all');
  readonly sortKey = signal<string>('vehicle_number');
  readonly sortDir = signal<'asc' | 'desc' | ''>('asc');
  readonly page = signal<number>(1);
  readonly pageSize = signal<number>(10);

  // --- View Switcher (Page vs Form) ---
  readonly showAddForm = signal<boolean>(false);
  readonly editingVehicleId = signal<number | null>(null);

  // --- Form Input Signals ---
  readonly inputVehicleUid = signal<string>('');
  readonly inputCustomerId = signal<string>('');
  readonly inputVehicleNumber = signal<string>('');
  readonly inputVehicleTypeId = signal<string>('1');
  readonly inputMake = signal<string>('');
  readonly inputModel = signal<string>('');
  readonly inputVariant = signal<string>('');
  readonly inputManufacturingYear = signal<string>('');
  readonly inputFuelType = signal<string>('Petrol');
  readonly inputTransmission = signal<string>('Automatic');
  readonly inputColor = signal<string>('');
  readonly inputRcNumber = signal<string>('');
  readonly inputRcExpiryDate = signal<string>('');
  readonly inputInsuranceNumber = signal<string>('');
  readonly inputInsuranceExpiryDate = signal<string>('');
  readonly inputStatus = signal<string>('Active');
  readonly inputNotes = signal<string>('');

  protected readonly content = signal({
    title: 'Vehicle Registry',
    subtitle: 'Manage and view vehicles in the fleet.',
    cardTitle: 'Add New Vehicle',
    btnRegister: 'Save Vehicle',
    errorEmptyFields: 'Vehicle UID, Customer ID, Vehicle Number, and Vehicle Type are required.'
  });

  // --- Table Configuration JSON Strings ---
  readonly tableColumns = JSON.stringify([
    { key: 'vehicle_uid', label: 'Vehicle UID', sortable: true },
    { key: 'vehicle_number', label: 'Vehicle Number', sortable: true },
    { key: 'customer_id', label: 'Customer ID', sortable: true },
    { key: 'make', label: 'Make', sortable: true },
    { key: 'model', label: 'Model', sortable: true },
    { key: 'vehicle_type_name', label: 'Type', sortable: true },
    { key: 'status', label: 'Status', type: 'status', statusMap: { 
        'Active': 'success', 
        'Inactive': 'warning', 
        'Maintenance': 'error'
      } 
    },
    { key: 'variant', label: 'Variant', sortable: true, hidden: true },
    { key: 'manufacturing_year', label: 'Mfg Year', sortable: true, hidden: true },
    { key: 'fuel_type', label: 'Fuel Type', sortable: true, hidden: true },
    { key: 'transmission', label: 'Transmission', sortable: true, hidden: true },
    { key: 'color', label: 'Color', sortable: true, hidden: true },
    { key: 'rc_number', label: 'RC Number', sortable: true, hidden: true },
    { key: 'rc_expiry_date', label: 'RC Expiry', sortable: true, hidden: true },
    { key: 'insurance_number', label: 'Insurance No', sortable: true, hidden: true },
    { key: 'insurance_expiry_date', label: 'Insurance Expiry', sortable: true, hidden: true },
    { key: 'notes', label: 'Notes', sortable: false, hidden: true }
  ]);

  readonly tableFilterOptions = JSON.stringify([
    { value: 'all', label: 'All Statuses' },
    { value: 'Active', label: 'Active' },
    { value: 'Inactive', label: 'Inactive' },
    { value: 'Maintenance', label: 'Maintenance' }
  ]);

  readonly tableActions = JSON.stringify([
    { icon: 'visibility', label: 'View Details', event: '__view_detail__' },
    { icon: 'edit', label: 'Edit', event: 'edit_vehicle' },
    { icon: 'delete', label: 'Delete', event: 'delete_vehicle', variant: 'danger' }
  ]);

  // --- Processed and Filtered Dataset ---
  readonly processedVehicles = computed(() => {
    let list = this.allVehicles().map(v => {
      const typeMap: Record<number, string> = {
        1: 'Sedan',
        2: 'SUV',
        3: 'Hatchback',
        4: 'EV'
      };
      return {
        vehicle_type_name: typeMap[v.vehicle_type_id] || 'Sedan',
        ...v
      };
    });

    // 1. Search Query Filter
    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      list = list.filter(v =>
        v.vehicle_uid.toLowerCase().includes(query) ||
        v.vehicle_number.toLowerCase().includes(query) ||
        String(v.customer_id).includes(query) ||
        (v.make && v.make.toLowerCase().includes(query)) ||
        (v.model && v.model.toLowerCase().includes(query))
      );
    }

    // 2. Dropdown Status Filter
    const filter = this.statusFilter();
    if (filter !== 'all') {
      list = list.filter(v => v.status === filter);
    }

    // 3. Columns Sort
    const key = this.sortKey();
    const dir = this.sortDir();
    if (key && dir) {
      list = [...list].sort((a: any, b: any) => {
        const valA = String(a[key] ?? '').toLowerCase();
        const valB = String(b[key] ?? '').toLowerCase();
        return dir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      });
    }

    return list;
  });

  // --- Paginated Rows ---
  readonly tableRowsString = computed(() => {
    const list = this.processedVehicles();
    const start = (this.page() - 1) * this.pageSize();
    const paginated = list.slice(start, start + this.pageSize());
    return JSON.stringify(paginated);
  });

  readonly totalVehicles = computed(() => this.processedVehicles().length);

  ngOnInit(): void {
    // Load static data from the JSON file inside public/data directory
    this.http.get<Vehicle[]>('data/vehicles.json').subscribe({
      next: (data) => {
        this.allVehicles.set(data || []);
      },
      error: (err) => {
        console.error('Failed to load mock vehicles JSON', err);
      }
    });
  }

  // --- Add/Edit Vehicle Action ---
  addVehicle(): void {
    const vehicle_uid = this.inputVehicleUid().trim();
    const customer_id = Number(this.inputCustomerId().trim());
    const vehicle_number = this.inputVehicleNumber().trim();
    const vehicle_type_id = Number(this.inputVehicleTypeId());

    if (!vehicle_uid || isNaN(customer_id) || !vehicle_number || isNaN(vehicle_type_id)) {
      alert(this.content().errorEmptyFields);
      return;
    }

    const newVehicle: Vehicle = {
      id: this.editingVehicleId() || Date.now(),
      vehicle_uid,
      customer_id,
      vehicle_number,
      vehicle_type_id,
      make: this.inputMake().trim() || undefined,
      model: this.inputModel().trim() || undefined,
      variant: this.inputVariant().trim() || undefined,
      manufacturing_year: this.inputManufacturingYear().trim() || undefined,
      fuel_type: this.inputFuelType() || undefined,
      transmission: this.inputTransmission() || undefined,
      color: this.inputColor().trim() || undefined,
      rc_number: this.inputRcNumber().trim() || undefined,
      rc_expiry_date: this.inputRcExpiryDate() || undefined,
      insurance_number: this.inputInsuranceNumber().trim() || undefined,
      insurance_expiry_date: this.inputInsuranceExpiryDate() || undefined,
      status: this.inputStatus(),
      notes: this.inputNotes().trim() || undefined
    };

    const editingId = this.editingVehicleId();
    if (editingId !== null) {
      this.allVehicles.update(list => list.map(v => v.id === editingId ? newVehicle : v));
    } else {
      this.allVehicles.update(list => [newVehicle, ...list]);
    }

    this.resetForm();
    this.showAddForm.set(false);
  }

  resetForm(): void {
    this.editingVehicleId.set(null);
    this.inputVehicleUid.set('');
    this.inputCustomerId.set('');
    this.inputVehicleNumber.set('');
    this.inputVehicleTypeId.set('1');
    this.inputMake.set('');
    this.inputModel.set('');
    this.inputVariant.set('');
    this.inputManufacturingYear.set('');
    this.inputFuelType.set('Petrol');
    this.inputTransmission.set('Automatic');
    this.inputColor.set('');
    this.inputRcNumber.set('');
    this.inputRcExpiryDate.set('');
    this.inputInsuranceNumber.set('');
    this.inputInsuranceExpiryDate.set('');
    this.inputStatus.set('Active');
    this.inputNotes.set('');
  }

  // --- DataTable Event Observers ---
  onParamsChange(event: Event): void {
    const detail = (event as CustomEvent).detail;
    this.page.set(detail.page);
    this.pageSize.set(detail.pageSize);
    this.sortKey.set(detail.sortKey);
    this.sortDir.set(detail.sortDir);
    this.searchQuery.set(detail.search);
    this.statusFilter.set(detail.filter || 'all');
  }

  onRowSelect(event: Event): void {
    const detail = (event as CustomEvent).detail;
    console.log('Selected Vehicles:', detail.selected);
  }

  onRowAction(event: Event): void {
    const detail = (event as CustomEvent).detail;
    const action = detail.action;
    const row = detail.row;

    if (action === 'edit_vehicle') {
      this.editingVehicleId.set(row.id);
      
      this.inputVehicleUid.set(row.vehicle_uid || '');
      this.inputCustomerId.set(String(row.customer_id || ''));
      this.inputVehicleNumber.set(row.vehicle_number || '');
      this.inputVehicleTypeId.set(String(row.vehicle_type_id || '1'));
      this.inputMake.set(row.make || '');
      this.inputModel.set(row.model || '');
      this.inputVariant.set(row.variant || '');
      this.inputManufacturingYear.set(row.manufacturing_year || '');
      this.inputFuelType.set(row.fuel_type || 'Petrol');
      this.inputTransmission.set(row.transmission || 'Automatic');
      this.inputColor.set(row.color || '');
      this.inputRcNumber.set(row.rc_number || '');
      this.inputRcExpiryDate.set(row.rc_expiry_date || '');
      this.inputInsuranceNumber.set(row.insurance_number || '');
      this.inputInsuranceExpiryDate.set(row.insurance_expiry_date || '');
      this.inputStatus.set(row.status || 'Active');
      this.inputNotes.set(row.notes || '');

      this.showAddForm.set(true);
    } else if (action === 'delete_vehicle') {
      if (confirm(`Are you sure you want to delete vehicle "${row.vehicle_number}"?`)) {
        this.allVehicles.update(list => list.filter(v => v.id !== row.id));
      }
    }
  }

  openAddVehicleForm(): void {
    this.showAddForm.set(true);
  }

  closeAddVehicleForm(): void {
    this.showAddForm.set(false);
    this.resetForm();
  }

  onInputChange(field: string, event: Event): void {
    const val = (event.target as any).value || '';
    switch(field) {
      case 'vehicle_uid': this.inputVehicleUid.set(val); break;
      case 'customer_id': this.inputCustomerId.set(val); break;
      case 'vehicle_number': this.inputVehicleNumber.set(val); break;
      case 'vehicle_type_id': this.inputVehicleTypeId.set(val); break;
      case 'make': this.inputMake.set(val); break;
      case 'model': this.inputModel.set(val); break;
      case 'variant': this.inputVariant.set(val); break;
      case 'manufacturing_year': this.inputManufacturingYear.set(val); break;
      case 'fuel_type': this.inputFuelType.set(val); break;
      case 'transmission': this.inputTransmission.set(val); break;
      case 'color': this.inputColor.set(val); break;
      case 'rc_number': this.inputRcNumber.set(val); break;
      case 'rc_expiry_date': this.inputRcExpiryDate.set(val); break;
      case 'insurance_number': this.inputInsuranceNumber.set(val); break;
      case 'insurance_expiry_date': this.inputInsuranceExpiryDate.set(val); break;
      case 'status': this.inputStatus.set(val); break;
      case 'notes': this.inputNotes.set(val); break;
    }
  }
}
