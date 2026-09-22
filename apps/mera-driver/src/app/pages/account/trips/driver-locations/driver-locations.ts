import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed, inject, OnInit } from '@angular/core';
import { AdminPage } from '../../../../admin/admin-page/admin-page';
import { DriverLocationsApiService, type DriverLocation } from '../../../../core/trips/driver-locations-api.service';

@Component({
  selector: 'md-driver-locations',
  standalone: true,
  imports: [AdminPage],
  templateUrl: './driver-locations.html',
  styleUrl: '../../masters/masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DriverLocations implements OnInit {
  private readonly api = inject(DriverLocationsApiService);
  readonly list = signal<DriverLocation[]>([]);
  readonly loading = signal(false);
  readonly showAddForm = signal(false);
  readonly editingId = signal<string | 'new' | null>(null);

  // --- Form Input Signals ---
  readonly inputDriver = signal('');
  readonly inputPhone = signal('');
  readonly inputVehicle = signal('');
  readonly inputCity = signal('');
  readonly inputLat = signal('');
  readonly inputLng = signal('');
  readonly inputStatus = signal('Online');
  readonly inputRecordedAt = signal('');

  readonly tableColumns = JSON.stringify([
    { key: 'driver_name', label: 'Driver Name', sortable: true },
    { key: 'phone', label: 'Phone Number', sortable: true },
    { key: 'vehicle', label: 'Vehicle Assigned', sortable: true },
    { key: 'city', label: 'City / Region', sortable: true },
    { key: 'latitude', label: 'Latitude', sortable: true },
    { key: 'longitude', label: 'Longitude', sortable: true },
    { key: 'recorded_at', label: 'Recorded At', sortable: true },
    { key: 'status', label: 'Status', type: 'status', statusMap: { Online: 'success', 'On Trip': 'info', Offline: 'error' } },
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
        console.error('Failed to load driver locations', err);
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
    this.inputDriver.set('');
    this.inputPhone.set('');
    this.inputVehicle.set('Personal Sedan');
    this.inputCity.set('New Delhi');
    this.inputLat.set('28.6304');
    this.inputLng.set('77.2177');
    this.inputStatus.set('Online');
    this.inputRecordedAt.set(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    this.showAddForm.set(true);
  }

  startEdit(row: DriverLocation): void {
    this.editingId.set(row.id || null);
    this.inputDriver.set(row.driver_name || '');
    this.inputPhone.set(row.phone || '');
    this.inputVehicle.set(row.vehicle || '');
    this.inputCity.set(row.city || '');
    this.inputLat.set(row.latitude !== undefined ? String(row.latitude) : '');
    this.inputLng.set(row.longitude !== undefined ? String(row.longitude) : '');
    this.inputStatus.set(row.status || 'Online');
    this.inputRecordedAt.set(row.recorded_at || '');
    this.showAddForm.set(true);
  }

  saveOption(): void {
    const driver = this.inputDriver().trim();
    if (!driver) {
      alert('Driver name is required.');
      return;
    }
    const payload: DriverLocation = {
      driver_name: driver,
      phone: this.inputPhone().trim() || '—',
      vehicle: this.inputVehicle().trim() || '—',
      city: this.inputCity().trim() || '—',
      latitude: +this.inputLat() || 0,
      longitude: +this.inputLng() || 0,
      status: this.inputStatus(),
      recorded_at: this.inputRecordedAt() || 'Just now',
    };

    const id = this.editingId();
    const request = id === 'new' || id === null ? this.api.create(payload) : this.api.update(id, payload);
    request.subscribe({
      next: () => {
        this.reload();
        this.cancelEdit();
      },
      error: (err) => {
        console.error('Failed to save driver location', err);
        alert('Failed to save driver location. Please try again.');
      },
    });
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.showAddForm.set(false);
  }

  deleteOption(row: DriverLocation): void {
    if (confirm(`Delete location tracking for "${row.driver_name}"?`) && row.id) {
      this.api.delete(row.id).subscribe({
        next: () => this.reload(),
        error: (err) => {
          console.error('Failed to delete driver location', err);
          alert('Failed to delete driver location. Please try again.');
        },
      });
    }
  }
}
