import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { AuthService } from '@skylabs-monorepo/shared-auth/angular';
import { AccountApiService } from './account-api.service';
import type { AccountProfile, Address } from '../../models';

const ADDRESSES_STORAGE_KEY = 'mera_account_addresses';

const SEED_ADDRESSES: Address[] = [
  {
    id: 'seed-1',
    label: 'Home',
    line1: '12 Ride St',
    line2: 'Apt 4B',
    city: 'Austin',
    state: 'TX',
    postalCode: '73301',
    country: 'USA',
  },
];

/**
 * Account store for mera-driver: the signed-in user's profile (name/email/phone) is
 * real data from `GET/PATCH /rbac/users/me` — the same `User` row every authenticated
 * role shares, ownership-resolved server-side from the JWT. Saved addresses have no
 * backend model (out of scope here — this app's `User`/`Driver` schema has no address
 * book table), so they remain a local-only convenience, unchanged from before.
 */
@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly api = inject(AccountApiService);
  private readonly auth = inject(AuthService);

  private readonly _profile = signal<AccountProfile>({ name: '', email: '', phone: '' });
  private readonly _loading = signal<boolean>(true);
  private readonly _addresses = signal<Address[]>(loadAddresses());

  readonly profile = this._profile.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly addresses = computed(() => this._addresses());

  constructor() {
    this.refresh();
  }

  refresh(): void {
    this._loading.set(true);
    this.api.get().subscribe({
      next: (p) => {
        this._profile.set(p);
        this._loading.set(false);
      },
      error: () => this._loading.set(false),
    });
  }

  /** Saves to the backend, updates local state from the server's response (not the raw
   *  patch — so it reflects exactly what was persisted), and refreshes the shared
   *  bootstrap so the sidebar's name/email stay in sync immediately. */
  updateProfile(patch: Partial<AccountProfile>): Observable<AccountProfile> {
    return this.api.update(patch).pipe(
      tap((p) => {
        this._profile.set(p);
        void this.auth.refreshBootstrap();
      }),
    );
  }

  addAddress(address: Omit<Address, 'id'>): void {
    this.persistAddresses([...this._addresses(), { ...address, id: newId() }]);
  }

  updateAddress(id: string, patch: Omit<Address, 'id'>): void {
    this.persistAddresses(this._addresses().map((a) => (a.id === id ? { ...patch, id } : a)));
  }

  removeAddress(id: string): void {
    this.persistAddresses(this._addresses().filter((a) => a.id !== id));
  }

  private persistAddresses(next: Address[]): void {
    this._addresses.set(next);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ADDRESSES_STORAGE_KEY, JSON.stringify(next));
    }
  }
}

function loadAddresses(): Address[] {
  if (typeof localStorage === 'undefined') return SEED_ADDRESSES;
  try {
    const raw = localStorage.getItem(ADDRESSES_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Address[]) : SEED_ADDRESSES;
  } catch {
    return SEED_ADDRESSES;
  }
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}
