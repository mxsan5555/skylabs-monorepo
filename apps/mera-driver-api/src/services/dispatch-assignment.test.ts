import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma, resetPrismaMock } from '../test-utils/prisma-mock';
vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
import { assignTrip, matchingDrivers, offerBooking } from './trip-workflow.service';
import type { Booking } from '../generated/prisma-client';

const booking = { id:'booking', status:'requested', driverId:null, driverName:null, startsAt:new Date('2090-01-01'), endsAt:new Date('2090-01-02'), updatedAt:new Date('2026-10-08'), paymentStatus:'unpaid', paymentMode:'cash', offers:[] };
const driver = { id:'driver', firstName:'Eligible', lastName:'Driver', phone:'9000000000', city:'Pune', driverType:'Automatic', completedSubSteps:[10,11,12,13,20,21,30,31,32,40], accountStatus:'Active', status:'Verified', dlNo:'DL123', dlExpiryDate:'2099-01-01', online:true, registrationFeeRequired:false, languages:[], userId:'driver-user' };
beforeEach(() => {
  resetPrismaMock();
  mockPrisma.booking.findUniqueOrThrow.mockResolvedValue(booking);
  mockPrisma.driver.findUnique.mockResolvedValue(driver);
  mockPrisma.booking.count.mockResolvedValue(0);
  mockPrisma.moneyMovement.findMany.mockResolvedValue([]);
  mockPrisma.paymentIntent.findMany.mockResolvedValue([]);
  mockPrisma.booking.update.mockImplementation(async ({data}) => ({...booking,...data}));
});
describe('dispatch assignment under the existing row locks', () => {
  it('rechecks stale eligibility before any mutation', async () => {
    mockPrisma.driver.findUnique.mockResolvedValue({...driver,online:false});
    await expect(assignTrip('booking','driver','actor','Reviewed')).rejects.toMatchObject({code:'DRIVER_INELIGIBLE'});
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    expect(mockPrisma.tripEvent.create).not.toHaveBeenCalled();
  });
  it.each(['completed','cancelled','in_progress'])('cannot assign a %s booking', async status => {
    mockPrisma.booking.findUniqueOrThrow.mockResolvedValue({...booking,status});
    await expect(assignTrip('booking','driver','actor','Reviewed')).rejects.toMatchObject({code:'TRIP_UNAVAILABLE'});
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });
  it('rejects a concurrent winner rather than silently replacing their driver', async () => {
    mockPrisma.booking.findUniqueOrThrow.mockResolvedValue({...booking,status:'confirmed',driverId:'winner'});
    await expect(assignTrip('booking','driver','actor','Reviewed',undefined,{expectedDriverId:null,expectedUpdatedAt:booking.updatedAt.toISOString()})).rejects.toMatchObject({code:'ASSIGNMENT_CHANGED'});
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });
  it('rejects a changed schedule even when the driver has not changed', async () => {
    await expect(assignTrip('booking','driver','actor','Reviewed',undefined,{expectedDriverId:null,expectedUpdatedAt:'2026-10-07T00:00:00.000Z'})).rejects.toMatchObject({code:'ASSIGNMENT_CHANGED'});
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });
  it('replays the same committed request without resetting the OTP or duplicating history', async () => {
    mockPrisma.booking.findUniqueOrThrow.mockResolvedValue({...booking,driverId:'driver',status:'arrived',otp:'123456'});
    mockPrisma.auditLog.findFirst.mockResolvedValue({actorUserId:'actor',after:{driverId:'driver',reason:'Reviewed',clientRequestId:'request'}});
    expect(await assignTrip('booking','driver','actor','Reviewed',undefined,{expectedDriverId:null,clientRequestId:'request'})).toMatchObject({status:'arrived',otp:'123456'});
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    expect(mockPrisma.tripEvent.create).not.toHaveBeenCalled();
  });
  it('rejects reuse of a request ID with a different actor or reason', async () => {
    mockPrisma.auditLog.findFirst.mockResolvedValue({actorUserId:'other',after:{driverId:'driver',reason:'Reviewed'}});
    await expect(assignTrip('booking','driver','actor','Reviewed',undefined,{clientRequestId:'request'})).rejects.toMatchObject({code:'REQUEST_CONFLICT'});
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });
  it('requires a different replacement and a nonblank reason', async () => {
    mockPrisma.booking.findUniqueOrThrow.mockResolvedValue({...booking,driverId:'driver',status:'confirmed'});
    await expect(assignTrip('booking','driver','actor','Reviewed')).rejects.toMatchObject({code:'DRIVER_UNCHANGED'});
    await expect(assignTrip('booking','replacement','actor',' ')).rejects.toMatchObject({code:'REASON_REQUIRED'});
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });
  it('preserves reassignment reason/history without accepting offers, payment or KYC', async () => {
    mockPrisma.booking.findUniqueOrThrow.mockResolvedValue({...booking,driverId:'old',driverName:'Previous',status:'confirmed'});
    const row=await assignTrip('booking','driver','actor','Replacement requested');
    expect(row).toMatchObject({driverId:'driver',status:'confirmed',paymentStatus:'unpaid'});
    expect(mockPrisma.tripEvent.create).toHaveBeenCalledWith({data:expect.objectContaining({reason:expect.stringContaining('Replacement requested; previous driver: Previous')})});
    expect(mockPrisma.tripOffer.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:'superseded'})}));
    expect(mockPrisma.tripOffer.update).not.toHaveBeenCalled();
    expect(mockPrisma.driver.update).not.toHaveBeenCalled();
    expect(mockPrisma.moneyMovement.create).not.toHaveBeenCalled();
    expect(mockPrisma.booking.update.mock.calls[0][0].data).not.toHaveProperty('paymentStatus');
  });
});
it('keeps candidate phone private in customer/public search, but available to dispatch', async () => {
  mockPrisma.$queryRaw.mockResolvedValue([{id:'driver',ready:true}]);
  const staff=await matchingDrivers(mockPrisma as never,booking as unknown as Booking);
  const customer=await matchingDrivers(mockPrisma as never,booking as unknown as Booking,{publicOnly:true});
  expect(staff[0]).toMatchObject({phone:driver.phone,reasons:[]});
  expect(customer[0]).not.toHaveProperty('phone');
});
it('records customer preference separately from the pending request state', async () => {
  mockPrisma.driver.findMany.mockResolvedValue([driver]);mockPrisma.user.findUnique.mockResolvedValue({status:'active',deletedAt:null});mockPrisma.tripOffer.create.mockResolvedValue({id:'offer'});
  await offerBooking('booking','actor','driver');
  expect(mockPrisma.tripOffer.create).toHaveBeenCalledWith({data:expect.objectContaining({driverId:'driver',isCustomerPreference:true})});
  expect(mockPrisma.booking.update).not.toHaveBeenCalled();
});
