import { Injectable, computed, inject, signal, effect } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { AuthService } from '@skylabs-monorepo/shared-auth/angular';
import { AccountApiService } from './account-api.service';
import type { AccountProfile, Address } from '../../models';

const ADDRESSES_STORAGE_KEY = 'mera_account_addresses';

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
  private readonly _addresses = signal<Address[]>([]);

  readonly profile = this._profile.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly addresses = computed(() => this._addresses());

  constructor() {
    effect(() => {
      const id = this.auth.bootstrap()?.user.id ?? null;
      this._profile.set({name:'',email:'',phone:''});
      this._addresses.set(id ? loadAddresses(ADDRESSES_STORAGE_KEY + ':' + id) : []);
      if(id) this.refresh(); else this._loading.set(false);
    });
  }

  refresh(): void {
    const userId = this.auth.bootstrap()?.user.id;
    this._loading.set(true);
    this.api.get().subscribe({
      next: (p) => {
        if(this.auth.bootstrap()?.user.id !== userId) return;
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
    const userId = this.auth.bootstrap()?.user.id;
    return this.api.update(patch).pipe(
      tap((p) => {
        if(this.auth.bootstrap()?.user.id !== userId) return;
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
      const id = this.auth.bootstrap()?.user.id;
      if(id) localStorage.setItem(ADDRESSES_STORAGE_KEY + ':' + id, JSON.stringify(next));
    }
  }
}

function loadAddresses(key: string): Address[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Address[]) : [];
  } catch {
    return [];
  }
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}
