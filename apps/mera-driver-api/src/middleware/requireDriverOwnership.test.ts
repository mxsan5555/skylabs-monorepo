import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma, resetPrismaMock } from '../test-utils/prisma-mock';
vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('../lib/ownerScope', () => ({ driverOwnerScope: vi.fn() }));

import { requireDriverOwnership } from './requireDriverOwnership';
import { driverOwnerScope } from '../lib/ownerScope';

function mockRes() {
  const res: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

beforeEach(() => { resetPrismaMock(); vi.clearAllMocks(); });

describe('requireDriverOwnership', () => {
  it('calls next() unconditionally when the scope is unscoped (Admin/Super Admin/Support)', async () => {
    (driverOwnerScope as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const next = vi.fn();
    await requireDriverOwnership({ params: { id: 'driver-1' } } as never, mockRes() as never, next);
    expect(next).toHaveBeenCalledWith();
    expect(mockPrisma.driver.findUnique).not.toHaveBeenCalled();
  });

  it('404s when the driver is not owned by the scoped caller — never reveals it exists', async () => {
    (driverOwnerScope as ReturnType<typeof vi.fn>).mockResolvedValue('caller-1');
    mockPrisma.driver.findUnique.mockResolvedValue({ createdByUserId: 'someone-else' });
    const res = mockRes();
    const next = vi.fn();
    await requireDriverOwnership({ params: { id: 'driver-1' } } as never, res as never, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('404s when the driver does not exist at all, same as a mismatched owner', async () => {
    (driverOwnerScope as ReturnType<typeof vi.fn>).mockResolvedValue('caller-1');
    mockPrisma.driver.findUnique.mockResolvedValue(null);
    const res = mockRes();
    const next = vi.fn();
    await requireDriverOwnership({ params: { id: 'missing' } } as never, res as never, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when the driver is owned by the scoped caller', async () => {
    (driverOwnerScope as ReturnType<typeof vi.fn>).mockResolvedValue('caller-1');
    mockPrisma.driver.findUnique.mockResolvedValue({ createdByUserId: 'caller-1' });
    const next = vi.fn();
    await requireDriverOwnership({ params: { id: 'driver-1' } } as never, mockRes() as never, next);
    expect(next).toHaveBeenCalledWith();
  });
});
