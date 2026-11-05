import type { Request } from 'express';
import { resolveEffectivePermissionsForUser } from '../services/permission.service';

async function granted(req: Request): Promise<Set<string>> {
  return new Set(await resolveEffectivePermissionsForUser(req.user!.sub, req.user!.roles));
}

/** Scope is independent of Create: staff management never becomes global when an
 * action is revoked. Core administrators retain their existing business scope; all
 * other staff use stored ownership. Support assignment links are not modelled yet. */
export async function driverOwnerScope(req: Request): Promise<string | null> {
  const perms = await granted(req);
  if (!req.user!.roles.some(role=>['admin','super_admin'].includes(role)) && req.user!.roles.some(role=>['vendor','sales','data_operator'].includes(role))) return req.user!.sub;
  if (req.user!.roles.some(key => ['admin','super_admin'].includes(key))) return null;
  // Revoking creation must never turn an ownership-scoped role into a global reader.
  if (req.user!.roles.some(role => ['vendor','sales','data_operator'].includes(role))) return req.user!.sub;
  return req.user!.sub;
}

export type BookingOwnerScope =
  | { mode: 'unscoped' }
  | { mode: 'own'; ownerUserId: string }
  | { mode: 'via-owned-drivers'; ownerUserId: string };

/** Preserve Company/Sales ownership and Vendor's relation through owned drivers.
 * Other roles conservatively use supported ownership rather than an Admin fallback. */
export async function bookingOwnerScope(req: Request): Promise<BookingOwnerScope> {
  const perms = await granted(req);
  if (!req.user!.roles.some(role=>['admin','super_admin'].includes(role))) {
    if(req.user!.roles.some(role=>['company','sales'].includes(role)))return {mode:'own',ownerUserId:req.user!.sub};
    if(req.user!.roles.includes('vendor'))return {mode:'via-owned-drivers',ownerUserId:req.user!.sub};
  }
  if (req.user!.roles.some(key => ['admin','super_admin'].includes(key))) return { mode: 'unscoped' };
  if (req.user!.roles.some(role => ['company','sales'].includes(role))) return {mode:'own',ownerUserId:req.user!.sub};
  if (req.user!.roles.includes('vendor')) return {mode:'via-owned-drivers',ownerUserId:req.user!.sub};
  if (perms.has('trips.bookings:create')) return { mode: 'own', ownerUserId: req.user!.sub };
  if (perms.has('drivers:create')) return { mode: 'via-owned-drivers', ownerUserId: req.user!.sub };
  return { mode: 'own', ownerUserId: req.user!.sub };
}

/** Customer self-service uses resolveOwnCustomer; this scope is for staff management only. */
export function customerOwnerScope(req: Request): string | null {
  return req.user!.roles.some(key => ['admin', 'super_admin'].includes(key)) ? null : req.user!.sub;
}
