import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, inject, OnInit, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AdminPage } from '../../../admin/admin-page/admin-page';

interface AttendanceRecord {
  id?: number;
  driver_id: number;
  driver_name?: string;
  attendance_date: string;
  check_in_time?: string;
  check_out_time?: string;
  check_in_latitude?: number;
  check_in_longitude?: number;
  check_out_latitude?: number;
  check_out_longitude?: number;
  status: string;
  total_hours?: number;
  assigned_trip_id?: number;
  leave_type?: string;
  leave_reason?: string;
  remarks?: string;
}

@Component({
  selector: 'md-account-attendance',
  standalone: true,
  imports: [AdminPage],
  templateUrl: './attendance.html',
  styleUrl: './attendance.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class Attendance implements OnInit {
  private readonly http = inject(HttpClient);

  // --- All Attendance Repository ---
  readonly allAttendance = signal<AttendanceRecord[]>([]);

  // --- Search, Filter, Sort & Pagination Signals ---
  readonly searchQuery = signal<string>('');
  readonly statusFilter = signal<string>('all');
  readonly sortKey = signal<string>('attendance_date');
  readonly sortDir = signal<'asc' | 'desc' | ''>('desc');
  readonly page = signal<number>(1);
  readonly pageSize = signal<number>(10);

  // --- View Switcher (Page vs Form) ---
  readonly showAddForm = signal<boolean>(false);
  readonly editingRecordId = signal<number | null>(null);

  // --- Form Input Signals ---
  readonly inputDriverId = signal<string>('');
  readonly inputAttendanceDate = signal<string>('');
  readonly inputCheckInTime = signal<string>('');
  readonly inputCheckOutTime = signal<string>('');
  readonly inputCheckInLatitude = signal<string>('');
  readonly inputCheckInLongitude = signal<string>('');
  readonly inputCheckOutLatitude = signal<string>('');
  readonly inputCheckOutLongitude = signal<string>('');
  readonly inputStatus = signal<string>('Present');
  readonly inputTotalHours = signal<string>('');
  readonly inputAssignedTripId = signal<string>('');
  readonly inputLeaveType = signal<string>('');
  readonly inputLeaveReason = signal<string>('');
  readonly inputRemarks = signal<string>('');

  protected readonly content = signal({
    title: 'Attendance Registry',
    subtitle: 'Manage and view driver check-in/out records.',
    cardTitle: 'Log Attendance',
    btnRegister: 'Save Log',
    errorEmptyFields: 'Driver ID, Attendance Date, and Status are required.'
  });

  // --- Table Columns ---
  readonly tableColumns = JSON.stringify([
    { key: 'attendance_date', label: 'Date', sortable: true },
    { key: 'driver_name', label: 'Driver', sortable: true },
    { key: 'driver_id', label: 'Driver ID', sortable: true },
    { key: 'check_in_time', label: 'Check In', sortable: true },
    { key: 'check_out_time', label: 'Check Out', sortable: true },
    { key: 'total_hours', label: 'Hours Worked', sortable: true },
    { key: 'status', label: 'Status', type: 'status', statusMap: { 
        'Present': 'success', 
        'Half Day': 'info', 
        'Leave': 'warning', 
        'Absent': 'error'
      } 
    },
    { key: 'check_in_latitude', label: 'In Lat', sortable: false, hidden: true },
    { key: 'check_in_longitude', label: 'In Lng', sortable: false, hidden: true },
    { key: 'check_out_latitude', label: 'Out Lat', sortable: false, hidden: true },
    { key: 'check_out_longitude', label: 'Out Lng', sortable: false, hidden: true },
    { key: 'assigned_trip_id', label: 'Trip ID', sortable: true, hidden: true },
    { key: 'leave_type', label: 'Leave Type', sortable: true, hidden: true },
    { key: 'leave_reason', label: 'Leave Reason', sortable: false, hidden: true },
    { key: 'remarks', label: 'Remarks', sortable: false, hidden: true }
  ]);

  readonly tableFilterOptions = JSON.stringify([
    { value: 'all', label: 'All Statuses' },
    { value: 'Present', label: 'Present' },
    { value: 'Half Day', label: 'Half Day' },
    { value: 'Leave', label: 'Leave' },
    { value: 'Absent', label: 'Absent' }
  ]);

  readonly tableActions = JSON.stringify([
    { icon: 'visibility', label: 'View Details', event: '__view_detail__' },
    { icon: 'edit', label: 'Edit', event: 'edit_attendance' },
    { icon: 'delete', label: 'Delete', event: 'delete_attendance', variant: 'danger' }
  ]);

  // --- Processed Dataset ---
  readonly processedAttendance = computed(() => {
    let list = this.allAttendance().map(r => {
      const driverMap: Record<number, string> = {
        501: 'Ramesh Kumar',
        502: 'Suresh Raina',
        503: 'Manpreet Singh',
        504: 'Amit Patel'
      };
      return {
        driver_name: r.driver_name || driverMap[r.driver_id] || `Driver #${r.driver_id}`,
        ...r
      };
    });

    // 1. Search Query Filter
    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      list = list.filter(r =>
        String(r.driver_id).includes(query) ||
        r.driver_name.toLowerCase().includes(query) ||
        r.status.toLowerCase().includes(query) ||
        (r.remarks && r.remarks.toLowerCase().includes(query))
      );
    }

    // 2. Dropdown Filter
    const filter = this.statusFilter();
    if (filter !== 'all') {
      list = list.filter(r => r.status === filter);
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

  // --- Paginated Rows ---
  readonly tableRowsString = computed(() => {
    const list = this.processedAttendance();
    const start = (this.page() - 1) * this.pageSize();
    const paginated = list.slice(start, start + this.pageSize());
    return JSON.stringify(paginated);
  });

  readonly totalAttendance = computed(() => this.processedAttendance().length);

  ngOnInit(): void {
    this.http.get<AttendanceRecord[]>('data/attendance.json').subscribe({
      next: (data) => {
        this.allAttendance.set(data || []);
      },
      error: (err) => {
        console.error('Failed to load mock attendance JSON', err);
      }
    });
  }

  // --- Add/Edit Attendance ---
  addAttendance(): void {
    const driver_id = Number(this.inputDriverId().trim());
    const attendance_date = this.inputAttendanceDate();
    const status = this.inputStatus();

    if (isNaN(driver_id) || !attendance_date || !status) {
      alert(this.content().errorEmptyFields);
      return;
    }

    const newRecord: AttendanceRecord = {
      id: this.editingRecordId() || Date.now(),
      driver_id,
      attendance_date,
      status,
      check_in_time: this.inputCheckInTime() || undefined,
      check_out_time: this.inputCheckOutTime() || undefined,
      check_in_latitude: this.inputCheckInLatitude() ? Number(this.inputCheckInLatitude()) : undefined,
      check_in_longitude: this.inputCheckInLongitude() ? Number(this.inputCheckInLongitude()) : undefined,
      check_out_latitude: this.inputCheckOutLatitude() ? Number(this.inputCheckOutLatitude()) : undefined,
      check_out_longitude: this.inputCheckOutLongitude() ? Number(this.inputCheckOutLongitude()) : undefined,
      total_hours: this.inputTotalHours() ? Number(this.inputTotalHours()) : undefined,
      assigned_trip_id: this.inputAssignedTripId() ? Number(this.inputAssignedTripId()) : undefined,
      leave_type: this.inputLeaveType().trim() || undefined,
      leave_reason: this.inputLeaveReason().trim() || undefined,
      remarks: this.inputRemarks().trim() || undefined
    };

    const editingId = this.editingRecordId();
    if (editingId !== null) {
      this.allAttendance.update(list => list.map(r => r.id === editingId ? newRecord : r));
    } else {
      this.allAttendance.update(list => [newRecord, ...list]);
    }

    this.resetForm();
    this.showAddForm.set(false);
  }

  resetForm(): void {
    this.editingRecordId.set(null);
    this.inputDriverId.set('');
    this.inputAttendanceDate.set('');
    this.inputCheckInTime.set('');
    this.inputCheckOutTime.set('');
    this.inputCheckInLatitude.set('');
    this.inputCheckInLongitude.set('');
    this.inputCheckOutLatitude.set('');
    this.inputCheckOutLongitude.set('');
    this.inputStatus.set('Present');
    this.inputTotalHours.set('');
    this.inputAssignedTripId.set('');
    this.inputLeaveType.set('');
    this.inputLeaveReason.set('');
    this.inputRemarks.set('');
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
    console.log('Selected Attendance Logs:', detail.selected);
  }

  onRowAction(event: Event): void {
    const detail = (event as CustomEvent).detail;
    const action = detail.action;
    const row = detail.row;

    if (action === 'edit_attendance') {
      this.editingRecordId.set(row.id);
      this.inputDriverId.set(String(row.driver_id || ''));
      this.inputAttendanceDate.set(row.attendance_date || '');
      this.inputCheckInTime.set(row.check_in_time || '');
      this.inputCheckOutTime.set(row.check_out_time || '');
      this.inputCheckInLatitude.set(row.check_in_latitude ? String(row.check_in_latitude) : '');
      this.inputCheckInLongitude.set(row.check_in_longitude ? String(row.check_in_longitude) : '');
      this.inputCheckOutLatitude.set(row.check_out_latitude ? String(row.check_out_latitude) : '');
      this.inputCheckOutLongitude.set(row.check_out_longitude ? String(row.check_out_longitude) : '');
      this.inputStatus.set(row.status || 'Present');
      this.inputTotalHours.set(row.total_hours ? String(row.total_hours) : '');
      this.inputAssignedTripId.set(row.assigned_trip_id ? String(row.assigned_trip_id) : '');
      this.inputLeaveType.set(row.leave_type || '');
      this.inputLeaveReason.set(row.leave_reason || '');
      this.inputRemarks.set(row.remarks || '');

      this.showAddForm.set(true);
    } else if (action === 'delete_attendance') {
      if (confirm(`Are you sure you want to delete attendance record?`)) {
        this.allAttendance.update(list => list.filter(r => r.id !== row.id));
      }
    }
  }

  openAddAttendanceForm(): void {
    this.showAddForm.set(true);
  }

  closeAddAttendanceForm(): void {
    this.showAddForm.set(false);
    this.resetForm();
  }

  onInputChange(field: string, event: Event): void {
    const val = (event.target as any).value || '';
    switch(field) {
      case 'driver_id': this.inputDriverId.set(val); break;
      case 'attendance_date': this.inputAttendanceDate.set(val); break;
      case 'check_in_time': this.inputCheckInTime.set(val); break;
      case 'check_out_time': this.inputCheckOutTime.set(val); break;
      case 'check_in_latitude': this.inputCheckInLatitude.set(val); break;
      case 'check_in_longitude': this.inputCheckInLongitude.set(val); break;
      case 'check_out_latitude': this.inputCheckOutLatitude.set(val); break;
      case 'check_out_longitude': this.inputCheckOutLongitude.set(val); break;
      case 'status': this.inputStatus.set(val); break;
      case 'total_hours': this.inputTotalHours.set(val); break;
      case 'assigned_trip_id': this.inputAssignedTripId.set(val); break;
      case 'leave_type': this.inputLeaveType.set(val); break;
      case 'leave_reason': this.inputLeaveReason.set(val); break;
      case 'remarks': this.inputRemarks.set(val); break;
    }
  }
}
