import { Component, CUSTOM_ELEMENTS_SCHEMA, effect, inject, signal } from '@angular/core';
import { AdminPage } from '../../../admin/admin-page/admin-page';
import { AccountService } from '../../../core/account/account.service';
import type { AccountProfile, Address } from '../../../models';

type Draft = Omit<Address, 'id'>;

const EMPTY: Draft = {
  label: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
};

/** One source of truth for the address form — add a field by extending this. */
const ADDRESS_FIELDS: { key: keyof Draft; label: string; span2?: boolean }[] = [
  { key: 'label', label: 'Label (e.g. Home, Work)', span2: true },
  { key: 'line1', label: 'Address line 1', span2: true },
  { key: 'line2', label: 'Address line 2', span2: true },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'postalCode', label: 'Postal code' },
  { key: 'country', label: 'Country' },
];

/**
 * My Account: edit name/email/phone (the same `User` row every authenticated role —
 * Super Admin down to Support/KYC Verification — shares) and manage saved addresses
 * (local-only, no backend model for those). Reachable by any signed-in user; not
 * gated behind a permission (see `app.routes.spec.ts`'s "does not gate the profile
 * route" check).
 */
@Component({
  selector: 'md-account-profile',
  imports: [AdminPage],
  templateUrl: './profile.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Profile {
  protected readonly account = inject(AccountService);

  protected readonly draftProfile = signal<AccountProfile>({ name: '', email: '', phone: '' });
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly editingId = signal<string | 'new' | null>(null);
  protected readonly draft = signal<Draft>({ ...EMPTY });
  protected readonly addressFields = ADDRESS_FIELDS;

  constructor() {
    // The profile loads asynchronously (real `GET /rbac/users/me`) — mirror it into the
    // editable draft whenever it arrives or changes, rather than capturing a one-time
    // snapshot at construction (which would race the HTTP call and freeze on `''`).
    effect(() => this.draftProfile.set({ ...this.account.profile() }));
  }

  protected setProfileField(key: keyof AccountProfile, value: string): void {
    this.draftProfile.update((p) => ({ ...p, [key]: value }));
    this.saved.set(false);
  }

  protected saveProfile(): void {
    this.saving.set(true);
    this.error.set(null);
    this.account.updateProfile(this.draftProfile()).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.set(true);
        setTimeout(() => this.saved.set(false), 2000);
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(err?.message || 'Failed to save your profile. Please try again.');
      },
    });
  }

  protected startAdd(): void {
    this.draft.set({ ...EMPTY });
    this.editingId.set('new');
  }

  protected startEdit(a: Address): void {
    const { id: _, ...rest } = a;
    this.draft.set({ line2: '', ...rest });
    this.editingId.set(a.id);
  }

  protected setDraft(key: keyof Draft, value: string): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  protected submit(): void {
    const id = this.editingId();
    if (id === 'new') this.account.addAddress(this.draft());
    else if (id) this.account.updateAddress(id, this.draft());
    this.editingId.set(null);
  }
}
