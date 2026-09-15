import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, computed, inject, signal } from '@angular/core';
import { AdminPage } from '../../../admin/admin-page/admin-page';
import { DriverSelfApiService, type DriverSelf, type DriverSelfUpdate } from '../../../core/drivers/driver-self-api.service';
import { MasterListApiService, type MasterOption } from '../../../core/masters/master-list-api.service';
import { calculateProfileCompletion } from '../profile-completion';

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

  /** The full last-fetched record (including `documents`) — kept separately from `draft`
   *  (the editable-fields-only subset) so profile-completion can see document/language
   *  state without the self-edit form needing to carry read-only fields around. */
  private readonly driver = signal<DriverSelf | null>(null);
  protected readonly completion = computed(() => {
    const d = this.driver();
    return d ? calculateProfileCompletion(d) : null;
  });

  ngOnInit(): void {
    this.mastersApi.list('languages').subscribe({
      next: (opts) => this.languageOptions.set(opts.filter((o) => o.status === 'Active')),
      error: () => undefined,
    });

    this.api.get().subscribe({
      next: (d) => {
        this.driver.set(d);
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
    // Omit blank fields rather than sending `""` — several backend validators (e.g. `email`'s
    // format check, `gender`'s min-length) accept an absent key (untouched) but reject an
    // empty string, since `.partial()` only makes a field optional, not "empty string is
    // valid". Sending only the fields the driver actually filled in also means an unfilled
    // field is never blanked out by force.
    this.api.update({ ...stripBlank(this.draft()), languages: this.selectedLanguages() }).subscribe({
      next: (d) => {
        this.driver.set(d);
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

/**
 * Builds the editable draft by picking exactly the known `FIELDS` keys off the fetched
 * record — NOT a `{...rest}` spread. The real `/drivers/me` response is the full Prisma
 * row (`createdAt`, `userId`, the linked `user` object, staff-only fields like `driverType`/
 * `sourceType`/`policeVerifiedStatus`, etc.) since the backend selects the whole model; a
 * spread would carry every one of those into `draft` and then into the PATCH payload. A
 * driver's own PATCH must only ever contain the fields they can actually see and edit here.
 * Missing/`null` DB columns become `''` so text-field bindings never see `null`.
 */
function toDraft(d: DriverSelf): DriverSelfUpdate {
  const out: DriverSelfUpdate = {};
  for (const f of FIELDS) {
    (out as Record<string, unknown>)[f.key] = (d as unknown as Record<string, unknown>)[f.key] ?? '';
  }
  return out;
}

/** Drops blank/absent values before sending — `.partial()` on the backend schema makes a
 *  key optional (fine to omit), but most fields there are still `z.string()` (not
 *  `.nullable()`), so an explicit `''`/`null`/`undefined` would fail validation instead of
 *  being treated as "no change". Omitting the key entirely leaves that column untouched. */
function stripBlank(draft: DriverSelfUpdate): DriverSelfUpdate {
  const out: DriverSelfUpdate = {};
  for (const [key, value] of Object.entries(draft)) {
    if (value == null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    (out as Record<string, unknown>)[key] = value;
  }
  return out;
}
