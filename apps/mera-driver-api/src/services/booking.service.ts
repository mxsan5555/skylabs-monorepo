import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errorHandler';
import type { BookingOwnerScope } from '../lib/ownerScope';
import { Prisma } from '../generated/prisma-client';

/** Builds the `Booking.where` ownership clause for a resolved `BookingOwnerScope` — see
 *  `bookingOwnerScope` for how each mode is chosen. Never a client-supplied filter. */
export function ownerWhere(scope: BookingOwnerScope): Prisma.BookingWhereInput {
  if (scope.mode === 'unscoped') return {};
  if (scope.mode === 'own') return { createdByUserId: scope.ownerUserId };
  return { driver: { createdByUserId: scope.ownerUserId } };
}

export function bookingScopeSql(scope: BookingOwnerScope, alias = 'b'): Prisma.Sql {
  if (scope.mode === 'unscoped') return Prisma.sql`true`;
  const column = Prisma.raw(`${alias}."createdByUserId"`);
  if (scope.mode === 'own') return Prisma.sql`${column} = ${scope.ownerUserId}`;
  return Prisma.sql`${Prisma.raw(`${alias}."driverId"`)} IN (SELECT id FROM "Driver" WHERE "createdByUserId"=${scope.ownerUserId})`;
}

/** Paged destination list uses the same filtered, ownership-scoped accounting cohort. */
export async function searchBookings(tripsOnly:boolean,scope:BookingOwnerScope,filters:{status?:string;assignment?:string;timing?:string;payment?:string;search?:string},page:number,pageSize:number,sort='createdAt',direction='desc') {
  const {accountBookingSql}=await import('./accounts.service');
  const terms=bookingListTerms(tripsOnly,scope,filters);
  const cohort=Prisma.sql`SELECT * FROM (${accountBookingSql()}) b WHERE ${Prisma.join(terms,' AND ')}`;
  const [count]=await prisma.$queryRaw<{total:number}[]>(Prisma.sql`SELECT COUNT(*)::int AS total FROM (${cohort}) b`);
  const columns=['bookingCode','customerName','driverName','tripTypeName','status','paymentMode','paymentStatus','startsAt','finalFare','createdAt'];
  const column=columns.includes(sort)?sort:'createdAt';
  const selected=await prisma.$queryRaw<{id:string;paymentStatus:string}[]>(Prisma.sql`SELECT b.id,CASE WHEN b."farePaise" IS NULL THEN b."paymentStatus" ELSE b."computedPaymentStatus" END AS "paymentStatus" FROM (${cohort}) b ORDER BY ${Prisma.raw('b."'+column+'"')} ${Prisma.raw(direction==='asc'?'ASC':'DESC')},b.id ASC LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}`);
  const rows=selected.length?await prisma.booking.findMany({where:{AND:[ownerWhere(scope),{id:{in:selected.map(row=>row.id)}}]}}):[];
  const byId=new Map(rows.map(row=>[row.id,row]));
  return {rows:selected.flatMap(row=>{const booking=byId.get(row.id);return booking?[{...booking,paymentStatus:row.paymentStatus}]:[];}),meta:{total:count.total,page,pageSize}};
}

function bookingListTerms(tripsOnly:boolean,scope:BookingOwnerScope,filters:{status?:string;assignment?:string;timing?:string;payment?:string;search?:string}){
  const terms:Prisma.Sql[]=[bookingScopeSql(scope)];
  if(tripsOnly)terms.push(Prisma.sql`b.status IN ('confirmed','on_the_way','arrived','in_progress','completed','accepted','driver_arrived','ongoing')`);
  if(filters.status)terms.push(filters.status==='confirmed'?Prisma.sql`b.status IN ('confirmed','accepted')`:filters.status==='in_progress'?Prisma.sql`b.status IN ('in_progress','ongoing')`:Prisma.sql`b.status=${filters.status}`);
  if(filters.assignment==='unassigned')terms.push(Prisma.sql`b."driverId" IS NULL AND b.status NOT IN ('completed','cancelled')`);
  if(filters.payment==='unpaid')terms.push(Prisma.sql`(CASE WHEN b."farePaise" IS NULL THEN b."paymentStatus" ELSE b."computedPaymentStatus" END) IN ('unpaid','partial','pending') AND b.status<>'cancelled'`);
  if(filters.timing==='today')terms.push(Prisma.sql`((b."startsAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date`);
  if(filters.timing==='upcoming')terms.push(Prisma.sql`b.status IN ('requested','confirmed','accepted','on_the_way','arrived') AND b."startsAt">=now()`);
  if(filters.search)terms.push(Prisma.sql`(b."bookingCode" ILIKE ${'%'+filters.search+'%'} OR b."customerName" ILIKE ${'%'+filters.search+'%'})`);
  return terms;
}

export async function listBookings(tripsOnly = false, scope: BookingOwnerScope = { mode: 'unscoped' }, filters: {status?:string;assignment?:string;timing?:string;payment?:string;search?:string} = {}) {
  if(Object.values(filters).some(Boolean)) {
    const { accountBookingSql } = await import('./accounts.service');
    const terms=bookingListTerms(tripsOnly,scope,filters);
    const selected=await prisma.$queryRaw<{id:string;paymentStatus:string}[]>(Prisma.sql`SELECT b.id,CASE WHEN b."farePaise" IS NULL THEN b."paymentStatus" ELSE b."computedPaymentStatus" END AS "paymentStatus" FROM (${accountBookingSql()}) b WHERE ${Prisma.join(terms,' AND ')} ORDER BY b."createdAt" DESC LIMIT 1000`);
    const rows=selected.length?await prisma.booking.findMany({where:{AND:[ownerWhere(scope),{id:{in:selected.map(row=>row.id)}}]}}):[];
    const byId=new Map(rows.map(row=>[row.id,row]));return selected.flatMap(row=>{const booking=byId.get(row.id);return booking?[{...booking,paymentStatus:row.paymentStatus}]:[];});
  }
  return prisma.booking.findMany({
    where: { ...(tripsOnly?{status:{in:['confirmed','on_the_way','arrived','in_progress','completed','accepted','driver_arrived','ongoing']}}:{}), ...ownerWhere(scope) },
    orderBy: { createdAt: 'desc' }, take: 1000,
  });
}

export async function getBookingById(id: string, scope: BookingOwnerScope = { mode: 'unscoped' }) {
  const row = await prisma.booking.findFirst({ where: { id, ...ownerWhere(scope) } });
  // 404 whether the booking doesn't exist or simply isn't this caller's to see — same
  // non-distinguishing pattern as the KYC `assigned-to-me` ownership check.
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Booking not found');
  return row;
}

export async function createBooking(input: Record<string, unknown>, ownerUserId: string | null = null) {
  // `createdByUserId` is dropped from client input (never trusted) and set only from the
  // server-derived `ownerUserId` (see `bookingOwnerScope`).
  const { createdByUserId: _clientOwnerId, ...data } = input as Record<string, unknown> & { createdByUserId?: unknown };
  return prisma.booking.create({ data: { ...data, createdByUserId: ownerUserId } as never });
}

export async function updateBooking(id: string, input: Record<string, unknown>, scope: BookingOwnerScope = { mode: 'unscoped' }) {
  const booking = await getBookingById(id, scope);
  if (booking.farePaise != null && Object.keys(input).some(key => ['status','paymentStatus','driverName','estimatedFare','finalFare','otp','startedAt','completedAt','acceptedAt','scheduledAt','customerId'].includes(key)))
    throw new HttpError(422, 'WORKFLOW_REQUIRED', 'Use dispatch, trip transitions or Accounts for this priced booking');
  return prisma.booking.update({ where: { id }, data: input as never });
}

export async function deleteBooking(id: string, scope: BookingOwnerScope = { mode: 'unscoped' }) {
  await getBookingById(id, scope);
  await prisma.booking.delete({ where: { id } });
}
