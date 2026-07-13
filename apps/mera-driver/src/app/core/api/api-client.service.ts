import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

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

/**
 * Thin wrapper over HttpClient for mera-driver. Centralises the API base URL
 * (from environment.apiUrl); the auth header is added by authInterceptor.
 * Services call this instead of HttpClient directly so the base URL and error
 * shape stay in one place.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  get<T>(path: string): Observable<T> {
    return this.http.get<T>(`${this.base}${path}`).pipe(catchError(toApiError));
  }

  post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(`${this.base}${path}`, body).pipe(catchError(toApiError));
  }

  put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<T>(`${this.base}${path}`, body).pipe(catchError(toApiError));
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(`${this.base}${path}`).pipe(catchError(toApiError));
  }
}

function toApiError(err: HttpErrorResponse) {
  const body = err.error as { error?: string; retryAfterSeconds?: number } | null;
  return throwError(() => new ApiError(err.status, body?.error ?? 'unknown_error', body?.retryAfterSeconds));
}
