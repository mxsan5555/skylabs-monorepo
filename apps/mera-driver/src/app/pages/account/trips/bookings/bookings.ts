import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AdminPage } from '../../../../admin/admin-page/admin-page';

interface Booking {
  id?: string;
  booking_code: string;
  customer_name: string;
  driver_name: string;
  vehicle_name: string;
  vehicle_category: string;
  trip_type_name: string;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  drop_address: string;
  drop_lat: number;
  drop_lng: number;
  scheduled_at: string;
  estimated_distance_km: number;
  estimated_duration_min: number;
  estimated_fare: number;
  final_fare: number;
  status: string;
  payment_status: string;
  payment_mode: string;
  otp: string;
  requested_at: string;
  accepted_at: string;
  started_at: string;
  completed_at: string;
}

@Component({
  selector: 'md-bookings',
  standalone: true,
  imports: [AdminPage],
  templateUrl: './bookings.html',
  styleUrl: '../../masters/masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Bookings implements OnInit {
  private readonly http = inject(HttpClient);
  readonly list = signal<Booking[]>([]);
  readonly showAddForm = signal(false);
  readonly editingId = signal<string | 'new' | null>(null);

  // Form Signals according to Schema
  readonly inputCode = signal('');
  readonly inputCustomer = signal('');
  readonly inputDriver = signal('');
  readonly inputVehicle = signal('');
  readonly inputVehicleCategory = signal('Sedan');
  readonly inputTripType = signal('One Way');
  readonly inputPickup = signal('');
  readonly inputPickupLat = signal(28.6139);
  readonly inputPickupLng = signal(77.2090);
  readonly inputDrop = signal('');
  readonly inputDropLat = signal(28.5355);
  readonly inputDropLng = signal(77.3910);
  readonly inputScheduledAt = signal('');
  readonly inputEstDistance = signal(10);
  readonly inputEstDuration = signal(30);
  readonly inputEstFare = signal(250);
  readonly inputFinalFare = signal(250);
  readonly inputStatus = signal('requested');
  readonly inputPaymentStatus = signal('pending');
  readonly inputPaymentMode = signal('cash');
  readonly inputOtp = signal('1234');
  readonly inputRequestedAt = signal('');
  readonly inputAcceptedAt = signal('');
  readonly inputStartedAt = signal('');
  readonly inputCompletedAt = signal('');

  // Master Dropdown Options
  readonly vehicleCategories = signal<string[]>(['Sedan', 'Hatchback', 'SUV', 'Luxury', 'Auto', 'Bike']);
  readonly tripTypeOptions = signal<string[]>(['One Way', 'Round Trip', 'Local (Hourly)', 'Outstation', 'Airport', 'Rental']);
  readonly statusOptions = signal<string[]>(['requested', 'accepted', 'driver_arrived', 'ongoing', 'completed', 'cancelled']);
  readonly paymentStatusOptions = signal<string[]>(['pending', 'paid', 'refunded', 'failed']);
  readonly paymentModeOptions = signal<string[]>(['cash', 'upi', 'card', 'wallet']);

  readonly tableColumns = JSON.stringify([
    { key: 'booking_code', label: 'Code', sortable: true },
    { key: 'customer_name', label: 'Customer', sortable: true },
    { key: 'driver_name', label: 'Driver', sortable: true },
    { key: 'trip_type_name', label: 'Trip Type', sortable: true },
    { key: 'pickup_address', label: 'Pickup', sortable: false },
    { key: 'drop_address', label: 'Drop', sortable: false },
    { key: 'status', label: 'Status', type: 'status', statusMap: { completed: 'success', ongoing: 'info', driver_arrived: 'info', accepted: 'info', requested: 'warning', cancelled: 'error' } },
    { key: 'payment_status', label: 'Payment', sortable: true },
    { key: 'final_fare', label: 'Fare (₹)', sortable: true },
  ]);
  readonly tableActions = JSON.stringify([
    { icon: 'edit', label: 'Edit', event: 'edit_option' },
    { icon: 'delete', label: 'Delete', event: 'delete_option', variant: 'danger' },
  ]);
  readonly tableRowsString = computed(() => JSON.stringify(this.list()));

  ngOnInit(): void {
    this.http.get<Booking[]>('data/bookings.json').subscribe({
      next: (data) => {
        if (data) {
          const mapped = data.map((item: any) => ({
            id: String(item.id || 'bk-' + Math.random()),
            booking_code: item.booking_code || 'BK-100' + item.id,
            customer_name: item.customer_name || 'Rohan Sharma',
            driver_name: item.driver_name || 'Rahul Verma',
            vehicle_name: item.vehicle_name || 'Hyundai Accent',
            vehicle_category: item.vehicle_category || 'Sedan',
            trip_type_name: item.trip_type || item.trip_type_name || 'One Way',
            pickup_address: item.pickup_address || 'Connaught Place, New Delhi',
            pickup_lat: item.pickup_lat || 28.6304,
            pickup_lng: item.pickup_lng || 77.2177,
            drop_address: item.drop_address || 'Sector 18, Noida',
            drop_lat: item.drop_lat || 28.5708,
            drop_lng: item.drop_lng || 77.3258,
            scheduled_at: item.scheduled_at || '2026-08-19 10:00',
            estimated_distance_km: item.estimated_distance_km || 15.5,
            estimated_duration_min: item.estimated_duration_min || 35,
            estimated_fare: item.estimated_fare || item.fare || 500,
            final_fare: item.final_fare || item.fare || 500,
            status: item.status ? String(item.status).toLowerCase() : 'requested',
            payment_status: item.payment_status ? String(item.payment_status).toLowerCase() : 'pending',
            payment_mode: item.payment_mode || 'cash',
            otp: item.otp || '4321',
            requested_at: item.requested_at || item.created_at || '2026-08-19 09:30',
            accepted_at: item.accepted_at || '',
            started_at: item.started_at || '',
            completed_at: item.completed_at || '',
          }));
          this.list.set(mapped);
        }
      },
      error: (err) => console.error('Failed to load bookings', err),
    });
  }

  onRowAction(event: Event): void {
    const detail = (event as CustomEvent).detail;
    if (detail.action === 'edit_option') this.startEdit(detail.row);
    else if (detail.action === 'delete_option') this.deleteOption(detail.row);
  }

  startAdd(): void {
    this.editingId.set('new');
    this.inputCode.set('MD-' + Math.floor(10000 + Math.random() * 90000));
    this.inputCustomer.set('');
    this.inputDriver.set('');
    this.inputVehicle.set('');
    this.inputVehicleCategory.set('Sedan');
    this.inputTripType.set('One Way');
    this.inputPickup.set('');
    this.inputPickupLat.set(28.6139);
    this.inputPickupLng.set(77.2090);
    this.inputDrop.set('');
    this.inputDropLat.set(28.5355);
    this.inputDropLng.set(77.3910);
    this.inputScheduledAt.set('');
    this.inputEstDistance.set(10);
    this.inputEstDuration.set(30);
    this.inputEstFare.set(300);
    this.inputFinalFare.set(300);
    this.inputStatus.set('requested');
    this.inputPaymentStatus.set('pending');
    this.inputPaymentMode.set('cash');
    this.inputOtp.set(String(Math.floor(1000 + Math.random() * 9000)));
    this.inputRequestedAt.set(new Date().toISOString().slice(0, 16));
    this.inputAcceptedAt.set('');
    this.inputStartedAt.set('');
    this.inputCompletedAt.set('');
    this.showAddForm.set(true);
  }

  startEdit(row: Booking): void {
    this.editingId.set(row.id || null);
    this.inputCode.set(row.booking_code);
    this.inputCustomer.set(row.customer_name);
    this.inputDriver.set(row.driver_name);
    this.inputVehicle.set(row.vehicle_name);
    this.inputVehicleCategory.set(row.vehicle_category);
    this.inputTripType.set(row.trip_type_name);
    this.inputPickup.set(row.pickup_address);
    this.inputPickupLat.set(row.pickup_lat);
    this.inputPickupLng.set(row.pickup_lng);
    this.inputDrop.set(row.drop_address);
    this.inputDropLat.set(row.drop_lat);
    this.inputDropLng.set(row.drop_lng);
    this.inputScheduledAt.set(row.scheduled_at);
    this.inputEstDistance.set(row.estimated_distance_km);
    this.inputEstDuration.set(row.estimated_duration_min);
    this.inputEstFare.set(row.estimated_fare);
    this.inputFinalFare.set(row.final_fare);
    this.inputStatus.set(row.status);
    this.inputPaymentStatus.set(row.payment_status);
    this.inputPaymentMode.set(row.payment_mode);
    this.inputOtp.set(row.otp);
    this.inputRequestedAt.set(row.requested_at);
    this.inputAcceptedAt.set(row.accepted_at);
    this.inputStartedAt.set(row.started_at);
    this.inputCompletedAt.set(row.completed_at);
    this.showAddForm.set(true);
  }

  saveOption(): void {
    if (!this.inputCode().trim()) {
      alert('Booking code is required.');
      return;
    }
    const id = this.editingId();
    const record: Booking = {
      id: id === 'new' ? 'bk-' + Date.now() : id!,
      booking_code: this.inputCode().trim(),
      customer_name: this.inputCustomer().trim() || 'Guest Customer',
      driver_name: this.inputDriver().trim() || 'Unassigned',
      vehicle_name: this.inputVehicle().trim() || 'Standard Cab',
      vehicle_category: this.inputVehicleCategory(),
      trip_type_name: this.inputTripType(),
      pickup_address: this.inputPickup().trim(),
      pickup_lat: Number(this.inputPickupLat()),
      pickup_lng: Number(this.inputPickupLng()),
      drop_address: this.inputDrop().trim(),
      drop_lat: Number(this.inputDropLat()),
      drop_lng: Number(this.inputDropLng()),
      scheduled_at: this.inputScheduledAt(),
      estimated_distance_km: Number(this.inputEstDistance()),
      estimated_duration_min: Number(this.inputEstDuration()),
      estimated_fare: Number(this.inputEstFare()),
      final_fare: Number(this.inputFinalFare()),
      status: this.inputStatus(),
      payment_status: this.inputPaymentStatus(),
      payment_mode: this.inputPaymentMode(),
      otp: this.inputOtp().trim(),
      requested_at: this.inputRequestedAt(),
      accepted_at: this.inputAcceptedAt(),
      started_at: this.inputStartedAt(),
      completed_at: this.inputCompletedAt(),
    };
    if (id === 'new') this.list.update((l) => [...l, record]);
    else this.list.update((l) => l.map((x) => (x.id === id ? record : x)));
    this.cancelEdit();
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.showAddForm.set(false);
  }

  deleteOption(row: Booking): void {
    if (confirm(`Delete booking "${row.booking_code}"?`)) {
      this.list.update((l) => l.filter((x) => x.id !== row.id));
    }
  }
}
