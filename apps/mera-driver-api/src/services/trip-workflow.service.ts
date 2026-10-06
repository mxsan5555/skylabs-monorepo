import { randomInt, randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { Prisma, Driver, Booking, MoneyMovement } from '../generated/prisma-client';
import { HttpError } from '../middleware/errorHandler';
import { driverPolicySql } from './driver-readiness-sql';
import {cityState,splitChoices} from './driver-preferences.service';
import { currentLicence } from './licence-policy.service';

export function offerDeadline(now=new Date()) {const value=process.env.TRIP_OFFER_TIMEOUT_SECONDS;if(!value?.trim())return null;const seconds=Number(value);if(!Number.isInteger(seconds)||seconds<1||seconds>86400)throw new HttpError(503,'OFFER_TIMEOUT_INVALID','TRIP_OFFER_TIMEOUT_SECONDS must be a whole number from 1 to 86400, or empty for no configured expiry');return new Date(now.getTime()+seconds*1000);}
export const ACTIVE_TRIPS = ['confirmed', 'on_the_way', 'arrived', 'in_progress'];
const publicDriver = { id: true, firstName: true, lastName: true, avatar: true, driverType: true, languages: true } as const;
export function feeState(driver: Pick<Driver, 'registrationFeePaise'>, movements: Pick<MoneyMovement, 'kind' | 'amountPaise'>[]) {
  const paid = movements.filter(m => m.kind === 'registration_payment').reduce((sum, m) => sum + m.amountPaise, 0);
  const refunded = movements.filter(m => m.kind === 'registration_refund').reduce((sum, m) => sum + m.amountPaise, 0);
  if (paid > 0 && paid - refunded >= driver.registrationFeePaise) return 'Paid';
  if (movements.some(m => m.kind === 'registration_waiver')) return 'Waived';
  if (refunded > 0 && paid - refunded < driver.registrationFeePaise) return 'Refunded';
  return 'Unpaid';
}
export function eligibilityReasons(driver: Driver, fee: string, booking?: Booking, conflicts = 0, now = new Date()) {
  const reasons: string[] = [];
  if (driver.accountStatus !== 'Active') reasons.push('Account is not active');
  // Fee pill is finance-owned; it never prevents otherwise completed profile pills.
  const required = [10,11,12,13,20,21,30,31,32,40];
  if (required.some(key => !driver.completedSubSteps.includes(key))) reasons.push('Required onboarding pills are incomplete');
  if (driver.status !== 'Verified') reasons.push('Final KYC approval is required');
  if (!driver.dlNo?.trim() || !currentLicence(driver.dlExpiryDate,now)) reasons.push('A valid reviewed driving licence is required');
  if (process.env.DRIVER_DL_POLICY === 'api') reasons.push('IDSPay verification is unavailable under the configured API policy');
  if (process.env.DRIVER_DL_POLICY && !['manual','api'].includes(process.env.DRIVER_DL_POLICY)) reasons.push('Unsupported driving licence verification policy');
  if (driver.registrationFeeRequired && !['Paid','Waived'].includes(fee)) reasons.push('Required registration fee is not settled');
  if (!driver.online) reasons.push('Driver is offline');
  if(booking?.city){const state=cityState(booking.city);
    if(driver.workLocation==='Same State'){if(!state||driver.state?.trim().toLowerCase()!==state.toLowerCase())reasons.push('Booking is outside the saved address state or its state is unresolved');}
    else if(driver.workLocation==='Other States'){if(!state||!(driver.workStates??[]).some(value=>value.trim().toLowerCase()===state.toLowerCase()))reasons.push('Booking state is not in the selected work states or is unresolved');}
    else if(driver.city?.trim().toLowerCase()!==booking.city.trim().toLowerCase())reasons.push('City does not match');
  }
  const policy=booking?.pricingSnapshot as {requiredDriverJobType?:string;requiredDriverJobChoice?:string}|null;
  if(policy?.requiredDriverJobType&&!splitChoices(driver.jobType).some(value=>value.toLowerCase()===policy.requiredDriverJobType!.toLowerCase()))reasons.push('Required job type does not match');
  if(policy?.requiredDriverJobChoice&&!(driver.jobChoices??[]).some(value=>value.toLowerCase()===policy.requiredDriverJobChoice!.toLowerCase()))reasons.push('Required job choice does not match');
  if(booking?.vehicleCategory&&driver.vehicleType&&!splitChoices(driver.vehicleType).some(value=>value.toLowerCase()===booking.vehicleCategory!.toLowerCase()))reasons.push('Vehicle choice does not match');
  if (booking?.requiredSkill && !booking.requiredSkill.split(',').filter(Boolean).every(required=>driver.driverType?.split(',').some(skill=>skill.trim().toLowerCase()===required.trim().toLowerCase()))) reasons.push('Required skill does not match');
  if (conflicts) reasons.push(booking?'A confirmed trip overlaps this schedule':'Driver has ongoing or confirmed work now');
  return reasons;
}
async function eligible(tx: Prisma.TransactionClient, driverId: string, booking?: Booking) {
  const driver = await tx.driver.findUnique({ where: { id: driverId } });
  if (!driver) throw new HttpError(404, 'NOT_FOUND', 'Driver not found');
  const movements = await tx.moneyMovement.findMany({ where: { driverId, kind: { startsWith: 'registration_' } } });
  const conflicts = await tx.booking.count({ where: { driverId, ...(booking?{id:{not:booking.id}}:{}), status: { in: ACTIVE_TRIPS },
    OR: [{ startsAt: null }, { endsAt: null }, ...(booking?[{startsAt:{lt:booking.endsAt!},endsAt:{gt:booking.startsAt!}},{status:'in_progress',endsAt:{lte:new Date()}}]:[{status:'in_progress'},{startsAt:{lte:new Date()},endsAt:{gt:new Date()}}])] } });
  let fee = feeState(driver, movements);
  if(fee==='Unpaid'){
    const intents=await tx.paymentIntent.findMany({where:{driverId}});
    if(intents.some(i=>['pending','processing'].includes(i.status)))fee='Pending';
    else if(intents.some(i=>i.status==='failed'))fee='Failed';
  }
  return { driver, fee, reasons: eligibilityReasons(driver, fee, booking, conflicts) };
}
export async function driverEligibility(driverId: string) { return eligible(prisma, driverId); }
export function candidatePageSql(booking:Pick<Booking,'id'|'city'|'requiredSkill'|'startsAt'|'endsAt'>&Partial<Pick<Booking,'vehicleCategory'|'pricingSnapshot'>>,input:{search?:string;page?:number;pageSize?:number;publicOnly?:boolean}={}){
  if(!booking.startsAt||!booking.endsAt)throw new HttpError(422,'SCHEDULE_REQUIRED','Set a validated booking schedule before dispatch');
  const page=Math.max(1,input.page??1),pageSize=Math.min(25,Math.max(1,input.pageSize??10)),pattern='%'+(input.search??'').trim()+'%';
  const state=cityState(booking.city),policy=booking.pricingSnapshot as {requiredDriverJobType?:string;requiredDriverJobChoice?:string}|null;
  const location=booking.city?Prisma.sql`CASE WHEN d."workLocation"='Same State' THEN ${state?Prisma.sql`lower(trim(d.state))=lower(${state})`:Prisma.sql`false`} WHEN d."workLocation"='Other States' THEN ${state?Prisma.sql`EXISTS(SELECT 1 FROM unnest(d."workStates") value WHERE lower(trim(value))=lower(${state}))`:Prisma.sql`false`} ELSE lower(trim(d.city))=lower(trim(${booking.city})) END`:Prisma.sql`true`;
  const jobType=policy?.requiredDriverJobType?Prisma.sql`EXISTS(SELECT 1 FROM unnest(string_to_array(d."jobType",',')) value WHERE lower(trim(value))=lower(${policy.requiredDriverJobType}))`:Prisma.sql`true`;
  const jobChoice=policy?.requiredDriverJobChoice?Prisma.sql`EXISTS(SELECT 1 FROM unnest(d."jobChoices") value WHERE lower(trim(value))=lower(${policy.requiredDriverJobChoice}))`:Prisma.sql`true`;
  const vehicle=booking.vehicleCategory?Prisma.sql`(COALESCE(length(trim(d."vehicleType")),0)=0 OR EXISTS(SELECT 1 FROM unnest(string_to_array(d."vehicleType",',')) value WHERE lower(trim(value))=lower(${booking.vehicleCategory})))`:Prisma.sql`true`;
  const ready=Prisma.sql`(p."readyForTrips" AND (${location}) AND (${jobType}) AND (${jobChoice}) AND (${vehicle}) AND (${booking.requiredSkill?Prisma.sql`NOT EXISTS(SELECT 1 FROM unnest(string_to_array(${booking.requiredSkill},',')) required WHERE NOT EXISTS(SELECT 1 FROM unnest(string_to_array(d."driverType",',')) skill WHERE lower(trim(skill))=lower(trim(required))))`:Prisma.sql`true`}))`;
  return Prisma.sql`WITH candidate_policy AS MATERIALIZED (${driverPolicySql(undefined,{id:booking.id,startsAt:booking.startsAt,endsAt:booking.endsAt})}) SELECT d.id,${ready} AS ready FROM candidate_policy p JOIN "Driver" d ON d.id=p.id LEFT JOIN "User" u ON u.id=d."userId" WHERE (d.id ILIKE ${pattern} OR concat_ws(' ',d."firstName",d."lastName") ILIKE ${pattern} OR d.phone ILIKE ${pattern}) AND ${input.publicOnly?Prisma.sql`${ready} AND u.status='active' AND u."deletedAt" IS NULL`:Prisma.sql`true`} ORDER BY ${ready} DESC,d."firstName" ASC,d.id ASC LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}`;
}
export async function matchingDrivers(tx:Prisma.TransactionClient, booking:Pick<Booking,'id'|'city'|'requiredSkill'|'startsAt'|'endsAt'>&Partial<Pick<Booking,'vehicleCategory'|'pricingSnapshot'>>, input:{search?:string;page?:number;pageSize?:number;publicOnly?:boolean}={}){
  const rows=await tx.$queryRaw<{id:string;ready:boolean}[]>(candidatePageSql(booking,input));
  const result=[];
  for(const row of rows){const state=await eligible(tx,row.id,booking as Booking);result.push({id:row.id,name:state.driver.firstName+' '+(state.driver.lastName??''),city:state.driver.city,driverType:state.driver.driverType,reasons:state.reasons});}
  return result.filter(row=>!input.publicOnly||!row.reasons.length);
}
export async function dispatchCandidates(bookingId:string,input:{search?:string;page?:number;pageSize?:number}={}){
  const booking=await prisma.booking.findUniqueOrThrow({where:{id:bookingId}});return matchingDrivers(prisma,booking,input);
}
export async function customerCandidates(input:BookInput,page=1){const quote=await quoteBooking(input);return matchingDrivers(prisma,{id:'',city:input.city,requiredSkill:quote.requiredSkill,startsAt:new Date(input.startsAt),endsAt:new Date(new Date(input.startsAt).getTime()+input.durationMinutes*60000),vehicleCategory:input.vehicleCategory,pricingSnapshot:quote.pricingSnapshot},{publicOnly:true,page});}
let sweeping=false;
export async function sweepExpiredOffers(){
  if(sweeping)return;sweeping=true;
  try{
    const expired=await prisma.tripOffer.findMany({where:{status:'pending',expiresAt:{lte:new Date()},booking:{status:'requested',driverId:null}},select:{bookingId:true}});
    for(const bookingId of new Set(expired.map(offer=>offer.bookingId)))await prisma.$transaction(async tx=>{
      // Same booking lock as acceptance/reassignment; never append a Finding-driver
      // event after a concurrent winner has already confirmed this booking.
      await tx.$queryRaw`SELECT id FROM "Booking" WHERE id=${bookingId} FOR UPDATE`;
      const booking=await tx.booking.findUnique({where:{id:bookingId},include:{customer:true}});
      if(!booking||booking.status!=='requested'||booking.driverId)return;
      const changed=await tx.tripOffer.updateMany({where:{bookingId,status:'pending',expiresAt:{lte:new Date()}},data:{status:'expired',respondedAt:new Date()}});
      if(!changed.count)return;
      await tx.tripEvent.create({data:{bookingId,actorId:booking.customer?.userId??'system:offer-expiry',status:'requested',reason:'Configured request deadline elapsed; returned to dispatch queue'}});
      if(booking.customer?.userId)await tx.portalMessage.create({data:{userId:booking.customer.userId,kind:'notification',subject:'Driver request expired',body:'Your booking '+booking.bookingCode+' is back with dispatch.'}});
    });
  }finally{sweeping=false;}
}

export interface BookInput { city: string; service: string; vehicleCategory: string; pickupAddress: string; dropAddress: string; startsAt: string; durationMinutes: number; distanceKm: number; requiredSkill?: string; paymentMode?: 'cash' | 'razorpay'; preferredDriverId?:string }
export async function quoteBooking(input: BookInput) {
  const date = new Date(input.startsAt);
  if (!Number.isFinite(date.getTime()) || date < new Date()) throw new HttpError(422, 'SCHEDULE_INVALID', 'Choose a future pickup time');
  const rules = await prisma.fareRule.findMany({ where: { isActive: true, zoneName: input.city, tripTypeName: input.service, vehicleCategoryName: input.vehicleCategory }, orderBy: { effectiveFrom: 'desc' } });
  const rule = rules.find(r => Number.isFinite(new Date(r.effectiveFrom).getTime()) && new Date(r.effectiveFrom) <= date);
  if (!rule) throw new HttpError(422, 'PRICING_UNAVAILABLE', 'No active fare rule matches this city, service and vehicle category');
  const bpsText = rule.commissionBps != null ? String(rule.commissionBps) : process.env.BOOKING_COMMISSION_BPS;
  if (!bpsText || !/^\d+$/.test(bpsText) || Number(bpsText) > 10000) throw new HttpError(503, 'COMMISSION_UNCONFIGURED', 'Finance must configure this fare rule commission or BOOKING_COMMISSION_BPS before bookings can be priced');
  const farePaise = Math.round(Math.max(rule.minFare, (rule.baseFare + rule.perKmRate * input.distanceKm + rule.perMinRate * input.durationMinutes + rule.driverAllowance) * rule.surgeMultiplier) * 100);
  if (!Number.isSafeInteger(farePaise) || farePaise <= 0 || farePaise > 2147483647) throw new HttpError(422, 'PRICING_INVALID', 'Fare rule does not produce a valid storable amount');
  const commissionBps = Number(bpsText), commissionPaise = Math.round(farePaise * commissionBps / 10000);
  const requiredSkill=[...new Set([rule.requiredDriverSkill,input.requiredSkill].filter(Boolean).flatMap(skill=>skill!.split(',').map(value=>value.trim()).filter(Boolean)))].join(',')||null;
  return { requiredSkill, farePaise, commissionBps, commissionPaise, driverSharePaise: farePaise - commissionPaise, pricingSnapshot: { ...rule, createdAt: rule.createdAt.toISOString(), updatedAt: rule.updatedAt.toISOString() } };
}
export async function bookCustomer(customerId: string, actorId: string, input: BookInput) {
  const quote = await quoteBooking(input);
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  const booking = await prisma.$transaction(async tx=>{ await tx.$queryRaw`SELECT id FROM "Customer" WHERE id=${customerId} FOR UPDATE`;const currentCustomer=await tx.customer.findUniqueOrThrow({where:{id:customerId}});if(currentCustomer.accountStatus&&currentCustomer.accountStatus!=='Active')throw new HttpError(403,'CUSTOMER_DEACTIVATED','Inactive customers cannot create a booking');const created = await tx.booking.create({ data: { ...quote, customerId, customerName: `${customer.firstName} ${customer.lastName ?? ''}`.trim(),
    bookingCode: `MD-${randomUUID().slice(0, 8).toUpperCase()}`, city: input.city, tripTypeName: input.service, vehicleCategory: input.vehicleCategory,
    pickupAddress: input.pickupAddress, dropAddress: input.dropAddress, startsAt: new Date(input.startsAt), endsAt: new Date(new Date(input.startsAt).getTime() + input.durationMinutes * 60000),
    scheduledAt: input.startsAt, estimatedDistanceKm: input.distanceKm, estimatedDurationMin: input.durationMinutes, estimatedFare: quote.farePaise / 100,
    requiredSkill: quote.requiredSkill, paymentMode: input.paymentMode ?? 'cash', paymentStatus: 'unpaid', otp: String(randomInt(100000, 1000000)), status: 'requested', requestedAt: new Date().toISOString(),
    events: { create: { actorId, status: 'requested', reason: 'Customer booking created' } } } });
  await offerBooking(created.id, actorId, input.preferredDriverId,tx);return created;});
  return customerTrip(customerId, booking.id);
}
export async function offerBooking(bookingId: string, actorId: string, preferredDriverId?:string, existingTx?:Prisma.TransactionClient) {
  const work=async(tx:Prisma.TransactionClient)=>{
    await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${bookingId} FOR UPDATE`;
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { offers: true } });
    if (booking.status !== 'requested' || booking.driverId) return [];
    await tx.tripOffer.updateMany({ where: { bookingId, status: 'pending', expiresAt: { lte: new Date() } }, data: { status: 'expired', respondedAt: new Date() } });
    const pending=booking.offers.filter(o=>o.status==='pending'&&(!o.expiresAt||o.expiresAt>new Date()));
    if(pending.length)return pending.map(o=>o.id);
    const candidates=preferredDriverId?[{id:preferredDriverId}]:await matchingDrivers(tx,booking,{publicOnly:true,pageSize:5});
    const drivers=await tx.driver.findMany({where:{id:{in:candidates.map(d=>d.id)}}});
    if(preferredDriverId&&drivers.length!==1)throw new HttpError(422,'DRIVER_INELIGIBLE','Selected driver is no longer available');
    const offered: string[] = [];
    for (const driver of drivers) {
      if (booking.offers.some(o => o.driverId === driver.id)) continue;
      const login=driver.userId?await tx.user.findUnique({where:{id:driver.userId},select:{status:true,deletedAt:true}}):null;
      const result = await eligible(tx, driver.id, booking);
      if (result.reasons.length || !driver.userId || login?.status!=='active' || login.deletedAt) {if(preferredDriverId)throw new HttpError(422,'DRIVER_INELIGIBLE','Selected driver is no longer available');continue;}
      const offer = await tx.tripOffer.create({ data: { driverId: driver.id, bookingId, expiresAt: offerDeadline() } });
      offered.push(offer.id);
      if (driver.userId) await tx.portalMessage.create({ data: { userId: driver.userId, kind: 'notification', subject: 'New trip request', body: `Booking ${booking.bookingCode}: ${booking.pickupAddress} → ${booking.dropAddress}` } });
    }
    await tx.tripEvent.create({ data: { bookingId, actorId, status: 'requested', reason: offered.length ? `Offered to ${offered.length} eligible drivers` : 'Awaiting eligible driver in dispatch queue' } });
    return offered;
  };return existingTx?work(existingTx):prisma.$transaction(work);
}
export async function assignTrip(bookingId: string, driverId: string, actorId: string, reason: string, offerId?: string) {
  if (!reason.trim()) throw new HttpError(422, 'REASON_REQUIRED', 'An assignment reason is required');
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${bookingId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Driver" WHERE "id" = ${driverId} FOR UPDATE`;
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    if (!['requested','confirmed','on_the_way','arrived'].includes(booking.status) || (offerId && booking.driverId)) throw new HttpError(409, 'TRIP_UNAVAILABLE', 'Booking is no longer available for assignment');
    if (!booking.startsAt || !booking.endsAt) throw new HttpError(422, 'SCHEDULE_REQUIRED', 'Booking needs a validated schedule before assignment');
    if (offerId) {
      const offer = await tx.tripOffer.findFirst({ where: { id: offerId, driverId, bookingId, status: 'pending', OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}] } });
      if (!offer) throw new HttpError(409, 'OFFER_EXPIRED', 'Trip offer is unavailable or expired');
    }
    const { driver, reasons } = await eligible(tx, driverId, booking);
    if (reasons.length) throw new HttpError(422, 'DRIVER_INELIGIBLE', reasons.join('; '));
    const snapshot={id:driver.id,firstName:driver.firstName,lastName:driver.lastName,driverType:driver.driverType,languages:driver.languages,avatar:driver.avatar&&/^https:\/\//.test(driver.avatar)?driver.avatar:null};
    const row = await tx.booking.update({ where: { id: bookingId }, data: { driverId, driverName: `${driver.firstName} ${driver.lastName ?? ''}`.trim(), approvedDriverSnapshot:snapshot, status: 'confirmed', acceptedAt: new Date().toISOString() } });
    await tx.tripOffer.updateMany({ where: { bookingId, status: 'pending' }, data: { status: 'superseded', respondedAt: new Date() } });
    if (offerId) await tx.tripOffer.update({ where: { id: offerId }, data: { status: 'accepted' } });
    await tx.tripEvent.create({ data: { bookingId, actorId, status: 'confirmed', reason: `${reason}; previous driver: ${booking.driverName ?? 'Unassigned'}; assigned: ${row.driverName}` } });
    await tx.auditLog.create({data:{actorUserId:actorId,action:'trip.assignment',targetType:'Booking',targetId:bookingId,before:{driverId:booking.driverId},after:{driverId,reason}}});
    if(driver.userId)await tx.portalMessage.create({data:{userId:driver.userId,kind:'notification',subject:'Trip assigned',body:'Booking '+booking.bookingCode+' has been assigned to you.'}});
    const customer=booking.customerId?await tx.customer.findUnique({where:{id:booking.customerId}}):null;
    if(customer?.userId)await tx.portalMessage.create({data:{userId:customer.userId,kind:'notification',subject:'Driver confirmed',body:row.driverName+' is confirmed for booking '+booking.bookingCode+'.'}});
    return row;
  });
}
export async function respondOffer(driverId: string, offerId: string, actorId: string, accept: boolean) {
  const offer = await prisma.tripOffer.findFirst({ where: { id: offerId, driverId } });
  if (!offer) throw new HttpError(404, 'NOT_FOUND', 'Offer not found');
  if (accept) return assignTrip(offer.bookingId, driverId, actorId, 'Driver accepted trip request', offerId);
  return prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "Booking" WHERE id=${offer.bookingId} FOR UPDATE`;
    const booking=await tx.booking.findUniqueOrThrow({where:{id:offer.bookingId}});
    if(booking.driverId||booking.status!=='requested')throw new HttpError(409,'TRIP_UNAVAILABLE','Booking is no longer available');
    const changed=await tx.tripOffer.updateMany({where:{id:offerId,driverId,status:'pending',OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]},data:{status:'declined',respondedAt:new Date()}});
    if(!changed.count)throw new HttpError(409,'OFFER_EXPIRED','Trip offer is unavailable or expired');
    await tx.tripEvent.create({data:{bookingId:offer.bookingId,actorId,status:'requested',reason:'Driver declined; returned to dispatch queue'}});return {status:'declined'};
  });
}
export async function customerTrip(customerId: string, bookingId: string) {
  const booking = await prisma.booking.findFirst({where:{id:bookingId,customerId},include:{driver:{select:publicDriver},events:{orderBy:{createdAt:'asc'}},offers:{where:{status:'pending',OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]},select:{driver:{select:{id:true,firstName:true,lastName:true}}},take:2}}});
  if(!booking)throw new HttpError(404,'NOT_FOUND','Booking not found');
  const {offers,...record}=booking;
  return {...record,waitingFor:!booking.driverId&&offers?.length===1?offers[0].driver:null,driver:booking.driverId?booking.approvedDriverSnapshot??{...booking.driver,avatar:null}:null};
}
export async function driverTrips(driverId: string) {
  const rows = await prisma.booking.findMany({ where: { driverId }, include: { events: { orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'desc' } });
  return rows.map(({ otp: _otp, ...booking }) => booking);
}
export async function driverOffers(driverId: string) {
  const offers = await prisma.tripOffer.findMany({ where: { driverId, status: 'pending', OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}], booking: { status: 'requested', driverId: null } }, include: { booking: true } });
  return offers.map(o => { const { otp: _otp, ...booking } = o.booking; return { ...o, booking }; });
}
export async function transitionTrip(bookingId: string, actorId: string, input: { status: string; otp?: string; reason?: string }, owner: { driverId?: string; customerId?: string }) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${bookingId} FOR UPDATE`;
    const booking = await tx.booking.findFirst({ where: { id: bookingId, ...owner } });
    if (!booking) throw new HttpError(404, 'NOT_FOUND', 'Booking not found');
    const next: Record<string, string> = { confirmed: 'on_the_way', on_the_way: 'arrived', arrived: 'in_progress', in_progress: 'completed' };
    if (input.status === 'cancelled') {
      if (!input.reason?.trim() || ['completed','cancelled','in_progress'].includes(booking.status)) throw new HttpError(422, 'CANCEL_INVALID', 'A reason and a trip that has not started are required');
    } else if (!owner.driverId || next[booking.status] !== input.status) throw new HttpError(409, 'TRANSITION_INVALID', 'This trip transition is not allowed');
    if (input.status === 'in_progress' && (!booking.otp || input.otp !== booking.otp)) throw new HttpError(422, 'OTP_INVALID', 'Enter the customer’s trip-start OTP');
    const row = await tx.booking.update({ where: { id: bookingId }, data: { status: input.status, ...(input.status === 'in_progress' ? { startedAt: new Date().toISOString() } : {}), ...(input.status === 'completed' ? { completedAt: new Date().toISOString(), finalFare: booking.farePaise ? booking.farePaise / 100 : undefined } : {}) } });
    await tx.tripEvent.create({ data: { bookingId, actorId, status: input.status, reason: input.reason } });
    return { ...row, otp: owner.customerId ? row.otp : undefined };
  });
}
