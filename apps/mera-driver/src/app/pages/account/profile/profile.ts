import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { AdminPage } from '../../../admin/admin-page/admin-page';
import { AccountService } from '../../../core/account/account.service';
import type { Address } from '../../../models';

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

/** My Account: edit email/phone and manage saved addresses (full CRUD). */
@Component({
  selector: 'md-account-profile',
  imports: [AdminPage],
  templateUrl: './profile.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Profile {
  protected readonly account = inject(AccountService);

  protected email = this.account.profile().email;
  protected phone = this.account.profile().phone;
  protected readonly saved = signal(false);

  protected readonly editingId = signal<string | 'new' | null>(null);
  protected readonly draft = signal<Draft>({ ...EMPTY });
  protected readonly addressFields = ADDRESS_FIELDS;

  protected saveProfile(): void {
    this.account.updateProfile({ email: this.email, phone: this.phone });
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 2000);
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
