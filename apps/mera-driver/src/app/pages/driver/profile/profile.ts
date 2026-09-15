import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, inject, signal } from '@angular/core';
import { AdminPage } from '../../../admin/admin-page/admin-page';
import { DriverSelfApiService, type DriverSelf, type DriverSelfUpdate } from '../../../core/drivers/driver-self-api.service';
import { MasterListApiService, type MasterOption } from '../../../core/masters/master-list-api.service';

type FieldKey = keyof Omit<DriverSelfUpdate, 'languages'>;

/** One source of truth for the self-edit form — add a field by extending this. */
const FIELDS: { key: FieldKey; label: string; type?: string; span2?: boolean }[] = [
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'fatherName', label: "Father's name" },
  { key: 'motherName', label: "Mother's name" },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'phone', label: 'Phone', type: 'tel' },
  { key: 'emergencyNumber', label: 'Emergency number', type: 'tel' },
  { key: 'dob', label: 'Date of birth', type: 'date' },
  { key: 'maritalStatus', label: 'Marital status' },
  { key: 'gender', label: 'Gender' },
  { key: 'passportNumber', label: 'Passport number' },
  { key: 'religion', label: 'Religion' },
  { key: 'color', label: 'Color' },
  { key: 'age', label: 'Age' },
  { key: 'height', label: 'Height' },
  { key: 'weight', label: 'Weight' },
  { key: 'address', label: 'Address', span2: true },
  { key: 'country', label: 'Country' },
  { key: 'state', label: 'State' },
  { key: 'pincode', label: 'Pincode' },
  { key: 'education', label: 'Education' },
  { key: 'trainingStatus', label: 'Training status' },
  { key: 'trainingCertificate', label: 'Training certificate' },
  { key: 'eyeVision', label: 'Eye vision' },
  { key: 'healthInsurance', label: 'Health insurance' },
  { key: 'bloodGroup', label: 'Blood group' },
  { key: 'licenseDetails', label: 'License details', span2: true },
  { key: 'vehicleType', label: 'Vehicle type' },
  { key: 'dlNo', label: 'DL number' },
  { key: 'dlIssueDate', label: 'DL issue date', type: 'date' },
  { key: 'dlExpiryDate', label: 'DL expiry date', type: 'date' },
  { key: 'preferredPaymentMode', label: 'Preferred payment mode' },
  { key: 'bankName', label: 'Bank name' },
  { key: 'bankAccountNo', label: 'Bank account no.' },
  { key: 'ifscCode', label: 'IFSC code' },
  { key: 'branchName', label: 'Branch name' },
  { key: 'upiIdOrChequeNo', label: 'UPI ID / cheque no.' },
];

@Component({
  selector: 'md-driver-profile',
  imports: [AdminPage],
  templateUrl: './profile.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DriverProfile implements OnInit {
  private readonly api = inject(DriverSelfApiService);
  private readonly mastersApi = inject(MasterListApiService);

  protected readonly fields = FIELDS;
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly draft = signal<DriverSelfUpdate>({});
  protected readonly languageOptions = signal<MasterOption[]>([]);
  protected readonly selectedLanguages = signal<string[]>([]);

  ngOnInit(): void {
    this.mastersApi.list('languages').subscribe({
      next: (opts) => this.languageOptions.set(opts.filter((o) => o.status === 'Active')),
      error: () => undefined,
    });

    this.api.get().subscribe({
      next: (d) => {
        this.draft.set(toDraft(d));
        this.selectedLanguages.set(d.languages ?? []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected setField(key: FieldKey, value: string): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  protected toggleLanguage(name: string): void {
    this.selectedLanguages.update((langs) =>
      langs.includes(name) ? langs.filter((l) => l !== name) : [...langs, name],
    );
  }

  protected save(): void {
    this.saving.set(true);
    this.error.set(null);
    this.api.update({ ...this.draft(), languages: this.selectedLanguages() }).subscribe({
      next: (d) => {
        this.draft.set(toDraft(d));
        this.selectedLanguages.set(d.languages ?? []);
        this.saving.set(false);
        this.saved.set(true);
        setTimeout(() => this.saved.set(false), 2000);
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(err?.message ?? 'Failed to save. Please try again.');
      },
    });
  }
}

function toDraft(d: DriverSelf): DriverSelfUpdate {
  const { id: _id, status: _status, verificationNotes: _notes, documents: _docs, languages: _langs, ...rest } = d;
  return rest;
}
