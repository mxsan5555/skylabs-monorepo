import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, inject, OnInit, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AdminPage } from '../../../admin/admin-page/admin-page';

interface Trip {
  id?: number;
  trip_uid: string;
  booking_id: number;
  customer_id: number;
  driver_id: number;
  driver_name?: string;
  vehicle_id: number;
  vehicle_number?: string;
  trip_type: string;
  pickup_address: string;
  pickup_latitude?: number;
  pickup_longitude?: number;
  drop_address?: string;
  drop_latitude?: number;
  drop_longitude?: number;
  scheduled_date: string;
  scheduled_time: string;
  actual_start_time?: string;
  actual_end_time?: string;
  estimated_distance_km?: number;
  actual_distance_km?: number;
  estimated_duration_min?: number;
  actual_duration_min?: number;
  base_fare?: number;
  extra_charges?: number;
  discount_amount?: number;
  final_amount?: number;
  status: string;
  cancellation_reason?: string;
  customer_rating?: number;
  customer_review?: string;
  notes?: string;
}

@Component({
  selector: 'md-account-trips',
  standalone: true,
  imports: [AdminPage],
  templateUrl: './trips.html',
  styleUrl: './trips.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class Trips implements OnInit {
  private readonly http = inject(HttpClient);

  // --- All Trips Repository ---
  readonly allTrips = signal<Trip[]>([]);

  // --- Search, Filter, Sort & Pagination Signals ---
  readonly searchQuery = signal<string>('');
  readonly statusFilter = signal<string>('all');
  readonly sortKey = signal<string>('scheduled_date');
  readonly sortDir = signal<'asc' | 'desc' | ''>('desc');
  readonly page = signal<number>(1);
  readonly pageSize = signal<number>(10);

  // --- View Switcher (Page vs Form) ---
  readonly showAddForm = signal<boolean>(false);
  readonly editingTripId = signal<number | null>(null);

  // --- Form Input Signals ---
  readonly inputTripUid = signal<string>('');
  readonly inputBookingId = signal<string>('');
  readonly inputCustomerId = signal<string>('');
  readonly inputDriverId = signal<string>('');
  readonly inputVehicleId = signal<string>('');
  readonly inputTripType = signal<string>('Local');
  readonly inputPickupAddress = signal<string>('');
  readonly inputPickupLatitude = signal<string>('');
  readonly inputPickupLongitude = signal<string>('');
  readonly inputDropAddress = signal<string>('');
  readonly inputDropLatitude = signal<string>('');
  readonly inputDropLongitude = signal<string>('');
  readonly inputScheduledDate = signal<string>('');
  readonly inputScheduledTime = signal<string>('');
  readonly inputActualStartTime = signal<string>('');
  readonly inputActualEndTime = signal<string>('');
  readonly inputEstimatedDistance = signal<string>('');
  readonly inputActualDistance = signal<string>('');
  readonly inputEstimatedDuration = signal<string>('');
  readonly inputActualDuration = signal<string>('');
  readonly inputBaseFare = signal<string>('');
  readonly inputExtraCharges = signal<string>('');
  readonly inputDiscountAmount = signal<string>('');
  readonly inputFinalAmount = signal<string>('');
  readonly inputStatus = signal<string>('Scheduled');
  readonly inputCancellationReason = signal<string>('');
  readonly inputCustomerRating = signal<string>('');
  readonly inputCustomerReview = signal<string>('');
  readonly inputNotes = signal<string>('');

  protected readonly content = signal({
    title: 'Trip Registry',
    subtitle: 'Manage, track and view trips in the fleet.',
    cardTitle: 'Create New Trip',
    btnRegister: 'Save Trip',
    errorEmptyFields: 'Trip UID, Booking ID, Customer ID, Driver ID, Vehicle ID, Trip Type, Pickup Address, and Scheduled details are required.'
  });

  // --- Table Columns ---
  readonly tableColumns = JSON.stringify([
    { key: 'trip_uid', label: 'Trip UID', sortable: true },
    { key: 'scheduled_date', label: 'Trip Date', sortable: true },
    { key: 'scheduled_time', label: 'Pickup Time', sortable: true },
    { key: 'trip_type', label: 'Trip Type', sortable: true },
    { key: 'driver_name', label: 'Driver', sortable: true },
    { key: 'pickup_address', label: 'Pickup Location', sortable: false },
    { key: 'final_amount', label: 'Fare (₹)', sortable: true },
    { key: 'status', label: 'Status', type: 'status', statusMap: { 
        'Completed': 'success', 
        'Scheduled': 'info', 
        'Ongoing': 'info', 
        'Assigned': 'info',
        'Cancelled': 'error'
      } 
    },
    { key: 'booking_id', label: 'Booking ID', sortable: true, hidden: true },
    { key: 'customer_id', label: 'Customer ID', sortable: true, hidden: true },
    { key: 'driver_id', label: 'Driver ID', sortable: true, hidden: true },
    { key: 'vehicle_id', label: 'Vehicle ID', sortable: true, hidden: true },
    { key: 'pickup_latitude', label: 'Pickup Lat', sortable: false, hidden: true },
    { key: 'pickup_longitude', label: 'Pickup Lng', sortable: false, hidden: true },
    { key: 'drop_address', label: 'Drop Destination', sortable: false, hidden: true },
    { key: 'drop_latitude', label: 'Drop Lat', sortable: false, hidden: true },
    { key: 'drop_longitude', label: 'Drop Lng', sortable: false, hidden: true },
    { key: 'actual_start_time', label: 'Start Time', sortable: true, hidden: true },
    { key: 'actual_end_time', label: 'End Time', sortable: true, hidden: true },
    { key: 'estimated_distance_km', label: 'Est Distance (KM)', sortable: true, hidden: true },
    { key: 'actual_distance_km', label: 'Act Distance (KM)', sortable: true, hidden: true },
    { key: 'estimated_duration_min', label: 'Est Duration (Min)', sortable: true, hidden: true },
    { key: 'actual_duration_min', label: 'Act Duration (Min)', sortable: true, hidden: true },
    { key: 'base_fare', label: 'Base Fare', sortable: true, hidden: true },
    { key: 'extra_charges', label: 'Extra Charges', sortable: true, hidden: true },
    { key: 'discount_amount', label: 'Discount', sortable: true, hidden: true },
    { key: 'cancellation_reason', label: 'Cancel Reason', sortable: false, hidden: true },
    { key: 'customer_rating', label: 'Rating', sortable: true, hidden: true },
    { key: 'customer_review', label: 'Review', sortable: false, hidden: true },
    { key: 'notes', label: 'Notes', sortable: false, hidden: true }
  ]);

  readonly tableFilterOptions = JSON.stringify([
    { value: 'all', label: 'All Statuses' },
    { value: 'Scheduled', label: 'Scheduled' },
    { value: 'Assigned', label: 'Assigned' },
    { value: 'Ongoing', label: 'Ongoing' },
    { value: 'Completed', label: 'Completed' },
    { value: 'Cancelled', label: 'Cancelled' }
  ]);

  readonly tableActions = JSON.stringify([
    { icon: 'visibility', label: 'View Details', event: '__view_detail__' },
    { icon: 'edit', label: 'Edit', event: 'edit_trip' },
    { icon: 'delete', label: 'Delete', event: 'delete_trip', variant: 'danger' }
  ]);

  // --- Processed Trips List ---
  readonly processedTrips = computed(() => {
    let list = this.allTrips().map(t => {
      const driverMap: Record<number, string> = {
        501: 'Ramesh Kumar',
        502: 'Suresh Raina',
        503: 'Manpreet Singh',
        504: 'Amit Patel'
      };
      return {
        driver_name: t.driver_name || driverMap[t.driver_id] || `Driver #${t.driver_id}`,
        ...t
      };
    });

    // 1. Search Query Filter
    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      list = list.filter(t =>
        t.trip_uid.toLowerCase().includes(query) ||
        String(t.booking_id).includes(query) ||
        String(t.customer_id).includes(query) ||
        t.driver_name.toLowerCase().includes(query) ||
        t.trip_type.toLowerCase().includes(query) ||
        t.pickup_address.toLowerCase().includes(query) ||
        (t.drop_address && t.drop_address.toLowerCase().includes(query))
      );
    }

    // 2. Status Filter
    const filter = this.statusFilter();
    if (filter !== 'all') {
      list = list.filter(t => t.status === filter);
    }

    // 3. Sort
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

  readonly tableRowsString = computed(() => {
    const list = this.processedTrips();
    const start = (this.page() - 1) * this.pageSize();
    const paginated = list.slice(start, start + this.pageSize());
    return JSON.stringify(paginated);
  });

  readonly totalTrips = computed(() => this.processedTrips().length);

  ngOnInit(): void {
    this.http.get<Trip[]>('data/trips.json').subscribe({
      next: (data) => {
        this.allTrips.set(data || []);
      },
      error: (err) => {
        console.error('Failed to load trips JSON', err);
      }
    });
  }

  // --- Add/Edit Trip CRUD ---
  addTrip(): void {
    const trip_uid = this.inputTripUid().trim();
    const booking_id = Number(this.inputBookingId().trim());
    const customer_id = Number(this.inputCustomerId().trim());
    const driver_id = Number(this.inputDriverId().trim());
    const vehicle_id = Number(this.inputVehicleId().trim());
    const trip_type = this.inputTripType();
    const pickup_address = this.inputPickupAddress().trim();
    const scheduled_date = this.inputScheduledDate();
    const scheduled_time = this.inputScheduledTime();

    if (!trip_uid || isNaN(booking_id) || isNaN(customer_id) || isNaN(driver_id) || isNaN(vehicle_id) || !trip_type || !pickup_address || !scheduled_date || !scheduled_time) {
      alert(this.content().errorEmptyFields);
      return;
    }

    const newTrip: Trip = {
      id: this.editingTripId() || Date.now(),
      trip_uid,
      booking_id,
      customer_id,
      driver_id,
      vehicle_id,
      trip_type,
      pickup_address,
      pickup_latitude: this.inputPickupLatitude() ? Number(this.inputPickupLatitude()) : undefined,
      pickup_longitude: this.inputPickupLongitude() ? Number(this.inputPickupLongitude()) : undefined,
      drop_address: this.inputDropAddress().trim() || undefined,
      drop_latitude: this.inputDropLatitude() ? Number(this.inputDropLatitude()) : undefined,
      drop_longitude: this.inputDropLongitude() ? Number(this.inputDropLongitude()) : undefined,
      scheduled_date,
      scheduled_time,
      actual_start_time: this.inputActualStartTime() || undefined,
      actual_end_time: this.inputActualEndTime() || undefined,
      estimated_distance_km: this.inputEstimatedDistance() ? Number(this.inputEstimatedDistance()) : undefined,
      actual_distance_km: this.inputActualDistance() ? Number(this.inputActualDistance()) : undefined,
      estimated_duration_min: this.inputEstimatedDuration() ? Number(this.inputEstimatedDuration()) : undefined,
      actual_duration_min: this.inputActualDuration() ? Number(this.inputActualDuration()) : undefined,
      base_fare: this.inputBaseFare() ? Number(this.inputBaseFare()) : undefined,
      extra_charges: this.inputExtraCharges() ? Number(this.inputExtraCharges()) : undefined,
      discount_amount: this.inputDiscountAmount() ? Number(this.inputDiscountAmount()) : undefined,
      final_amount: this.inputFinalAmount() ? Number(this.inputFinalAmount()) : undefined,
      status: this.inputStatus(),
      cancellation_reason: this.inputCancellationReason().trim() || undefined,
      customer_rating: this.inputCustomerRating() ? Number(this.inputCustomerRating()) : undefined,
      customer_review: this.inputCustomerReview().trim() || undefined,
      notes: this.inputNotes().trim() || undefined
    };

    const editingId = this.editingTripId();
    if (editingId !== null) {
      this.allTrips.update(list => list.map(t => t.id === editingId ? newTrip : t));
    } else {
      this.allTrips.update(list => [newTrip, ...list]);
    }

    this.resetForm();
    this.showAddForm.set(false);
  }

  resetForm(): void {
    this.editingTripId.set(null);
    this.inputTripUid.set('');
    this.inputBookingId.set('');
    this.inputCustomerId.set('');
    this.inputDriverId.set('');
    this.inputVehicleId.set('');
    this.inputTripType.set('Local');
    this.inputPickupAddress.set('');
    this.inputPickupLatitude.set('');
    this.inputPickupLongitude.set('');
    this.inputDropAddress.set('');
    this.inputDropLatitude.set('');
    this.inputDropLongitude.set('');
    this.inputScheduledDate.set('');
    this.inputScheduledTime.set('');
    this.inputActualStartTime.set('');
    this.inputActualEndTime.set('');
    this.inputEstimatedDistance.set('');
    this.inputActualDistance.set('');
    this.inputEstimatedDuration.set('');
    this.inputActualDuration.set('');
    this.inputBaseFare.set('');
    this.inputExtraCharges.set('');
    this.inputDiscountAmount.set('');
    this.inputFinalAmount.set('');
    this.inputStatus.set('Scheduled');
    this.inputCancellationReason.set('');
    this.inputCustomerRating.set('');
    this.inputCustomerReview.set('');
    this.inputNotes.set('');
  }

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
    console.log('Selected Trips:', detail.selected);
  }

  onRowAction(event: Event): void {
    const detail = (event as CustomEvent).detail;
    const action = detail.action;
    const row = detail.row;

    if (action === 'edit_trip') {
      this.editingTripId.set(row.id);
      this.inputTripUid.set(row.trip_uid || '');
      this.inputBookingId.set(String(row.booking_id || ''));
      this.inputCustomerId.set(String(row.customer_id || ''));
      this.inputDriverId.set(String(row.driver_id || ''));
      this.inputVehicleId.set(String(row.vehicle_id || ''));
      this.inputTripType.set(row.trip_type || 'Local');
      this.inputPickupAddress.set(row.pickup_address || '');
      this.inputPickupLatitude.set(row.pickup_latitude ? String(row.pickup_latitude) : '');
      this.inputPickupLongitude.set(row.pickup_longitude ? String(row.pickup_longitude) : '');
      this.inputDropAddress.set(row.drop_address || '');
      this.inputDropLatitude.set(row.drop_latitude ? String(row.drop_latitude) : '');
      this.inputDropLongitude.set(row.drop_longitude ? String(row.drop_longitude) : '');
      this.inputScheduledDate.set(row.scheduled_date || '');
      this.inputScheduledTime.set(row.scheduled_time || '');
      this.inputActualStartTime.set(row.actual_start_time || '');
      this.inputActualEndTime.set(row.actual_end_time || '');
      this.inputEstimatedDistance.set(row.estimated_distance_km ? String(row.estimated_distance_km) : '');
      this.inputActualDistance.set(row.actual_distance_km ? String(row.actual_distance_km) : '');
      this.inputEstimatedDuration.set(row.estimated_duration_min ? String(row.estimated_duration_min) : '');
      this.inputActualDuration.set(row.actual_duration_min ? String(row.actual_duration_min) : '');
      this.inputBaseFare.set(row.base_fare ? String(row.base_fare) : '');
      this.inputExtraCharges.set(row.extra_charges ? String(row.extra_charges) : '');
      this.inputDiscountAmount.set(row.discount_amount ? String(row.discount_amount) : '');
      this.inputFinalAmount.set(row.final_amount ? String(row.final_amount) : '');
      this.inputStatus.set(row.status || 'Scheduled');
      this.inputCancellationReason.set(row.cancellation_reason || '');
      this.inputCustomerRating.set(row.customer_rating ? String(row.customer_rating) : '');
      this.inputCustomerReview.set(row.customer_review || '');
      this.inputNotes.set(row.notes || '');

      this.showAddForm.set(true);
    } else if (action === 'delete_trip') {
      if (confirm(`Are you sure you want to delete trip "${row.trip_uid}"?`)) {
        this.allTrips.update(list => list.filter(t => t.id !== row.id));
      }
    }
  }

  openAddTripForm(): void {
    this.showAddForm.set(true);
  }

  closeAddTripForm(): void {
    this.showAddForm.set(false);
    this.resetForm();
  }

  onInputChange(field: string, event: Event): void {
    const val = (event.target as any).value || '';
    switch(field) {
      case 'trip_uid': this.inputTripUid.set(val); break;
      case 'booking_id': this.inputBookingId.set(val); break;
      case 'customer_id': this.inputCustomerId.set(val); break;
      case 'driver_id': this.inputDriverId.set(val); break;
      case 'vehicle_id': this.inputVehicleId.set(val); break;
      case 'trip_type': this.inputTripType.set(val); break;
      case 'pickup_address': this.inputPickupAddress.set(val); break;
      case 'pickup_latitude': this.inputPickupLatitude.set(val); break;
      case 'pickup_longitude': this.inputPickupLongitude.set(val); break;
      case 'drop_address': this.inputDropAddress.set(val); break;
      case 'drop_latitude': this.inputDropLatitude.set(val); break;
      case 'drop_longitude': this.inputDropLongitude.set(val); break;
      case 'scheduled_date': this.inputScheduledDate.set(val); break;
      case 'scheduled_time': this.inputScheduledTime.set(val); break;
      case 'actual_start_time': this.inputActualStartTime.set(val); break;
      case 'actual_end_time': this.inputActualEndTime.set(val); break;
      case 'estimated_distance_km': this.inputEstimatedDistance.set(val); break;
      case 'actual_distance_km': this.inputActualDistance.set(val); break;
      case 'estimated_duration_min': this.inputEstimatedDuration.set(val); break;
      case 'actual_duration_min': this.inputActualDuration.set(val); break;
      case 'base_fare': this.inputBaseFare.set(val); break;
      case 'extra_charges': this.inputExtraCharges.set(val); break;
      case 'discount_amount': this.inputDiscountAmount.set(val); break;
      case 'final_amount': this.inputFinalAmount.set(val); break;
      case 'status': this.inputStatus.set(val); break;
      case 'cancellation_reason': this.inputCancellationReason.set(val); break;
      case 'customer_rating': this.inputCustomerRating.set(val); break;
      case 'customer_review': this.inputCustomerReview.set(val); break;
      case 'notes': this.inputNotes.set(val); break;
    }
  }
}
