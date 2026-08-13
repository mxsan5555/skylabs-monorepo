/**
 * Thin fetch wrapper around msd-api's `ApiEnvelope<T>` response shape
 * (`{ data, error, meta }` — see `@skylabs-monorepo/shared-types`).
 *
 * All API calls in this app go through `apps/msd-admin/src/api/*` — never
 * fetch directly in a component/page.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL;

export interface ApiMeta {
  total?: number;
  page?: number;
  pageSize?: number;
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

async function request<T>(
  path: string,
  token: string | null,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  let body: EnvelopeShape<T> | null = null;
  try {
    body = (await res.json()) as EnvelopeShape<T>;
  } catch {
    // Empty/non-JSON body (e.g. a proxy error page) — fall through to the generic error below.
  }

  if (!res.ok || body?.error) {
    throw new ApiRequestError(
      body?.error?.code ?? 'UNKNOWN',
      body?.error?.message ?? `Request failed with status ${res.status}`,
      res.status,
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

export function apiDelete<T>(path: string, token: string | null): Promise<ApiResult<T>> {
  return request<T>(path, token, { method: 'DELETE' });
}
