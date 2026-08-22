import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AdminPage } from '../../../../admin/admin-page/admin-page';

interface DriverLocation {
  id?: number | string;
  driver_name: string;
  phone: string;
  vehicle: string;
  city: string;
  latitude: number;
  longitude: number;
  status: string;
  recorded_at: string;
}

@Component({
  selector: 'md-driver-locations',
  standalone: true,
  imports: [AdminPage],
  templateUrl: './driver-locations.html',
  styleUrl: '../../masters/masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DriverLocations implements OnInit {
  private readonly http = inject(HttpClient);
  readonly list = signal<DriverLocation[]>([]);
  readonly showAddForm = signal(false);
  readonly editingId = signal<number | string | 'new' | null>(null);

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
    this.http.get<DriverLocation[]>('data/driver_locations.json').subscribe({
      next: (data) => this.list.set(data || []),
      error: (err) => console.error('Failed to load driver locations', err),
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
    const id = this.editingId();
    const record: DriverLocation = {
      id: id === 'new' ? Date.now() : id!,
      driver_name: driver,
      phone: this.inputPhone().trim() || '—',
      vehicle: this.inputVehicle().trim() || '—',
      city: this.inputCity().trim() || '—',
      latitude: +this.inputLat() || 0,
      longitude: +this.inputLng() || 0,
      status: this.inputStatus(),
      recorded_at: this.inputRecordedAt() || 'Just now',
    };

    if (id === 'new') {
      this.list.update((l) => [record, ...l]);
    } else {
      this.list.update((l) => l.map((x) => (x.id === id ? record : x)));
    }
    this.cancelEdit();
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.showAddForm.set(false);
  }

  deleteOption(row: DriverLocation): void {
    if (confirm(`Delete location tracking for "${row.driver_name}"?`)) {
      this.list.update((l) => l.filter((x) => x.id !== row.id));
    }
  }
}
