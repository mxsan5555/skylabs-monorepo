import { apiGet, apiPatch } from './client';
import type { UserRecord } from './users';

export interface MyProfileUpdateInput {
  name?: string;
  email?: string;
  phone?: string;
}

/** The caller's own row plus their saved delivery address (item 2.2, D37); null until saved. */
export interface MyProfile extends UserRecord {
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
}

/** The caller's own user row + roles — works for every authenticated user (Superadmin included),
 *  no `rbac.users:*` permission needed. See `GET /rbac/users/me`'s own doc comment. */
export function getMyProfile(token: string | null) {
  return apiGet<MyProfile>('/rbac/users/me', token);
}

/** Only ever accepts `name`/`email`/`phone` — there is no `role`/`roleIds` field on this endpoint
 *  at all, so a caller (Superadmin included) can never change their own role through it. */
export function updateMyProfile(token: string | null, input: MyProfileUpdateInput) {
  return apiPatch<UserRecord>('/rbac/users/me', token, input);
}
