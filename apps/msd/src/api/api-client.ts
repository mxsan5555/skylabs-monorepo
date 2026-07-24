/**
 * Minimal fetch-based API client for msd.
 *
 * Reads the base URL from VITE_API_URL (falls back to /api) and attaches the
 * stored bearer token. Pages/features call apiClient.get/post instead of using
 * fetch directly, so auth and error handling stay in one place.
 */

import { AUTH_TOKEN_KEY } from '../auth/auth-storage';
import { GUEST_TOKEN_KEY } from '../cart/guest-token';

export const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

/** Thrown on a non-2xx response; carries the backend's `{ error, retryAfterSeconds? }` body. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
}

function authHeaders(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (token) return { Authorization: `Bearer ${token}` };
  // No bearer token yet — send the guest cart token if we have one; the API
  // ignores it once a real session exists (see optional-auth.ts server-side).
  const guestToken = localStorage.getItem(GUEST_TOKEN_KEY);
  return guestToken ? { 'X-Guest-Token': guestToken } : {};
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.error ?? 'unknown_error', data.retryAfterSeconds);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
};
