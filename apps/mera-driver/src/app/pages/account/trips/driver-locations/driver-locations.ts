import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AdminPage } from '../../../../admin/admin-page/admin-page';

interface DriverLocation {
  id?: string;
  driver_name: string;
  booking_code: string | null;
  latitude: number;
  longitude: number;
  heading: number;
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
  readonly editingId = signal<string | 'new' | null>(null);
  readonly inputDriver = signal('');
  readonly inputBooking = signal('');
  readonly inputLat = signal('');
  readonly inputLng = signal('');
  readonly inputHeading = signal('');
  readonly inputRecordedAt = signal('');

  readonly tableColumns = JSON.stringify([
    { key: 'driver_name', label: 'Driver', sortable: true },
    { key: 'booking_code', label: 'Booking', sortable: true },
    { key: 'latitude', label: 'Latitude', sortable: true },
    { key: 'longitude', label: 'Longitude', sortable: true },
    { key: 'recorded_at', label: 'Recorded At', sortable: true },
  ]);
  readonly tableActions = JSON.stringify([
    { icon: 'edit', label: 'Edit', event: 'edit_option' },
    { icon: 'delete', label: 'Delete', event: 'delete_option', variant: 'danger' },
  ]);
  readonly tableRowsString = computed(() =>
    JSON.stringify(this.list().map((r) => ({ ...r, booking_code: r.booking_code || '—' })))
  );

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
    this.inputBooking.set('');
    this.inputLat.set('');
    this.inputLng.set('');
    this.inputHeading.set('');
    this.inputRecordedAt.set(new Date().toISOString());
    this.showAddForm.set(true);
  }

  startEdit(row: DriverLocation): void {
    this.editingId.set(row.id || null);
    this.inputDriver.set(row.driver_name);
    this.inputBooking.set(row.booking_code || '');
    this.inputLat.set(String(row.latitude));
    this.inputLng.set(String(row.longitude));
    this.inputHeading.set(String(row.heading));
    this.inputRecordedAt.set(row.recorded_at);
    this.showAddForm.set(true);
  }

  saveOption(): void {
    if (!this.inputDriver().trim()) {
      alert('Driver name is required.');
      return;
    }
    const id = this.editingId();
    const record: DriverLocation = {
      id: id === 'new' ? 'dl-' + Date.now() : id!,
      driver_name: this.inputDriver().trim(),
      booking_code: this.inputBooking().trim() || null,
      latitude: +this.inputLat() || 0,
      longitude: +this.inputLng() || 0,
      heading: +this.inputHeading() || 0,
      recorded_at: this.inputRecordedAt(),
    };
    if (id === 'new') this.list.update((l) => [...l, record]);
    else this.list.update((l) => l.map((x) => (x.id === id ? record : x)));
    this.cancelEdit();
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.showAddForm.set(false);
  }

  deleteOption(row: DriverLocation): void {
    if (confirm('Delete this location record?')) {
      this.list.update((l) => l.filter((x) => x.id !== row.id));
    }
  }
}
