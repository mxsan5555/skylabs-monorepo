import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, inject, OnInit, computed } from '@angular/core';
import { AdminPage } from '../../../admin/admin-page/admin-page';
import { DriversApiService, type Driver } from '../../../core/drivers/drivers-api.service';

type ChecklistCategory = 'personal' | 'health' | 'education' | 'police';
type ChecklistStatus = 'Verified' | 'Rejected' | 'Correction Requested';

/** Maps a checklist status to a `sky-badge` variant — same convention as the driver-portal
 *  KYC page's `statusVariant` (see `pages/driver/status-variant.ts`), just a different
 *  vocabulary (checklist Pending/Verified/Rejected/Correction Requested, not the overall
 *  Driver.status stages). */
function checklistVariant(status: string): 'primary' | 'secondary' | 'tertiary' | 'error' {
  if (status === 'Verified') return 'primary';
  if (status === 'Correction Requested') return 'tertiary';
  if (status === 'Rejected') return 'error';
  return 'secondary'; // Pending
}

interface ChecklistCategoryView {
  key: ChecklistCategory;
  label: string;
  docs: { type: string; regNo: string; file: string }[];
  status: string;
  notes?: string;
}

@Component({
  selector: 'md-account-kyc-assignments',
  standalone: true,
  imports: [AdminPage],
  templateUrl: './kyc-assignments.html',
  styleUrl: '../masters/masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class KycAssignments implements OnInit {
  private readonly api = inject(DriversApiService);

  readonly checklistVariant = checklistVariant;

  // --- Assigned queue (this verifier's own drivers only — server-side ownership scoping,
  // see GET /drivers/assigned-to-me) ---
  readonly assignedDrivers = signal<Driver[]>([]);
  readonly loading = signal<boolean>(false);

  // --- List <-> Detail view switcher ---
  readonly selectedDriver = signal<Driver | null>(null);
  readonly savingCategory = signal<ChecklistCategory | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly noteDrafts = signal<Record<ChecklistCategory, string>>({
    personal: '',
    health: '',
    education: '',
    police: '',
  });

  readonly tableColumns = JSON.stringify([
    { key: 'firstName', label: 'First Name', sortable: true },
    { key: 'lastName', label: 'Last Name', sortable: true },
    { key: 'phone', label: 'Phone', sortable: true },
    { key: 'driverType', label: 'Driver Type', sortable: true },
    {
      key: 'status',
      label: 'KYC Status',
      type: 'status',
      statusMap: {
        Verified: 'success',
        'Partially Verified (P)': 'info',
        'Partially Verified (K)': 'info',
        'Non-Verified': 'warning',
        Blacklisted: 'error',
        Closed: 'error',
        'Not Useful': 'error',
      },
    },
    { key: 'personalDocsStatus', label: 'Personal Docs', sortable: false, hidden: true },
    { key: 'healthDocsStatus', label: 'Health Docs', sortable: false, hidden: true },
    { key: 'educationDocsStatus', label: 'Education Docs', sortable: false, hidden: true },
    { key: 'policeDocsStatus', label: 'Police Docs', sortable: false, hidden: true },
  ]);

  readonly tableActions = JSON.stringify([{ icon: 'fact_check', label: 'Review KYC', event: 'review_kyc' }]);

  readonly tableRowsString = computed(() => JSON.stringify(this.assignedDrivers()));
  readonly totalDrivers = computed(() => this.assignedDrivers().length);

  readonly checklistCategories = computed<ChecklistCategoryView[]>(() => {
    const d = this.selectedDriver();
    if (!d) return [];
    return [
      { key: 'personal', label: 'Personal Documents', docs: d.personalDocs ?? [], status: d.personalDocsStatus ?? 'Pending', notes: d.personalDocsNotes },
      { key: 'health', label: 'Health Documents', docs: d.healthDocs ?? [], status: d.healthDocsStatus ?? 'Pending', notes: d.healthDocsNotes },
      { key: 'education', label: 'Education Documents', docs: d.educationDocs ?? [], status: d.educationDocsStatus ?? 'Pending', notes: d.educationDocsNotes },
      { key: 'police', label: 'Police Verification Documents', docs: d.policeDocs ?? [], status: d.policeDocsStatus ?? 'Pending', notes: d.policeDocsNotes },
    ];
  });

  ngOnInit(): void {
    this.reload();
  }

  private reload(): void {
    this.loading.set(true);
    this.api.listAssignedToMe().subscribe({
      next: (data) => {
        this.assignedDrivers.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load assigned KYC queue', err);
        this.loading.set(false);
      },
    });
  }

  onRowAction(event: Event): void {
    const detail = (event as CustomEvent).detail;
    if (detail.action === 'review_kyc') {
      this.openDetail(detail.row.id);
    }
  }

  /** Always re-fetches from the ownership-checked `GET /drivers/assigned-to-me/:id` rather
   *  than reusing the serialized table row — that route is also the source of truth check
   *  that this driver is still actually assigned to the caller. */
  openDetail(driverId: string): void {
    this.actionError.set(null);
    this.api.getAssignedDriver(driverId).subscribe({
      next: (driver) => this.selectedDriver.set(driver),
      error: (err) => {
        console.error('Failed to open assigned driver', err);
        alert(err?.message || 'This driver is no longer assigned to you.');
        this.reload();
      },
    });
  }

  closeDetail(): void {
    this.selectedDriver.set(null);
    this.noteDrafts.set({ personal: '', health: '', education: '', police: '' });
  }

  onNoteChange(category: ChecklistCategory, event: Event): void {
    const val = (event.target as HTMLTextAreaElement | HTMLInputElement).value ?? '';
    this.noteDrafts.update((drafts) => ({ ...drafts, [category]: val }));
  }

  setCategory(category: ChecklistCategory, status: ChecklistStatus): void {
    const driver = this.selectedDriver();
    if (!driver?.id) return;
    this.savingCategory.set(category);
    this.actionError.set(null);
    const notes = this.noteDrafts()[category].trim() || undefined;
    this.api.setKycChecklistItem(driver.id, category, status, notes).subscribe({
      next: (updated) => {
        this.savingCategory.set(null);
        this.selectedDriver.set(updated);
        this.assignedDrivers.update((list) => list.map((d) => (d.id === updated.id ? updated : d)));
      },
      error: (err) => {
        this.savingCategory.set(null);
        this.actionError.set(err?.message || 'Failed to update this checklist item. Please try again.');
      },
    });
  }
}
