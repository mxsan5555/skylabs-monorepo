import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockPrisma, resetPrismaMock } from '../test-utils/prisma-mock';

vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

import { createDriver, updateDriver, setDriverAccountStatus, assertDriverAccountActive } from './driver.service';

beforeEach(() => {
  resetPrismaMock();
  mockPrisma.driver.create.mockImplementation(async ({ data }: any) => ({ id: 'driver-1', ...data }));
  mockPrisma.driver.update.mockImplementation(async ({ data }: any) => ({ id: 'driver-1', ...data }));
  // `createDriver`/`updateDriver` both re-fetch via `getDriverById` after writing — give it
  // something to find by default; individual tests override this when they need to seed
  // `existing.completedSubSteps` for an update.
  mockPrisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', completedSubSteps: [], documents: [] });
});

describe('nested onboarding sub-step progress', () => {
  it('creating with the first nested sub-step (tab 1, sub 0) only marks that one done', async () => {
    await createDriver({ firstName: 'A', stepCompleted: 1, subStepCompleted: 0 });
    const data = mockPrisma.driver.create.mock.calls[0][0].data;

    expect(data.completedSubSteps).toEqual([10]);
    expect(data.completedSteps).toEqual([]); // tab 1 needs all 4 subs (10,11,12,13) — not done yet
    expect(data.currentStep).toBe(1);
    expect(data.currentSubStep).toBe(1); // next pending: tab 1, sub 1
    expect(data.completionPercentage).toBe(Math.round((1 / 11) * 100));
    expect(data.onboardingStatus).toBe('in_progress');
    expect(mockPrisma.driver.findUnique).toHaveBeenCalled(); // getDriverById re-fetch
  });

  it('finishing every sub-step of tab 1 marks the whole tab complete and advances to tab 2', async () => {
    mockPrisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', completedSubSteps: [10, 11, 12], documents: [] });
    await updateDriver('driver-1', { stepCompleted: 1, subStepCompleted: 3 });
    const data = mockPrisma.driver.update.mock.calls[0][0].data;

    expect(data.completedSubSteps).toEqual([10, 11, 12, 13]);
    expect(data.completedSteps).toEqual([1]);
    expect(data.currentStep).toBe(2);
    expect(data.currentSubStep).toBe(0);
    expect(data.onboardingStatus).toBe('in_progress');
  });

  it('a partial update never drops previously completed sub-steps from other tabs', async () => {
    mockPrisma.driver.findUnique.mockResolvedValue({
      id: 'driver-1',
      completedSubSteps: [10, 11, 12, 13, 20], // tab 1 fully done + tab 2 sub 0 done
      documents: [],
    });
    await updateDriver('driver-1', { stepCompleted: 2, subStepCompleted: 1 });
    const data = mockPrisma.driver.update.mock.calls[0][0].data;

    expect(data.completedSubSteps).toEqual([10, 11, 12, 13, 20, 21]);
    expect(data.completedSteps).toEqual([1, 2]);
  });

  it('completing all 11 nested sub-steps across all 4 tabs marks onboarding fully complete', async () => {
    mockPrisma.driver.findUnique.mockResolvedValue({
      id: 'driver-1',
      // every sub-step except the very last one (tab 4, sub 1)
      completedSubSteps: [10, 11, 12, 13, 20, 21, 30, 31, 32, 40],
      documents: [],
    });
    await updateDriver('driver-1', { stepCompleted: 4, subStepCompleted: 1 });
    const data = mockPrisma.driver.update.mock.calls[0][0].data;

    expect(data.completedSubSteps.length).toBe(11);
    expect(data.completedSteps).toEqual([1, 2, 3, 4]);
    expect(data.currentStep).toBe(4);
    expect(data.currentSubStep).toBe(1);
    expect(data.completionPercentage).toBe(100);
    expect(data.onboardingStatus).toBe('completed');
  });

  it('re-saving an already-completed sub-step is idempotent (no duplicate keys, no regression)', async () => {
    mockPrisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', completedSubSteps: [10, 11], documents: [] });
    await updateDriver('driver-1', { stepCompleted: 1, subStepCompleted: 0 });
    const data = mockPrisma.driver.update.mock.calls[0][0].data;

    expect(data.completedSubSteps).toEqual([10, 11]);
  });

  it('a plain edit with no step info at all leaves onboarding progress completely untouched', async () => {
    mockPrisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', completedSubSteps: [10, 11], documents: [] });
    await updateDriver('driver-1', { firstName: 'Renamed' });
    const data = mockPrisma.driver.update.mock.calls[0][0].data;

    expect(data.completedSubSteps).toBeUndefined();
    expect(data.onboardingStatus).toBeUndefined();
    expect(data.firstName).toBe('Renamed');
  });

  it('a legacy whole-tab stepCompleted (no subStepCompleted) still marks every sub-step of that tab done', async () => {
    await createDriver({ firstName: 'A', stepCompleted: 2 });
    const data = mockPrisma.driver.create.mock.calls[0][0].data;

    expect(data.completedSubSteps).toEqual([10, 11, 12, 13, 20, 21]);
    expect(data.completedSteps).toEqual([1, 2]);
  });

  it('creating with no step info at all (plain admin one-shot add) is treated as fully onboarded', async () => {
    await createDriver({ firstName: 'A' });
    const data = mockPrisma.driver.create.mock.calls[0][0].data;

    expect(data.completedSubSteps.length).toBe(11);
    expect(data.onboardingStatus).toBe('completed');
  });

  it('never sends stepCompleted/subStepCompleted through to Prisma as Driver columns', async () => {
    await createDriver({ firstName: 'A', stepCompleted: 1, subStepCompleted: 0 });
    const data = mockPrisma.driver.create.mock.calls[0][0].data;

    expect(data.stepCompleted).toBeUndefined();
    expect(data.subStepCompleted).toBeUndefined();
    expect(data.firstName).toBe('A');
  });
});

describe('driver account status (Active/Inactive portal login gate)', () => {
  it('setDriverAccountStatus persists the new status and re-fetches the driver', async () => {
    mockPrisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', accountStatus: 'Inactive', documents: [] });
    mockPrisma.driver.update.mockResolvedValue({});

    const result = await setDriverAccountStatus('driver-1', 'Inactive');

    expect(mockPrisma.driver.update).toHaveBeenCalledWith({ where: { id: 'driver-1' }, data: { accountStatus: 'Inactive' } });
    expect(result.accountStatus).toBe('Inactive');
  });

  it('setDriverAccountStatus 404s for a nonexistent driver without writing anything', async () => {
    mockPrisma.driver.findUnique.mockResolvedValue(null);

    await expect(setDriverAccountStatus('missing', 'Active')).rejects.toMatchObject({ status: 404 });
    expect(mockPrisma.driver.update).not.toHaveBeenCalled();
  });

  it('assertDriverAccountActive throws DRIVER_DEACTIVATED for a linked, deactivated driver', async () => {
    mockPrisma.driver.findUnique.mockResolvedValue({ accountStatus: 'Inactive' });

    await expect(assertDriverAccountActive('user-1')).rejects.toMatchObject({ status: 403, code: 'DRIVER_DEACTIVATED' });
  });

  it('assertDriverAccountActive is a no-op for an active driver', async () => {
    mockPrisma.driver.findUnique.mockResolvedValue({ accountStatus: 'Active' });
    await expect(assertDriverAccountActive('user-1')).resolves.toBeUndefined();
  });

  it('assertDriverAccountActive is a no-op for a User with no linked Driver record', async () => {
    mockPrisma.driver.findUnique.mockResolvedValue(null);
    await expect(assertDriverAccountActive('user-1')).resolves.toBeUndefined();
  });
});
