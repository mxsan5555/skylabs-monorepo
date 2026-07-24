/** Identifies an anonymous cart to the API (X-Guest-Token header) until the user signs
 *  in — mirrors auth-storage.ts's token pattern. Ignored server-side once a bearer
 *  token is present, so it's harmless to keep sending after sign-in. */
export const GUEST_TOKEN_KEY = 'msd_guest_cart_token';

export function readGuestToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(GUEST_TOKEN_KEY);
}

export function writeGuestToken(token: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (token) localStorage.setItem(GUEST_TOKEN_KEY, token);
  else localStorage.removeItem(GUEST_TOKEN_KEY);
}
