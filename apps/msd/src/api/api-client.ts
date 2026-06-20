/**
 * Minimal fetch-based API client for msd.
 *
 * Reads the base URL from VITE_API_URL (falls back to /api) and attaches the
 * stored bearer token. Pages/features call apiClient.get/post instead of using
 * fetch directly, so auth and error handling stay in one place.
 */

import { AUTH_TOKEN_KEY } from '../auth/auth-storage';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'https://donated-blast-government-guide.trycloudflare.com/api';

function authHeaders(): Record<string, string> {
  const token =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem(AUTH_TOKEN_KEY)
      : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
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
    throw new Error(`API ${method} ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
