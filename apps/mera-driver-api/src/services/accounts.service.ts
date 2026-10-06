import { prisma } from '../lib/prisma';
import { Booking, MoneyMovement, Prisma } from '../generated/prisma-client';
import { HttpError } from '../middleware/errorHandler';
import { driverPolicySql } from './driver-readiness-sql';
import { feeState } from './trip-workflow.service';

export function bookingBalances(booking: Booking, movements: MoneyMovement[]) {
  const sum = (kind: string) => movements.filter(m => m.bookingId === booking.id && m.kind === kind).reduce((s, m) => s + m.amountPaise, 0);
  const collected=sum('booking_payment'),driverCollected=sum('driver_cod_collection'),driverRefunded=sum('driver_cod_refund'),commissionSettled=sum('commission_settlement')-sum('commission_refund'),refunded=sum('booking_refund'),paid=sum('driver_payout'),recovered=sum('driver_recovery');
  const customerCollected=collected+driverCollected-refunded-driverRefunded;
  const settled=booking.status==='completed'&&booking.farePaise!=null&&customerCollected>=booking.farePaise;
  const commission=settled?booking.commissionPaise??0:0,earned=settled?booking.driverSharePaise??0:0;
  const driverRetained=Math.min(earned,Math.max(0,driverCollected-driverRefunded-Math.max(0,commission-Math.max(0,collected-refunded))));
  const commissionReceivable=Math.max(0,Math.max(0,commission-Math.max(0,collected-refunded))-commissionSettled);
  return {collected,customerCollected,driverCollected,driverRetained,commissionReceivable,commissionSettled,refunded,driverRefunded,commission,earned,paid,recovered,payable:Math.max(0,earned-driverRetained-paid+recovered),paymentStatus:customerCollected<=0&&(refunded+driverRefunded)>0?'refunded':customerCollected>=(booking.farePaise??Infinity)?'paid':customerCollected>0?'partial':'unpaid',payoutStatus:driverRetained>0?(commissionReceivable>0?'driver_cash_held':'settled_by_cod'):paid-recovered>=earned&&earned>0?'paid':'pending'};

}
export interface AccountFilters {from?:string;to?:string;city?:string;service?:string;paymentStatus?:string;section?:string;page?:number;pageSize?:number;search?:string}
export function accountBookingSql(){return Prisma.sql`
 WITH money AS (SELECT "bookingId",SUM("amountPaise") FILTER(WHERE kind='booking_payment') AS collected,SUM("amountPaise") FILTER(WHERE kind='booking_refund') AS refunded,SUM("amountPaise") FILTER(WHERE kind='driver_cod_collection') AS cod,SUM("amountPaise") FILTER(WHERE kind='driver_cod_refund') AS cod_refund,COALESCE(SUM("amountPaise") FILTER(WHERE kind='commission_settlement'),0)-COALESCE(SUM("amountPaise") FILTER(WHERE kind='commission_refund'),0) AS commission_settled,SUM("amountPaise") FILTER(WHERE kind='driver_payout') AS paid,SUM("amountPaise") FILTER(WHERE kind='driver_recovery') AS recovered FROM "MoneyMovement" WHERE "bookingId" IS NOT NULL GROUP BY "bookingId"), base AS (
 SELECT b.*,COALESCE(m.collected,0)::float8 AS collected,COALESCE(m.refunded,0)::float8 AS refunded,COALESCE(m.cod,0)::float8 AS "driverCollected",COALESCE(m.cod_refund,0)::float8 AS "driverRefunded",COALESCE(m.commission_settled,0)::float8 AS "commissionSettled",COALESCE(m.paid,0)::float8 AS paid,COALESCE(m.recovered,0)::float8 AS recovered,(COALESCE(m.collected,0)+COALESCE(m.cod,0)-COALESCE(m.refunded,0)-COALESCE(m.cod_refund,0))::float8 AS "customerCollected" FROM "Booking" b LEFT JOIN money m ON m."bookingId"=b.id), earnings AS (
 SELECT base.*,CASE WHEN status='completed' AND "customerCollected">="farePaise" THEN COALESCE("commissionPaise",0) ELSE 0 END::float8 AS commission,CASE WHEN status='completed' AND "customerCollected">="farePaise" THEN COALESCE("driverSharePaise",0) ELSE 0 END::float8 AS earned FROM base), held AS (
 SELECT earnings.*,LEAST(earned,GREATEST(0,"driverCollected"-"driverRefunded"-GREATEST(0,commission-GREATEST(0,collected-refunded)))) AS "driverRetained",GREATEST(0,GREATEST(0,commission-GREATEST(0,collected-refunded))-"commissionSettled") AS "commissionReceivable" FROM earnings)
 SELECT held.*,GREATEST(0,earned-"driverRetained"-paid+recovered) AS payable,
 CASE WHEN "customerCollected"<=0 AND refunded+"driverRefunded">0 THEN 'refunded' WHEN "customerCollected">="farePaise" THEN 'paid' WHEN "customerCollected">0 THEN 'partial' ELSE 'unpaid' END AS "computedPaymentStatus",
 CASE WHEN "driverRetained">0 THEN CASE WHEN "commissionReceivable">0 THEN 'driver_cash_held' ELSE 'settled_by_cod' END WHEN paid-recovered>=earned AND earned>0 THEN 'paid' ELSE 'pending' END AS "payoutStatus" FROM held`;
}
export async function accountReportRows(filters:AccountFilters){
 const from=filters.from?new Date(filters.from):undefined,to=filters.to?new Date(/^\d{4}-\d{2}-\d{2}$/.test(filters.to)?filters.to+'T23:59:59.999Z':filters.to):undefined;
 if((from&&!Number.isFinite(from.getTime()))||(to&&!Number.isFinite(to.getTime())))throw new HttpError(422,'DATE_INVALID','Use valid date boundaries');
 const rows=await prisma.$queryRaw<(Booking&ReturnType<typeof bookingBalances>&{computedPaymentStatus:string})[]>(Prisma.sql`SELECT * FROM (${accountBookingSql()}) b WHERE ${from?Prisma.sql`b."createdAt">=${from}`:Prisma.sql`true`} AND ${to?Prisma.sql`b."createdAt"<=${to}`:Prisma.sql`true`} AND ${filters.city?Prisma.sql`b.city=${filters.city}`:Prisma.sql`true`} AND ${filters.service?Prisma.sql`b."tripTypeName"=${filters.service}`:Prisma.sql`true`} AND ${filters.paymentStatus?Prisma.sql`b."computedPaymentStatus"=${filters.paymentStatus}`:Prisma.sql`true`} ORDER BY b."createdAt" DESC,b.id ASC`);
 return rows.map(row=>({...row,paymentStatus:row.computedPaymentStatus}));
}
export async function accountsOverview(filters:AccountFilters={}){
 const from=filters.from?new Date(filters.from):undefined,to=filters.to?new Date(/^\d{4}-\d{2}-\d{2}$/.test(filters.to)?filters.to+'T23:59:59.999Z':filters.to):undefined;
 if((from&&!Number.isFinite(from.getTime()))||(to&&!Number.isFinite(to.getTime())))throw new HttpError(422,'DATE_INVALID','Use valid date boundaries');
 const page=filters.page??1,pageSize=Math.min(filters.pageSize??25,100),section=filters.section??'Overview';
 const predicates:Prisma.Sql[]=[Prisma.sql`true`];if(from)predicates.push(Prisma.sql`b."createdAt">=${from}`);if(to)predicates.push(Prisma.sql`b."createdAt"<=${to}`);if(filters.city)predicates.push(Prisma.sql`b.city=${filters.city}`);if(filters.service)predicates.push(Prisma.sql`b."tripTypeName"=${filters.service}`);if(filters.paymentStatus)predicates.push(Prisma.sql`b."computedPaymentStatus"=${filters.paymentStatus}`);if(filters.search)predicates.push(Prisma.sql`(b."bookingCode" ILIKE ${'%'+filters.search+'%'} OR b."customerName" ILIKE ${'%'+filters.search+'%'})`);
 const cohort=Prisma.sql`SELECT * FROM (${accountBookingSql()}) b WHERE ${Prisma.join(predicates,' AND ')}`;
 const [totals]=await prisma.$queryRaw<{bookings:number;completed:number;cancelled:number;pending:number;collected:number;commission:number;driverPayable:number;driverPaid:number;driverCashHeld:number;commissionReceivable:number}[]>(Prisma.sql`SELECT COUNT(*)::int AS bookings,COUNT(*) FILTER(WHERE status='completed')::int AS completed,COUNT(*) FILTER(WHERE status='cancelled')::int AS cancelled,COUNT(*) FILTER(WHERE status NOT IN ('completed','cancelled'))::int AS pending,COALESCE(SUM(collected),0)::float8 AS collected,COALESCE(SUM(commission),0)::float8 AS commission,COALESCE(SUM(payable),0)::float8 AS "driverPayable",COALESCE(SUM(paid),0)::float8 AS "driverPaid",COALESCE(SUM("driverRetained"),0)::float8 AS "driverCashHeld",COALESCE(SUM("commissionReceivable"),0)::float8 AS "commissionReceivable" FROM (${cohort}) b`);
 const rowPredicate=section==='Commissions'?Prisma.sql`commission>0`:section==='Driver Payouts'?Prisma.sql`earned>0`:section==='Refunds & Adjustments'?Prisma.sql`refunded+"driverRefunded"+recovered>0`:Prisma.sql`true`;
 const [count]=await prisma.$queryRaw<{total:number}[]>(Prisma.sql`SELECT COUNT(*)::int AS total FROM (${cohort}) b WHERE ${rowPredicate}`);
 const bookings=['Overview','Registration Fees'].includes(section)?[]:await prisma.$queryRaw<(Booking&ReturnType<typeof bookingBalances>&{computedPaymentStatus:string})[]>(Prisma.sql`SELECT * FROM (${cohort}) b WHERE ${rowPredicate} ORDER BY "createdAt" DESC,id ASC LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}`);
 const feeScope=Prisma.sql`SELECT p.*,d."firstName",d."lastName",d."registrationFeeRequired",d."registrationFeePaise",COALESCE(f.paid,0)::float8 AS "paidPaise",COALESCE(f.refunded,0)::float8 AS "refundedPaise",COALESCE(f.waived,0)::float8 AS "waivedPaise" FROM (${driverPolicySql()}) p JOIN "Driver" d ON d.id=p.id LEFT JOIN (SELECT "driverId",SUM("amountPaise") FILTER(WHERE kind='registration_payment') AS paid,SUM("amountPaise") FILTER(WHERE kind='registration_refund') AS refunded,SUM("amountPaise") FILTER(WHERE kind='registration_waiver') AS waived FROM "MoneyMovement" WHERE kind LIKE 'registration_%' GROUP BY "driverId") f ON f."driverId"=d.id WHERE ${filters.city?Prisma.sql`d.city=${filters.city}`:Prisma.sql`true`} AND ${section==='Registration Fees'&&filters.search?Prisma.sql`(d.id ILIKE ${'%'+filters.search+'%'} OR concat_ws(' ',d."firstName",d."lastName") ILIKE ${'%'+filters.search+'%'} OR d.phone ILIKE ${'%'+filters.search+'%'})`:Prisma.sql`true`}`;
 const statuses=await prisma.$queryRaw<{status:string;count:number;amountPaise:number}[]>(Prisma.sql`SELECT "feeStatus" AS status,COUNT(*)::int AS count,COALESCE(SUM(CASE WHEN "feeStatus"='Paid' THEN "paidPaise"-"refundedPaise" WHEN "feeStatus"='Refunded' THEN "refundedPaise" WHEN "feeStatus"='Waived' THEN "waivedPaise" ELSE GREATEST(0,"registrationFeePaise"-"paidPaise"+"refundedPaise"-"waivedPaise") END),0)::float8 AS "amountPaise" FROM (${feeScope}) d GROUP BY "feeStatus"`);
 const registrationSummary=Object.fromEntries(['Unpaid','Pending','Paid','Failed','Waived','Refunded'].map(status=>[status,statuses.find(row=>row.status===status)??{count:0,amountPaise:0}]));
 const drivers=section==='Registration Fees'?await prisma.$queryRaw<{id:string;firstName:string;lastName:string;registrationFeePaise:number;registrationFeeRequired:boolean;feeStatus:string}[]>(Prisma.sql`SELECT * FROM (${feeScope}) d ORDER BY "firstName",id LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}`):[];
 const [feeTotals]=await prisma.$queryRaw<{paid:number;refunded:number}[]>(Prisma.sql`SELECT COALESCE(SUM(m."amountPaise") FILTER(WHERE m.kind='registration_payment'),0)::float8 AS paid,COALESCE(SUM(m."amountPaise") FILTER(WHERE m.kind='registration_refund'),0)::float8 AS refunded FROM "MoneyMovement" m JOIN "Driver" d ON d.id=m."driverId" WHERE ${from?Prisma.sql`m."createdAt">=${from}`:Prisma.sql`true`} AND ${to?Prisma.sql`m."createdAt"<=${to}`:Prisma.sql`true`} AND ${filters.city?Prisma.sql`d.city=${filters.city}`:Prisma.sql`true`}`);
 const feePaid=feeTotals?.paid??0,feeRefunded=feeTotals?.refunded??0;
 const kinds=['Overview','Reports'].includes(section)?['booking_payment','booking_refund','driver_cod_collection','driver_cod_refund','commission_settlement','commission_refund','driver_payout','driver_recovery','registration_payment','registration_refund','registration_waiver']:section==='Registration Fees'?['registration_payment','registration_refund','registration_waiver']:section==='Driver Payouts'?['driver_payout','driver_recovery']:section==='Commissions'?['commission_settlement']:section==='Refunds & Adjustments'?['booking_refund','driver_cod_refund','commission_refund','driver_recovery','registration_refund','registration_waiver']:['booking_payment','driver_cod_collection'];
 const movements=await prisma.moneyMovement.findMany({where:{kind:{in:kinds},...(from||to?{createdAt:{gte:from,lte:to}}:{}),...(filters.city?{OR:[{booking:{city:filters.city}},{driver:{city:filters.city}}]}:{})},orderBy:[{createdAt:'desc'},{id:'asc'}],take:section==='Overview'?5:pageSize,skip:section==='Overview'?0:(page-1)*pageSize,include:{booking:{select:{bookingCode:true}},driver:{select:{firstName:true,lastName:true}},actor:{select:{name:true}}}});
 const activity=section==='Reports'||section==='Refunds & Adjustments'?await prisma.auditLog.findMany({where:{action:{startsWith:'finance.'}},orderBy:{createdAt:'desc'},take:25,include:{actor:{select:{name:true}}}}):[];
 const total=section==='Registration Fees'?statuses.reduce((sum,row)=>sum+row.count,0):count?.total??0;
 const pendingActions=section==='Overview'?await prisma.$queryRaw<(Booking&ReturnType<typeof bookingBalances>)[]>(Prisma.sql`SELECT * FROM (${cohort}) b WHERE ("computedPaymentStatus"<>'paid' AND status<>'cancelled') OR payable>0 OR "commissionReceivable">0 ORDER BY "createdAt" DESC,id ASC LIMIT 5`):[];
 return {pendingActions,totals:{...totals,registrationFees:feePaid,registrationRefunds:feeRefunded,platformIncome:(totals?.commission??0)+feePaid-feeRefunded},bookings:bookings.map(b=>({...b,paymentStatus:b.computedPaymentStatus})),movements,drivers,registrationSummary,activity,meta:{total,page,pageSize},dateRule:'Booking creation-date cohort; registration receipts by posted date. COD collected by drivers is separate from platform receipts. Amounts in paise.'};
}
export interface MovementInput { reference: string; bookingId?: string; driverId?: string; kind: string; amountPaise: number; method: string; reason: string }
export async function recordMovement(actorId: string, input: MovementInput, verifiedProviderReceipt = false) {
  if((input.kind==='registration_waiver')!==(input.method==='waiver'))throw new HttpError(422,'METHOD_INVALID','Waiver is only a method for a registration waiver; received/refunded funds need an actual transfer method');
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise < 0 || (input.amountPaise===0&&input.kind!=='registration_waiver')) throw new HttpError(422,'AMOUNT_INVALID','A positive amount in paise is required');
  return prisma.$transaction(async tx => {
    // A global finance advisory lock serializes refunds/payouts against balances.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(731902)`;
    const previous = await tx.moneyMovement.findUnique({ where: { reference: input.reference } });
    if (previous) {
      if (previous.kind !== input.kind || (previous.amountPaise !== input.amountPaise&&!(input.kind==='registration_waiver'&&input.amountPaise===0)) || previous.bookingId !== (input.bookingId ?? null) || previous.driverId !== (input.driverId ?? null)) throw new HttpError(409, 'REFERENCE_CONFLICT', 'This reference was used for a different financial movement');
      return previous;
    }
    if (input.kind.startsWith('booking_') || input.kind === 'driver_payout' || input.kind === 'driver_recovery' || ['driver_cod_collection','driver_cod_refund','commission_settlement','commission_refund'].includes(input.kind)) {
      if (!input.bookingId) throw new HttpError(422, 'BOOKING_REQUIRED', 'A booking is required');
      const booking = await tx.booking.findUnique({ where: { id: input.bookingId } });
      if (!booking || booking.farePaise == null) throw new HttpError(422, 'BOOKING_UNPRICED', 'Booking must have a validated fare snapshot');
      const movements = await tx.moneyMovement.findMany({ where: { bookingId: booking.id } });
      const balances = bookingBalances(booking, movements);
      if (input.kind === 'booking_payment' && !verifiedProviderReceipt && input.amountPaise > booking.farePaise - balances.customerCollected) throw new HttpError(422, 'OVERPAYMENT', 'Payment exceeds outstanding booking balance');
      if(['driver_cod_collection','driver_cod_refund','commission_settlement','commission_refund'].includes(input.kind)){
        if(!booking.driverId||input.driverId!==booking.driverId)throw new HttpError(422,'DRIVER_MISMATCH','Use the assigned driver for COD collection or settlement');
        if(input.kind==='driver_cod_collection'&&(booking.paymentMode!=='cash'||input.method!=='cash'||input.amountPaise>booking.farePaise-balances.customerCollected))throw new HttpError(422,'COD_COLLECTION_INVALID','Confirm only actual driver cash collection up to the outstanding COD fare');
        if(input.kind==='driver_cod_refund'&&(input.amountPaise>balances.driverCollected-balances.driverRefunded||balances.commissionSettled>0))throw new HttpError(422,'COD_REFUND_INVALID','Recover settled commission before refunding driver-held cash');
        if(input.kind==='commission_refund'&&input.amountPaise>balances.commissionSettled)throw new HttpError(422,'COMMISSION_REFUND_INVALID','Refund exceeds actual COD commission received');
        if(input.kind==='commission_settlement'&&(input.amountPaise>balances.commissionReceivable||input.method==='waiver'))throw new HttpError(422,'COMMISSION_SETTLEMENT_INVALID','Settlement cannot exceed earned COD commission receivable');
      }
      if (input.kind === 'booking_refund' && (input.amountPaise > balances.collected - balances.refunded || balances.paid - balances.recovered > 0)) throw new HttpError(422, 'REFUND_INVALID', 'Refund exceeds collection or driver funds must first be recovered');
      if (input.kind === 'driver_payout' && (!booking.driverId || input.driverId !== booking.driverId || input.amountPaise > balances.payable)) throw new HttpError(422, 'PAYOUT_INVALID', 'Payout exceeds settled driver earnings or driver does not match');
      if (input.kind === 'driver_recovery' && (!booking.driverId || input.driverId !== booking.driverId || input.amountPaise > balances.paid - balances.recovered)) throw new HttpError(422,'RECOVERY_INVALID','Recovery exceeds actual payout or driver does not match');
    } else {
      if(input.bookingId)throw new HttpError(422,'REFERENCE_INVALID','A registration movement must not reference a booking');
      if (!input.driverId) throw new HttpError(422, 'DRIVER_REQUIRED', 'A driver is required');
      const driver = await tx.driver.findUnique({ where: { id: input.driverId } });
      if (!driver) throw new HttpError(404, 'NOT_FOUND', 'Driver not found');
      const movements = await tx.moneyMovement.findMany({ where: { driverId: driver.id } });
      const net = movements.reduce((s,m) => s + (m.kind === 'registration_payment' ? m.amountPaise : m.kind === 'registration_refund' ? -m.amountPaise : 0), 0);
      if (input.kind === 'registration_payment' && !verifiedProviderReceipt && input.amountPaise > driver.registrationFeePaise - net) throw new HttpError(422, 'OVERPAYMENT', 'Payment exceeds configured fee balance');
      if (input.kind === 'registration_refund' && input.amountPaise > net) throw new HttpError(422, 'REFUND_INVALID', 'Refund exceeds settled registration fees');
      if(input.kind==='registration_waiver'){
        const outstanding=driver.registrationFeePaise-net;
        if(outstanding<=0||movements.some(m=>m.kind==='registration_waiver')||(input.amountPaise!==0&&input.amountPaise!==outstanding))throw new HttpError(422,'WAIVER_INVALID','Only the full outstanding configured registration fee may be waived once');
        input={...input,amountPaise:outstanding};
      }
    }
    const movement = await tx.moneyMovement.create({ data: { ...input, actorId } });
    if (input.bookingId) {
      const booking = await tx.booking.findUniqueOrThrow({ where: { id: input.bookingId } });
      const movements = await tx.moneyMovement.findMany({ where: { bookingId: input.bookingId } });
      const balance = bookingBalances(booking, movements);
      await tx.booking.update({ where: { id: input.bookingId }, data: { paymentStatus: balance.paymentStatus } });
    }
    await tx.auditLog.create({ data: { actorUserId: actorId, action: `finance.${input.kind}`, targetType: input.bookingId ? 'Booking' : 'Driver', targetId: input.bookingId ?? input.driverId!, after: { ...input } } });
    return movement;
  });
}
