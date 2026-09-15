import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed, inject, OnInit } from '@angular/core';
import { AdminPage } from '../../../../admin/admin-page/admin-page';
import { ZonesApiService, type ServiceZone } from '../../../../core/masters/zones-api.service';

@Component({
  selector: 'md-zones-master',
  standalone: true,
  imports: [AdminPage],
  templateUrl: './zones.html',
  styleUrl: '../masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class ZonesMaster implements OnInit {
  private readonly api = inject(ZonesApiService);

  readonly options = signal<ServiceZone[]>([]);
  readonly loading = signal<boolean>(false);

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
        console.error('Failed to load service zones', err);
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

    const payload = {
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

    const id = this.editingId();
    const request = id === 'new' || id === null ? this.api.create(payload) : this.api.update(id, payload);
    request.subscribe({
      next: () => {
        this.reload();
        this.cancelEdit();
      },
      error: (err) => {
        console.error('Failed to save service zone', err);
        alert('Failed to save service zone. Please try again.');
      }
    });
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
      this.api.delete(option.zone_uid).subscribe({
        next: () => this.reload(),
        error: (err) => {
          console.error('Failed to delete service zone', err);
          alert('Failed to delete service zone. Please try again.');
        }
      });
    }
  }
}
