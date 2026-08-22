import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed } from '@angular/core';
import { AdminPage } from '../../../../admin/admin-page/admin-page';

interface ServiceZone {
  zone_uid: string;
  zone_name: string;
  zone_code: string;
  state_id: number | null;
  city_id: number | null;
  area_name: string;
  pincode: string;
  zone_type: 'City' | 'Area' | 'Pincode' | 'Custom';
  latitude: number | null;
  longitude: number | null;
  radius_km: number | null;
  boundary_data: string; // stored as string JSON for simple form editing
  status: 'Active' | 'Inactive';
  notes: string;
}

@Component({
  selector: 'md-zones-master',
  standalone: true,
  imports: [AdminPage],
  templateUrl: './zones.html',
  styleUrl: '../masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class ZonesMaster {
  readonly options = signal<ServiceZone[]>([
    {
      zone_uid: 'zone-1',
      zone_name: 'Mumbai Downtown',
      zone_code: 'MUM_DOWN',
      state_id: 27,
      city_id: 1,
      area_name: 'Colaba, Fort, Nariman Point',
      pincode: '400001',
      zone_type: 'Area',
      latitude: 18.9268,
      longitude: 72.8303,
      radius_km: 5.0,
      boundary_data: '{"type":"Circle","radius":5000}',
      status: 'Active',
      notes: 'South Mumbai high demand business area.'
    },
    {
      zone_uid: 'zone-2',
      zone_name: 'Delhi NCR',
      zone_code: 'DELHI_NCR',
      state_id: 7,
      city_id: 2,
      area_name: 'Delhi National Capital Region',
      pincode: '',
      zone_type: 'City',
      latitude: 28.6139,
      longitude: 77.2090,
      radius_km: 25.0,
      boundary_data: '',
      status: 'Active',
      notes: 'Covers Delhi, Gurugram, and Noida.'
    },
    {
      zone_uid: 'zone-3',
      zone_name: 'Bengaluru Tech Corridor',
      zone_code: 'BLR_TECH',
      state_id: 29,
      city_id: 3,
      area_name: 'Whitefield, Outer Ring Road',
      pincode: '560066',
      zone_type: 'Area',
      latitude: 12.9698,
      longitude: 77.7499,
      radius_km: 8.5,
      boundary_data: '',
      status: 'Active',
      notes: 'IT parks and residential high-density zone.'
    }
  ]);

  readonly showAddForm = signal<boolean>(false);
  readonly editingId = signal<string | 'new' | null>(null);

  // Form Fields
  readonly inputZoneName = signal<string>('');
  readonly inputZoneCode = signal<string>('');
  readonly inputStateId = signal<number | null>(null);
  readonly inputCityId = signal<number | null>(null);
  readonly inputAreaName = signal<string>('');
  readonly inputPincode = signal<string>('');
  readonly inputZoneType = signal<'City' | 'Area' | 'Pincode' | 'Custom'>('City');
  readonly inputLatitude = signal<number | null>(null);
  readonly inputLongitude = signal<number | null>(null);
  readonly inputRadiusKm = signal<number | null>(null);
  readonly inputBoundaryData = signal<string>('');
  readonly inputStatus = signal<'Active' | 'Inactive'>('Active');
  readonly inputNotes = signal<string>('');

  // --- Showcase Datatable Configuration ---
  readonly tableColumns = JSON.stringify([
    { key: 'zone_name', label: 'Zone Name', sortable: true },
    { key: 'zone_code', label: 'Code', sortable: true },
    { key: 'zone_type', label: 'Type', sortable: true },
    { key: 'pincode', label: 'Pincode', sortable: true },
    { key: 'radius_km', label: 'Radius (km)', sortable: true },
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
    this.inputZoneName.set('');
    this.inputZoneCode.set('');
    this.inputStateId.set(null);
    this.inputCityId.set(null);
    this.inputAreaName.set('');
    this.inputPincode.set('');
    this.inputZoneType.set('City');
    this.inputLatitude.set(null);
    this.inputLongitude.set(null);
    this.inputRadiusKm.set(null);
    this.inputBoundaryData.set('');
    this.inputStatus.set('Active');
    this.inputNotes.set('');
    this.showAddForm.set(true);
  }

  startEdit(option: ServiceZone): void {
    this.editingId.set(option.zone_uid);
    this.inputZoneName.set(option.zone_name);
    this.inputZoneCode.set(option.zone_code);
    this.inputStateId.set(option.state_id);
    this.inputCityId.set(option.city_id);
    this.inputAreaName.set(option.area_name || '');
    this.inputPincode.set(option.pincode || '');
    this.inputZoneType.set(option.zone_type);
    this.inputLatitude.set(option.latitude);
    this.inputLongitude.set(option.longitude);
    this.inputRadiusKm.set(option.radius_km);
    this.inputBoundaryData.set(option.boundary_data || '');
    this.inputStatus.set(option.status);
    this.inputNotes.set(option.notes || '');
    this.showAddForm.set(true);
  }

  saveOption(): void {
    const zoneName = this.inputZoneName().trim();
    const zoneCode = this.inputZoneCode().trim().toUpperCase();

    if (!zoneName) {
      alert('Zone Name is required.');
      return;
    }
    if (!zoneCode) {
      alert('Zone Code is required.');
      return;
    }

    const id = this.editingId();
    if (id === 'new') {
      const newOption: ServiceZone = {
        zone_uid: 'zone-' + Date.now(),
        zone_name: zoneName,
        zone_code: zoneCode,
        state_id: this.inputStateId(),
        city_id: this.inputCityId(),
        area_name: this.inputAreaName(),
        pincode: this.inputPincode(),
        zone_type: this.inputZoneType(),
        latitude: this.inputLatitude(),
        longitude: this.inputLongitude(),
        radius_km: this.inputRadiusKm(),
        boundary_data: this.inputBoundaryData(),
        status: this.inputStatus(),
        notes: this.inputNotes()
      };
      this.options.update(list => [...list, newOption]);
    } else if (id) {
      this.options.update(list => list.map(opt => opt.zone_uid === id ? {
        ...opt,
        zone_name: zoneName,
        zone_code: zoneCode,
        state_id: this.inputStateId(),
        city_id: this.inputCityId(),
        area_name: this.inputAreaName(),
        pincode: this.inputPincode(),
        zone_type: this.inputZoneType(),
        latitude: this.inputLatitude(),
        longitude: this.inputLongitude(),
        radius_km: this.inputRadiusKm(),
        boundary_data: this.inputBoundaryData(),
        status: this.inputStatus(),
        notes: this.inputNotes()
      } : opt));
    }

    this.cancelEdit();
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.inputZoneName.set('');
    this.inputZoneCode.set('');
    this.inputStateId.set(null);
    this.inputCityId.set(null);
    this.inputAreaName.set('');
    this.inputPincode.set('');
    this.inputZoneType.set('City');
    this.inputLatitude.set(null);
    this.inputLongitude.set(null);
    this.inputRadiusKm.set(null);
    this.inputBoundaryData.set('');
    this.inputStatus.set('Active');
    this.inputNotes.set('');
    this.showAddForm.set(false);
  }

  deleteOption(option: ServiceZone): void {
    if (confirm(`Are you sure you want to delete service zone "${option.zone_name}"?`)) {
      this.options.update(list => list.filter(opt => opt.zone_uid !== option.zone_uid));
    }
  }
}
