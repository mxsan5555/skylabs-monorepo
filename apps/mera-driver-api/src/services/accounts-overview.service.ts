import { Prisma } from '../generated/prisma-client';
import { prisma } from '../lib/prisma';
import type { BookingOwnerScope } from '../lib/ownerScope';
import { bookingScopeSql } from './booking.service';
import { accountBookingSql, type AccountFilters } from './accounts.service';

/** Current scoped balances and posted receipts, never a browser-side full-ledger sum. */
export async function accountsOverviewMetrics(filters:AccountFilters,scope:BookingOwnerScope,driverOwnerUserId:string|null) {
  const from=filters.from?new Date(filters.from):undefined,to=filters.to?new Date(/^\d{4}-\d{2}-\d{2}$/.test(filters.to)?filters.to+'T23:59:59.999Z':filters.to):undefined;
  const bookingScope=Prisma.sql`${bookingScopeSql(scope)} AND ${filters.city?Prisma.sql`b.city=${filters.city}`:Prisma.sql`true`} AND ${filters.service?Prisma.sql`b."tripTypeName"=${filters.service}`:Prisma.sql`true`}`;
  const driverScope=Prisma.sql`${driverOwnerUserId?Prisma.sql`d."createdByUserId"=${driverOwnerUserId}`:Prisma.sql`true`} AND ${filters.city?Prisma.sql`d.city=${filters.city}`:Prisma.sql`true`}`;
  const posted=Prisma.sql`${from?Prisma.sql`m."createdAt">=${from}`:Prisma.sql`true`} AND ${to?Prisma.sql`m."createdAt"<=${to}`:Prisma.sql`true`}`;
  const [collections]=await prisma.$queryRaw<{amount:number}[]>(Prisma.sql`SELECT COALESCE(SUM(m."amountPaise"),0)::float8 AS amount FROM "MoneyMovement" m JOIN "Booking" b ON b.id=m."bookingId" WHERE m.kind='booking_payment' AND ${bookingScope} AND ${posted} AND ${filters.paymentStatus?Prisma.sql`EXISTS(SELECT 1 FROM (${accountBookingSql()}) s WHERE s.id=b.id AND s."computedPaymentStatus"=${filters.paymentStatus})`:Prisma.sql`true`}`);
  const [fees]=await prisma.$queryRaw<{amount:number}[]>(Prisma.sql`SELECT COALESCE(SUM(CASE WHEN m.kind='registration_payment' THEN m."amountPaise" ELSE -m."amountPaise" END),0)::float8 AS amount FROM "MoneyMovement" m JOIN "Driver" d ON d.id=m."driverId" WHERE m.kind IN ('registration_payment','registration_refund') AND ${driverScope} AND ${posted}`);
  const earnedAt=commissionEarnedAtSql();
  const [balances]=await prisma.$queryRaw<{commission:number;payoutDue:number;commissionReceivable:number}[]>(Prisma.sql`SELECT COALESCE(SUM(commission) FILTER(WHERE ${from?Prisma.sql`${earnedAt}>=${from}`:Prisma.sql`true`} AND ${to?Prisma.sql`${earnedAt}<=${to}`:Prisma.sql`true`}),0)::float8 AS commission,COALESCE(SUM(payable),0)::float8 AS "payoutDue",COALESCE(SUM("commissionReceivable"),0)::float8 AS "commissionReceivable" FROM (${accountBookingSql()}) b WHERE ${bookingScope} AND ${filters.paymentStatus?Prisma.sql`b."computedPaymentStatus"=${filters.paymentStatus}`:Prisma.sql`true`}`);
  return {platformCollections:collections?.amount??0,registrationFeesReceived:fees?.amount??0,earnedCommission:balances?.commission??0,driverPayoutDue:balances?.payoutDue??0,commissionReceivable:balances?.commissionReceivable??0,postedPeriod:from||to?`Receipts posted ${filters.from??'from the beginning'} to ${filters.to??'today'}`:'Confirmed receipts · all time',earnedPeriod:from||to?`Currently earned · recognition dates ${filters.from??'from the beginning'} to ${filters.to??'today'}`:'Currently earned · all time',balanceAsOf:new Date().toISOString()};
}

/** Recognition cannot precede either completion or the receipt that settled the fare. */
export function commissionEarnedAtSql(){return Prisma.sql`GREATEST(CASE WHEN b."completedAt" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' THEN b."completedAt"::timestamptz ELSE NULL END,(SELECT MAX(m."createdAt") FROM "MoneyMovement" m WHERE m."bookingId"=b.id AND m.kind IN ('booking_payment','driver_cod_collection')))`;}
