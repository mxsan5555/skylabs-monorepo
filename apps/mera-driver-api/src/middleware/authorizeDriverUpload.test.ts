import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { mockPrisma, resetPrismaMock } from '../test-utils/prisma-mock';
vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('../services/permission.service', () => ({ resolveEffectivePermissionsForUser: vi.fn() }));
import { resolveEffectivePermissionsForUser } from '../services/permission.service';
import { authorizeDriverUpload } from './authorizeDriverUpload';

const permissions = vi.mocked(resolveEffectivePermissionsForUser);
beforeEach(() => {
  resetPrismaMock();
  permissions.mockReset();
  permissions.mockResolvedValue([]);
  mockPrisma.driverDocument.findFirst.mockResolvedValue({
    filePath: 'drivers/driver-1/doc.pdf', mimeType: 'application/pdf',
    driver: { userId: 'owner', accountStatus: 'Active', assignedVerifierId: 'reviewer' },
  });
});

async function request(userId: string, path = '/drivers/driver-1/doc.pdf') {
  const req = { path, user: { sub: userId, roles: [] } } as unknown as Request;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() };
  const next = vi.fn();
  await authorizeDriverUpload(req, res as unknown as Response, next);
  return { res, next };
}

describe('driver document authorization', () => {
  it('allows the active owner and prevents shared caching', async () => {
    const { res, next } = await request('owner');
    expect(next).toHaveBeenCalledWith();
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });
  it('hides documents from unrelated signed-in users', async () => {
    const { res, next } = await request('stranger');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });
  it('requires queue permission for an assigned reviewer', async () => {
    expect((await request('reviewer')).res.status).toHaveBeenCalledWith(404);
    permissions.mockResolvedValue(['kyc-assignments:view']);
    expect((await request('reviewer')).next).toHaveBeenCalledWith();
  });
  it('allows staff with driver view permission', async () => {
    permissions.mockResolvedValue(['drivers:view']);
    expect((await request('staff')).next).toHaveBeenCalledWith();
  });
  it.each(['/drivers/driver-1/%2e%2e', '/drivers/driver-1/..%5csecret', '/unrelated/file', '/drivers/driver-1/%ZZ'])('rejects malformed paths: %s', async path => {
    const { res, next } = await request('owner', path);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
    expect(mockPrisma.driverDocument.findFirst).not.toHaveBeenCalled();
  });
  it('forces potentially active content to download', async () => {
    mockPrisma.driverDocument.findFirst.mockResolvedValue({ mimeType: 'text/html', driver: { userId: 'owner', accountStatus: 'Active' } });
    expect((await request('owner')).res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment');
  });
});
