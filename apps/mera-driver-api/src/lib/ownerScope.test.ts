import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request } from 'express';

vi.mock('../services/permission.service', () => ({ resolveEffectivePermissionsForUser: vi.fn() }));
import { resolveEffectivePermissionsForUser } from '../services/permission.service';
import { driverOwnerScope, bookingOwnerScope } from './ownerScope';

function reqWith(perms: string[]): Request {
  (resolveEffectivePermissionsForUser as ReturnType<typeof vi.fn>).mockResolvedValue(perms);
  return { user: { sub: 'caller-1', roles: ['custom_role'] } } as unknown as Request;
}

beforeEach(() => vi.clearAllMocks());

describe('driverOwnerScope', () => {
  it('does not let assignment authority broaden a Vendor-only account scope',async()=>{const req=reqWith(['drivers:view','drivers:assign']);req.user!.roles=['vendor'];expect(await driverOwnerScope(req)).toBe('caller-1');});
  it.each(['vendor','sales','data_operator'])('retains %s ownership after create permission is revoked',async role=>{
    const req=reqWith(['drivers:view']);req.user!.roles=[role];expect(await driverOwnerScope(req)).toBe('caller-1');
  });
  it('is unscoped (null) for a caller holding drivers:assign — Admin/Super Admin', async () => {
    const req=reqWith(['drivers:view', 'drivers:assign']);req.user!.roles=['admin'];expect(await driverOwnerScope(req)).toBeNull();
  });
  it('is unscoped (null) for a caller with view-only access and no creation step — Support', async () => {
    const req=reqWith(['drivers:view']);req.user!.roles=['support'];expect(await driverOwnerScope(req)).toBe('caller-1');
  });
  it('scopes to the caller\'s own id for a creator role without drivers:assign — Vendor/Sales/Data Operator', async () => {
    expect(await driverOwnerScope(reqWith(['drivers:view', 'drivers:create', 'drivers:edit']))).toBe('caller-1');
  });
});

describe('bookingOwnerScope', () => {
  it('does not let assignment authority broaden a Company-only account scope',async()=>{const req=reqWith(['trips.bookings:view','drivers:assign']);req.user!.roles=['company'];expect(await bookingOwnerScope(req)).toEqual({mode:'own',ownerUserId:'caller-1'});});
  it.each(['company','sales','vendor'])('retains %s booking ownership after create permission is revoked',async role=>{
    const req=reqWith(['trips.bookings:view']);req.user!.roles=[role];expect(await bookingOwnerScope(req)).toEqual({mode:role==='vendor'?'via-owned-drivers':'own',ownerUserId:'caller-1'});
  });
  it('is unscoped for Admin/Super Admin (drivers:assign)', async () => {
    const req=reqWith(['drivers:assign', 'trips.bookings:view']);req.user!.roles=['admin'];expect(await bookingOwnerScope(req)).toEqual({ mode: 'unscoped' });
  });
  it('scopes to "own" for a caller who creates bookings directly — Company/Sales', async () => {
    expect(await bookingOwnerScope(reqWith(['trips.bookings:view', 'trips.bookings:create']))).toEqual({ mode: 'own', ownerUserId: 'caller-1' });
  });
  it('scopes transitively via owned drivers for a caller who only views bookings but creates drivers — Vendor', async () => {
    expect(await bookingOwnerScope(reqWith(['trips.bookings:view', 'drivers:create']))).toEqual({ mode: 'via-owned-drivers', ownerUserId: 'caller-1' });
  });
  it('is unscoped when neither booking-creation nor driver-creation access exists — Support', async () => {
    const req=reqWith(['trips.bookings:view', 'trips.bookings:edit']);req.user!.roles=['support'];expect(await bookingOwnerScope(req)).toEqual({ mode: 'own', ownerUserId:'caller-1' });
  });
});
