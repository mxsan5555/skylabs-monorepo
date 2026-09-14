import { apiGet, apiPatch } from './client';
import type { MediaImage } from '../media';
import type { BlogBlock } from './blog-posts';

/** About Us is a singleton row (`id` is always the literal string `"singleton"` — see
 *  msd-api's `AboutUsContent` schema doc comment). There is no create step; every save is a
 *  PATCH against the one saved row. */
export interface AboutUsContent {
  id: string;
  heroTitle: string;
  heroSubtitle: string;
  missionStatement: string;
  body: BlogBlock[];
  metaTitle?: string | null;
  metaDescription?: string | null;
  updatedAt: string;
  /** Populated by `GET /about-us` (see `apps/msd/src/api/media.ts`'s `'about-us'` entity type +
   *  `MediaUploader`) — empty/undefined for a fresh instance with no hero image uploaded yet. */
  mediaImages?: MediaImage[];
}

export interface AboutUsInput {
  heroTitle?: string;
  heroSubtitle?: string;
  missionStatement?: string;
  body?: BlogBlock[];
  metaTitle?: string;
  metaDescription?: string;
}

export interface SocialLink {
  platform: string;
  url: string;
}

/** Same singleton-row convention as `AboutUsContent` above — no media relation (a contact page
 *  has no gallery need, see msd-api's `ContactUsContent` schema doc comment). */
export interface ContactUsContent {
  id: string;
  address: string;
  phone: string;
  email: string;
  mapEmbedUrl: string;
  socialLinks: SocialLink[];
  metaTitle?: string | null;
  metaDescription?: string | null;
  updatedAt: string;
}

export interface ContactUsInput {
  address?: string;
  phone?: string;
  email?: string;
  mapEmbedUrl?: string;
  socialLinks?: SocialLink[];
  metaTitle?: string;
  metaDescription?: string;
}

export function getAboutUs(token: string | null) {
  return apiGet<AboutUsContent>('/about-us', token);
}

export function updateAboutUs(token: string | null, input: AboutUsInput) {
  return apiPatch<AboutUsContent>('/about-us', token, input);
}

export function getContactUs(token: string | null) {
  return apiGet<ContactUsContent>('/contact-us', token);
}

export function updateContactUs(token: string | null, input: ContactUsInput) {
  return apiPatch<ContactUsContent>('/contact-us', token, input);
}
