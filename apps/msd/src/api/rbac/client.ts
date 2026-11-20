/**
 * Thin fetch wrapper around msd-api's `ApiEnvelope<T>` response shape
 * (`{ data, error, meta }` — see `@skylabs-monorepo/shared-types`).
 *
 * All API calls in this app go through `apps/msd-admin/src/api/*` — never
 * fetch directly in a component/page.
 */
import { getTokenStore } from '@skylabs-monorepo/shared-auth/react';

const API_BASE_URL = import.meta.env.VITE_API_URL;

// Lazy: `getTokenStore` touches storage/`window` as soon as it runs, so calling it eagerly at
// module scope breaks any test that mocks `@skylabs-monorepo/shared-auth/react` without also
// stubbing it. `getTokenStore` already memoizes per `appPrefix`, so deferring to first use returns
// the same singleton — this only changes when it's constructed, not what it is.
let tokenStore: ReturnType<typeof getTokenStore> | null = null;
function getStore(): ReturnType<typeof getTokenStore> {
  return (tokenStore ??= getTokenStore('msd', API_BASE_URL));
}

export interface ApiMeta {
  total?: number;
  page?: number;
  pageSize?: number;
  unreadCount?: number;
}

export interface ApiResult<T> {
  data: T;
  meta?: ApiMeta;
}

export class ApiRequestError extends Error {
  code: string;
  details?: unknown;
  status: number;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

interface EnvelopeShape<T> {
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
  meta?: ApiMeta;
}

async function doFetch<T>(
  path: string,
  token: string | null,
  init: RequestInit,
): Promise<{ response: Response; body: EnvelopeShape<T> | null }> {
  // FormData bodies (multipart file uploads) must never get a hardcoded JSON Content-Type — the
  // browser sets its own `multipart/form-data; boundary=...` header, which fetch only does
  // automatically when no Content-Type is set at all.
  const isFormData = init.body instanceof FormData;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    // This wrapper expects a JSON envelope. A browser-generated 304 has no body and
    // `Response.ok` is false, so revalidation can incorrectly turn a valid GET into an error.
    ...(init.method?.toUpperCase() === 'GET' ? { cache: 'no-store' as const } : {}),
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  let body: EnvelopeShape<T> | null = null;
  try {
    body = (await response.json()) as EnvelopeShape<T>;
  } catch {
    // Empty/non-JSON body (e.g. a proxy error page) — fall through to the generic error below.
  }
  return { response, body };
}

async function request<T>(
  path: string,
  token: string | null,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  let { response, body } = await doFetch<T>(path, token, init);

  if (response.status === 401 && body?.error?.code === 'UNAUTHORIZED' && token) {
    const refreshed = await getStore().refresh().catch(() => null);
    if (refreshed) {
      ({ response, body } = await doFetch<T>(path, refreshed, init));
    }
  }

  if (!response.ok || body?.error) {
    throw new ApiRequestError(
      body?.error?.code ?? 'UNKNOWN',
      body?.error?.message ?? `Request failed with status ${response.status}`,
      response.status,
      body?.error?.details,
    );
  }

  return { data: body?.data as T, meta: body?.meta };
}

export function apiGet<T>(path: string, token: string | null): Promise<ApiResult<T>> {
  return request<T>(path, token, { method: 'GET' });
}

export function apiPost<T>(path: string, token: string | null, body?: unknown): Promise<ApiResult<T>> {
  return request<T>(path, token, {
    method: 'POST',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** For multipart file uploads (the media-upload system) — `formData` is sent as-is, never
 *  JSON.stringify'd, and the browser sets its own Content-Type boundary (see `request`'s
 *  `isFormData` check above). */
export function apiPostForm<T>(path: string, token: string | null, formData: FormData): Promise<ApiResult<T>> {
  return request<T>(path, token, { method: 'POST', body: formData });
}

export function apiPatch<T>(path: string, token: string | null, body?: unknown): Promise<ApiResult<T>> {
  return request<T>(path, token, {
    method: 'PATCH',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function apiPut<T>(path: string, token: string | null, body?: unknown): Promise<ApiResult<T>> {
  return request<T>(path, token, {
    method: 'PUT',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function apiDelete<T>(path: string, token: string | null, body?: unknown): Promise<ApiResult<T>> {
  return request<T>(path, token, {
    method: 'DELETE',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
