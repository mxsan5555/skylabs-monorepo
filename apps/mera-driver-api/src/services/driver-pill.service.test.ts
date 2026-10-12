import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma, resetPrismaMock } from '../test-utils/prisma-mock';
vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
import { getPillReview, pillItems, savePillCheck, valueHash } from './driver-pill.service';

const driver = { id: 'driver-1', firstName: 'Ravi', completedSubSteps: [10], documents: [] };
beforeEach(() => {
  resetPrismaMock();
  mockPrisma.driver.findFirst.mockResolvedValue(driver);
  mockPrisma.driverKycCheck.findMany.mockResolvedValue([]);
});

describe('per-item KYC review', () => {
  it('preserves unrelated passes when one field is corrected', async () => {
    mockPrisma.driverKycCheck.findMany.mockResolvedValue([
      { itemKey: 'field:firstName', status: 'Issue', reason: 'Fix spelling', valueHash: valueHash('Previous') },
      { itemKey: 'field:lastName', status: 'Pass', valueHash: valueHash(null) },
    ]);
    const review = await getPillReview(driver.id, 'reviewer-1');
    expect(review.pills[0].items[0].status).toBe('Pending');
    expect(review.pills[0].items[1].status).toBe('Pass');
    expect(review.checked).toBe(1);
  });
  it('marks changed values pending and preserves completed pill progress', async () => {
    mockPrisma.driverKycCheck.findMany.mockResolvedValue([
      { itemKey: 'field:firstName', status: 'Pass', valueHash: valueHash('Previous') },
    ]);
    const review = await getPillReview(driver.id, 'reviewer-1');
    expect(review.pills[0].completed).toBe(true);
    expect(review.pills[0].items[0]).toMatchObject({ status: 'Pending', changedSinceReview: true });
    expect(review.checked).toBe(0);
  });

  it('hashes exactly the document value presented, independent of metadata', () => {
    const document = { id: 'doc-1', category: 'personal', type: 'PAN', filePath: 'drivers/driver-1/pan.pdf', fileName: 'pan.pdf', regNo: '123', createdAt: new Date() };
    const item = pillItems({ ...driver, documents: [document] }).flatMap(pill => pill.items).find(item => item.key === 'document:doc-1')!;
    expect(item.hash).toBe(valueHash(item.value));
  });

  it('requires assignment and never writes for another reviewer', async () => {
    mockPrisma.driver.findFirst.mockResolvedValue(null);
    await expect(savePillCheck(driver.id, 'other', { key: 'field:firstName', status: 'Pass', hash: valueHash('Ravi') })).rejects.toMatchObject({ status: 404 });
    expect(mockPrisma.driverKycCheck.upsert).not.toHaveBeenCalled();
  });

  it('keeps registration fees read-only', async () => {
    await expect(savePillCheck(driver.id, 'reviewer-1', { key: 'field:amount', status: 'Pass', hash: valueHash(null) })).rejects.toMatchObject({ code: 'KYC_ITEM_INVALID' });
  });

  it('requires a specific correction reason', async () => {
    await expect(savePillCheck(driver.id, 'reviewer-1', { key: 'field:firstName', status: 'Issue', reason: '  ', hash: valueHash('Ravi') })).rejects.toMatchObject({ code: 'KYC_REASON_REQUIRED' });
  });

  it('rechecks the saved value after acquiring the lock', async () => {
    mockPrisma.driver.findFirst.mockResolvedValueOnce(driver).mockResolvedValueOnce({ ...driver, firstName: 'Changed' });
    await expect(savePillCheck(driver.id, 'reviewer-1', { key: 'field:firstName', status: 'Pass', hash: valueHash('Ravi') })).rejects.toMatchObject({ status: 409 });
    expect(mockPrisma.$queryRaw).toHaveBeenCalledOnce();
    expect(mockPrisma.driverKycCheck.upsert).not.toHaveBeenCalled();
  });

  it('stores a current check and an append-only decision together', async () => {
    await savePillCheck(driver.id, 'reviewer-1', { key: 'field:firstName', status: 'Issue', reason: ' Correct the spelling ', hash: valueHash('Ravi') });
    expect(mockPrisma.driverKycCheck.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ reason: 'Correct the spelling', reviewerId: 'reviewer-1' }) }));
    expect(mockPrisma.driverKycDecision.create).toHaveBeenCalledWith({ data: expect.objectContaining({ submittedValue: 'Ravi', status: 'Issue' }) });
  });
});
