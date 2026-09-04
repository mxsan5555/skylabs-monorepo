import { signAccessToken, type AccessTokenPayload } from '../lib/jwt';

/** Builds a real, verifiable Bearer header for a fake user with the given roles (jwtSecret comes from .env.local — no mocking needed for authenticate/verifyAccessToken). */
export function bearerFor(payload: Partial<AccessTokenPayload> & { sub?: string } = {}): string {
  const token = signAccessToken({
    sub: payload.sub ?? 'test-user-id',
    roles: payload.roles ?? [],
    app: 'msd',
    ...(payload.isPreview ? { isPreview: payload.isPreview, impersonatedBy: payload.impersonatedBy } : {}),
  });
  return `Bearer ${token}`;
}
