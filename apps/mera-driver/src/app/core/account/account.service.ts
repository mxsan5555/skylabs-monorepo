import { Injectable, computed, signal } from '@angular/core';
import type { AccountProfile, Address } from '../../models';

interface AccountState {
  profile: AccountProfile;
  addresses: Address[];
}

const STORAGE_KEY = 'mera_account';

const SEED: AccountState = {
  profile: { name: 'John Doe', email: 'john@example.com', phone: '+1 555 0100' },
  addresses: [
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
  ],
};

/**
 * Account store for mera-driver: the signed-in user's profile + saved addresses,
 * persisted to localStorage. Stands in for the profile API until the backend
 * exists; the profile page and the sidebar both read it via signals.
 */
@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly state = signal<AccountState>(load());

  readonly profile = computed(() => this.state().profile);
  readonly addresses = computed(() => this.state().addresses);

  updateProfile(patch: Partial<AccountProfile>): void {
    const s = this.state();
    this.persist({ ...s, profile: { ...s.profile, ...patch } });
  }

  addAddress(address: Omit<Address, 'id'>): void {
    const s = this.state();
    this.persist({
      ...s,
      addresses: [...s.addresses, { ...address, id: newId() }],
    });
  }

  updateAddress(id: string, patch: Omit<Address, 'id'>): void {
    const s = this.state();
    this.persist({
      ...s,
      addresses: s.addresses.map((a) => (a.id === id ? { ...patch, id } : a)),
    });
  }

  removeAddress(id: string): void {
    const s = this.state();
    this.persist({ ...s, addresses: s.addresses.filter((a) => a.id !== id) });
  }

  private persist(next: AccountState): void {
    this.state.set(next);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  }
}

function load(): AccountState {
  if (typeof localStorage === 'undefined') return SEED;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AccountState) : SEED;
  } catch {
    return SEED;
  }
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}
