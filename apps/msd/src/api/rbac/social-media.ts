import { apiDelete, apiGet, apiPatch, apiPost } from './client';

/** Mirrors msd-api's `SocialMediaLink` model — no separate `/status` route (unlike
 *  Category/Faq): `isActive` is a plain field on the same `PATCH /social-media/{id}` route as
 *  every other field. `platform` is free text (facebook/instagram/youtube/linkedin/x/whatsapp/
 *  other/...) — the frontend maps known keys to a fixed option list with a free-text fallback. */
export interface SocialMediaLink {
  id: string;
  platform: string;
  displayName: string;
  url: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SocialMediaLinkInput {
  platform: string;
  displayName: string;
  url: string;
  sortOrder: number;
  isActive?: boolean;
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

export function listSocialMediaLinks(
  token: string | null,
  opts: { page?: number; pageSize?: number; search?: string } = {},
) {
  return apiGet<SocialMediaLink[]>(`/social-media${toQuery(opts)}`, token);
}

export function getSocialMediaLink(token: string | null, id: string) {
  return apiGet<SocialMediaLink>(`/social-media/${id}`, token);
}

export function createSocialMediaLink(token: string | null, input: SocialMediaLinkInput) {
  return apiPost<SocialMediaLink>('/social-media', token, input);
}

export function updateSocialMediaLink(token: string | null, id: string, input: Partial<SocialMediaLinkInput>) {
  return apiPatch<SocialMediaLink>(`/social-media/${id}`, token, input);
}

export function deleteSocialMediaLink(token: string | null, id: string) {
  return apiDelete<null>(`/social-media/${id}`, token);
}
