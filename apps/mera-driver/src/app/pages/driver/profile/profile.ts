import { DriversApiService } from '../../../core/drivers/drivers-api.service';
import { Component, CUSTOM_ELEMENTS_SCHEMA, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { AdminPage } from '../../../admin/admin-page/admin-page';
import { DriverSelfApiService, type DriverSelf, type DriverSelfUpdate } from '../../../core/drivers/driver-self-api.service';
import { MasterListApiService, type MasterOption } from '../../../core/masters/master-list-api.service';
import { calculateProfileCompletion } from '../profile-completion';
import { Router, RouterLink } from '@angular/router';
import { PillReviewApi, PillReview, ReviewItem } from '../../../core/drivers/pill-review-api.service';
import { firstValueFrom } from 'rxjs';

type FieldKey = keyof Omit<DriverSelfUpdate, 'languages'>;
type PillRef = { tab: number; pill: number };

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
  { key: 'city', label: 'City' },
  { key: 'accountPaymentMethod', label: 'Account payment method' },
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

/** Fields rendered under "Driving Licence" vs "Experience & Skills" both belong to the
 *  same backend pill (tab 3 / pill 0) and therefore share one save action — see `save()`. */
const PILLS = { personal: { tab: 1, pill: 0 }, contact: { tab: 1, pill: 1 }, physical: { tab: 1, pill: 2 }, accountLead: { tab: 1, pill: 3 }, education: { tab: 2, pill: 0 }, health: { tab: 2, pill: 1 }, licence: { tab: 3, pill: 0 }, bank: { tab: 4, pill: 0 } } as const satisfies Record<string, PillRef>;

@Component({
  selector: 'md-driver-profile',
  imports: [AdminPage, RouterLink],
  templateUrl: './profile.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DriverProfile implements OnInit, OnDestroy {
  private readonly api = inject(DriverSelfApiService);
  private readonly mastersApi = inject(DriversApiService);
  private readonly router = inject(Router);
  private readonly reviewApi = inject(PillReviewApi);

  protected readonly pills = signal<PillReview | null>(null);
  protected readonly loading = signal(true);
  protected readonly savingKey = signal<string | null>(null);
  protected readonly savedKey = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly draft = signal<DriverSelfUpdate>({});
  protected readonly languageOptions = signal<MasterOption[]>([]);
  protected readonly selectedLanguages = signal<string[]>([]);
  protected readonly photoUrl = signal('');
  protected readonly photoFailed = signal(false);
  protected readonly uploadingPhoto = signal(false);

  /** The full last-fetched record (including `documents`) — kept separately from `draft`
   *  (the editable-fields-only subset) so profile-completion can see document/language
   *  state without the self-edit form needing to carry read-only fields around. */
  protected readonly driver = signal<DriverSelf | null>(null);
  protected readonly completion = computed(() => {
    const d = this.driver();
    return d ? calculateProfileCompletion(d) : null;
  });

  /** "Account & Lead Info" (tab 1 / pill 3) — admin-set lead/matching data. Shown read-only;
   *  never part of `FIELDS`, so there is no path for the driver to PATCH these. */
  protected readonly accountLeadItems = computed(() => this.pillItems(PILLS.accountLead));
  protected readonly dl = computed(() => this.pills()?.dl ?? null);

  pillItems(ref: PillRef): ReviewItem[] {
    return this.pills()?.pills.find(p => p.tab === ref.tab && p.pill === ref.pill)?.items ?? [];
  }

  fieldsFor(ref: PillRef) {
    const items = this.pillItems(ref);
    return FIELDS.filter(f => items.some(i => i.key === 'field:' + f.key));
  }

  fieldValue(ref: PillRef, field: string): string {
    const value = this.pillItems(ref).find(i => i.field === field)?.value;
    return this.formatValue(value);
  }

  issueFor(ref: PillRef) {
    return this.pillItems(ref).filter(i => i.status === 'Issue');
  }

  isComplete(ref: PillRef): boolean {
    return this.driver()?.completedSubSteps?.includes(ref.tab * 10 + ref.pill) ?? false;
  }

  protected readonly formatValue = (v: unknown) => v == null || v === '' || (Array.isArray(v) && !v.length) ? 'Not provided' : Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v);

  ngOnInit(): void {
    this.reviewApi.getOwn().subscribe({
      next: r => { this.pills.set(r); void this.loadPhoto(r.profile?.photo ?? null); },
      error: () => this.error.set('Unable to load onboarding pills.'),
    });
    this.mastersApi.formOptions().subscribe({
      next: (opts) => this.languageOptions.set((opts['languages'] ?? []).filter(o => o.status === 'Active').map(o => ({ ...o, status: 'Active' as const }))),
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

  ngOnDestroy(): void {
    if (this.photoUrl().startsWith('blob:')) URL.revokeObjectURL(this.photoUrl());
  }

  protected setField(key: FieldKey, value: string): void {
    this.draft.update((d) => ({ ...d, [key]: key==='dlNo'?value.replace(/[\s-]/g,'').toUpperCase():value }));
  }

  protected toggleLanguage(name: string): void {
    this.selectedLanguages.update((langs) =>
      langs.includes(name) ? langs.filter((l) => l !== name) : [...langs, name],
    );
  }

  protected initials(): string {
    const d = this.driver();
    return d ? `${d.firstName?.[0] ?? ''}${d.lastName?.[0] ?? ''}`.toUpperCase() || '?' : '?';
  }

  /** Same authenticated-blob pattern as the shared KYC pill-review photo preview. */
  private async loadPhoto(photo: string | null): Promise<void> {
    this.photoFailed.set(false);
    if (!photo) return;
    if (photo.startsWith('data:image/')) { this.photoUrl.set(photo); return; }
    if (!photo.startsWith('/uploads/drivers/')) { this.photoFailed.set(true); return; }
    try {
      // `photo` is already percent-encoded by the backend; `preview()` encodes its input
      // itself, so decode first or a space ("%20") becomes "%2520" and 404s.
      const blob = await firstValueFrom(this.reviewApi.preview(decodeURIComponent(photo.slice('/uploads/'.length))));
      this.photoUrl.set(URL.createObjectURL(blob));
    } catch {
      this.photoFailed.set(true);
    }
  }

  protected async onPhotoSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    (event.target as HTMLInputElement).value = '';
    if (!file) return;
    this.uploadingPhoto.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.uploadDocument('personal', 'Profile Photo', '', file));
      const [driver, review] = await Promise.all([firstValueFrom(this.api.get()), firstValueFrom(this.reviewApi.getOwn())]);
      this.driver.set(driver);
      this.pills.set(review);
      if (this.photoUrl().startsWith('blob:')) URL.revokeObjectURL(this.photoUrl());
      this.photoUrl.set('');
      await this.loadPhoto(review.profile?.photo ?? null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not update the profile photo.');
    } finally {
      this.uploadingPhoto.set(false);
    }
  }

  protected save(ref: PillRef, complete = false): void {
    const key = `${ref.tab}-${ref.pill}`;
    this.savingKey.set(key);
    this.error.set(null);
    const fields: DriverSelfUpdate = {};
    for (const f of this.fieldsFor(ref)) (fields as Record<string, unknown>)[f.key] = this.draft()[f.key];
    if (ref.tab === 1 && ref.pill === 0) fields.languages = this.selectedLanguages();
    const licence=fields.dlNo;const original=this.driver()?.dlNo;
    if(licence && licence!==original && licence.replace(/[\s-]/g,'').toUpperCase()!==original?.replace(/[\s-]/g,'').toUpperCase()&&!/^[A-Z]{2}\d{13}$/.test(licence)){this.error.set('Enter 15 characters: two letters followed by 13 digits, e.g. UP3220210123456.');this.savingKey.set(null);return;}
    this.api.savePill(ref.tab, ref.pill, complete, stripBlank(fields)).subscribe({
      next: (d) => {
        this.driver.set(d);
        this.draft.set(toDraft(d));
        this.selectedLanguages.set(d.languages ?? []);
        this.savingKey.set(null);
        this.savedKey.set(key);
        this.reviewApi.getOwn().subscribe({ next: r => this.pills.set(r) });
        setTimeout(() => this.savedKey.set(null), 2000);
      },
      error: (err) => {
        this.savingKey.set(null);
        this.error.set(err?.message ?? 'Failed to save. Please try again.');
      },
    });
  }

  protected go(path: string): void {
    this.router.navigateByUrl(path);
  }

  protected readonly PILLS = PILLS;
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
