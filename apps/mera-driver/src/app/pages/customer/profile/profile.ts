import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, inject, signal } from '@angular/core';
import { AdminPage } from '../../../admin/admin-page/admin-page';
import { CustomerSelfApiService, type CustomerSelf, type CustomerSelfUpdate } from '../../../core/customers/customer-self-api.service';

type FieldKey = keyof CustomerSelfUpdate;

/** One source of truth for the self-edit form — add a field by extending this. Mirrors the
 *  Driver self-service profile form's `FIELDS`-table pattern. */
const FIELDS: { key: FieldKey; label: string; type?: string; span2?: boolean }[] = [
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'mobileNumber', label: 'Mobile number', type: 'tel' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'alternatePhone', label: 'Alternate phone', type: 'tel' },
  { key: 'dateOfBirth', label: 'Date of birth', type: 'date' },
  { key: 'gender', label: 'Gender' },
  { key: 'customerType', label: 'Customer type' },
  { key: 'addressLine1', label: 'Address line 1', span2: true },
  { key: 'addressLine2', label: 'Address line 2', span2: true },
  { key: 'pincode', label: 'Pincode' },
];

@Component({
  selector: 'md-customer-profile',
  imports: [AdminPage],
  templateUrl: './profile.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class CustomerProfile implements OnInit {
  private readonly api = inject(CustomerSelfApiService);

  protected readonly fields = FIELDS;
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly draft = signal<CustomerSelfUpdate>({});

  ngOnInit(): void {
    this.api.get().subscribe({
      next: (c) => {
        this.draft.set(toDraft(c));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected setField(key: FieldKey, value: string): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  protected save(): void {
    this.saving.set(true);
    this.error.set(null);
    // Omit blank fields rather than sending `""` — same reasoning as the Driver self-service
    // profile form: `.partial()` makes a field optional (omit is fine), not "empty string is
    // valid" for fields with their own format validation (e.g. `email`).
    this.api.update(stripBlank(this.draft())).subscribe({
      next: (c) => {
        this.draft.set(toDraft(c));
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

/** Builds the editable draft by picking exactly the known `FIELDS` keys off the fetched
 *  record — NOT a `{...rest}` spread, same reasoning as the Driver profile form: the real
 *  `/customers/me` response includes staff-only fields (`verificationStatus`,
 *  `accountStatus`) that must never round-trip into a self-service PATCH payload. */
function toDraft(c: CustomerSelf): CustomerSelfUpdate {
  const out: CustomerSelfUpdate = {};
  for (const f of FIELDS) {
    (out as Record<string, unknown>)[f.key] = (c as unknown as Record<string, unknown>)[f.key] ?? '';
  }
  return out;
}

function stripBlank(draft: CustomerSelfUpdate): CustomerSelfUpdate {
  const out: CustomerSelfUpdate = {};
  for (const [key, value] of Object.entries(draft)) {
    if (value == null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    (out as Record<string, unknown>)[key] = value;
  }
  return out;
}
