import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AccountProfile, Address } from '../types';

/**
 * Account store for msd: the signed-in user's profile (name/email/phone) and
 * their saved addresses, persisted to localStorage. Stands in for the profile
 * API until the backend exists; the profile page and the sidebar both read it.
 */
interface AccountState {
  profile: AccountProfile;
  addresses: Address[];
}

interface AccountContextValue extends AccountState {
  updateProfile: (patch: Partial<AccountProfile>) => void;
  addAddress: (address: Omit<Address, 'id'>) => void;
  updateAddress: (id: string, patch: Omit<Address, 'id'>) => void;
  removeAddress: (id: string) => void;
}

const STORAGE_KEY = 'msd_account';

const SEED: AccountState = {
  profile: { name: 'John Doe', email: 'john@example.com', phone: '+1 555 0100' },
  addresses: [
    {
      id: 'seed-1',
      label: 'Home',
      line1: '12 Wellness Ave',
      line2: 'Apt 4B',
      city: 'Austin',
      state: 'TX',
      postalCode: '73301',
      country: 'USA',
    },
  ],
};

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

const AccountContext = createContext<AccountContextValue | undefined>(undefined);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccountState>(() => load());

  // Persist whenever state changes (kept out of the updaters so they stay pure).
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [state]);

  // Functional updates → these callbacks are stable (no `state` dependency),
  // so consumers don't re-render just because the store updated.
  const updateProfile = useCallback(
    (patch: Partial<AccountProfile>) =>
      setState((s) => ({ ...s, profile: { ...s.profile, ...patch } })),
    [],
  );

  const addAddress = useCallback(
    (address: Omit<Address, 'id'>) =>
      setState((s) => ({
        ...s,
        addresses: [...s.addresses, { ...address, id: newId() }],
      })),
    [],
  );

  const updateAddress = useCallback(
    (id: string, patch: Omit<Address, 'id'>) =>
      setState((s) => ({
        ...s,
        addresses: s.addresses.map((a) => (a.id === id ? { ...patch, id } : a)),
      })),
    [],
  );

  const removeAddress = useCallback(
    (id: string) =>
      setState((s) => ({
        ...s,
        addresses: s.addresses.filter((a) => a.id !== id),
      })),
    [],
  );

  const value = useMemo<AccountContextValue>(
    () => ({
      ...state,
      updateProfile,
      addAddress,
      updateAddress,
      removeAddress,
    }),
    [state, updateProfile, addAddress, updateAddress, removeAddress],
  );

  return (
    <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
  );
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccount must be used within <AccountProvider>');
  return ctx;
}
