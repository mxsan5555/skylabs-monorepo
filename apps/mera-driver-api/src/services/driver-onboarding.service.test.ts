import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma, resetPrismaMock } from '../test-utils/prisma-mock';
vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
import { saveOwnPill } from './driver-onboarding.service';
import { DRIVER_PILLS } from './driver-pill.service';

beforeEach(() => {
  resetPrismaMock();
  mockPrisma.masterListItem.findMany.mockResolvedValue([{id:'education-graduate',name:'Graduate',category:'education',status:'Active'}]);
  mockPrisma.driver.findUnique.mockResolvedValue({ id: 'own', firstName: 'Ravi', gender: 'Male', email: 'ravi@example.org', phone: '9876543210', driverType: 'LMV', avatar: 'photo', dlNo: 'DL1420110012345', documents: [], completedSubSteps: [10] });
  mockPrisma.driver.update.mockResolvedValue({});
});
describe('own onboarding pill saves', () => {
  it.each(DRIVER_PILLS.filter(p => !p.financeOnly))('persists and resumes $tab/$pill using the existing progress model', async p => {
    await saveOwnPill('own', { tab: p.tab, pill: p.pill, complete: true, fields: {} });
    const data = mockPrisma.driver.update.mock.calls[0][0].data;
    expect(data.completedSubSteps).toContain(p.tab * 10 + p.pill);
    expect(data.currentStep).toBe(1);
    expect(data.currentSubStep).toBe(p.tab === 1 && p.pill === 1 ? 2 : 1);
  });
  it('partial save never claims a completed pill', async () => {
    await saveOwnPill('own', { tab: 2, pill: 0, complete: false, fields: { education: 'Graduate' } });
    expect(mockPrisma.driver.update.mock.calls[0][0].data).toEqual({ education: 'Graduate' });
  });
  it.each([{ tab: 2, pill: 2 }, { tab: 4, pill: 1 }, { tab: 5, pill: 0 }])('rejects invalid or finance-owned pills $tab/$pill', async p => {
    await expect(saveOwnPill('own', { ...p, complete: true, fields: {} })).rejects.toMatchObject({ code: 'PILL_READ_ONLY' });
    expect(mockPrisma.driver.update).not.toHaveBeenCalled();
  });
  it.each([{ status: 'Verified' }, { userId: 'other' }, { amount: '0' }, { driverType: 'LMV' }, { phone: '9876543210' }])('rejects staff-only and other-pill fields %j', async fields => {
    await expect(saveOwnPill('own', { tab: 1, pill: 0, complete: false, fields })).rejects.toMatchObject({ code: 'PILL_FIELDS_INVALID' });
    expect(mockPrisma.driver.update).not.toHaveBeenCalled();
  });
  it('allows an incomplete DL partial save but refuses completion', async () => {
    mockPrisma.driver.findUnique.mockResolvedValue({ id: 'own', dlNo: '', documents: [], completedSubSteps: [] });
    await expect(saveOwnPill('own', { tab: 3, pill: 0, complete: true, fields: {} })).rejects.toMatchObject({ code: 'PILL_INCOMPLETE' });
    await saveOwnPill('own', { tab: 3, pill: 0, complete: false, fields: { licenseDetails: 'LMV' } });
    expect(mockPrisma.driver.update.mock.calls[0][0].data.completedSubSteps).toBeUndefined();
  });
});
