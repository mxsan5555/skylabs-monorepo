import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed, inject, OnInit } from '@angular/core';
import { AdminPage } from '../../../../admin/admin-page/admin-page';
import { BookingsApiService, type Booking } from '../../../../core/trips/bookings-api.service';

@Component({
  selector: 'md-bookings',
  standalone: true,
  imports: [AdminPage],
  templateUrl: './bookings.html',
  styleUrl: '../../masters/masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Bookings implements OnInit {
  private readonly api = inject(BookingsApiService);
  readonly list = signal<Booking[]>([]);
  readonly loading = signal(false);
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
        console.error('Failed to load bookings', err);
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
    const payload: Booking = {
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
    const id = this.editingId();
    const request = id === 'new' || id === null ? this.api.create(payload) : this.api.update(id, payload);
    request.subscribe({
      next: () => {
        this.reload();
        this.cancelEdit();
      },
      error: (err) => {
        console.error('Failed to save booking', err);
        alert('Failed to save booking. Please try again.');
      },
    });
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.showAddForm.set(false);
  }

  deleteOption(row: Booking): void {
    if (confirm(`Delete booking "${row.booking_code}"?`) && row.id) {
      this.api.delete(row.id).subscribe({
        next: () => this.reload(),
        error: (err) => {
          console.error('Failed to delete booking', err);
          alert('Failed to delete booking. Please try again.');
        },
      });
    }
  }
}
