import { driverProfilePhoto } from './driver-photo.service';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { dlReviewState } from './driver-dl.service';
import { HttpError } from '../middleware/errorHandler';
import { Prisma } from '../generated/prisma-client';
import { driverPolicySql, DriverPolicyRow } from './driver-readiness-sql';
import { eligibilityReasons } from './trip-workflow.service';

export const DriverListQuery = z.object({
  view: z.enum(['all','users','review','ready']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().max(200).optional(),
  city: z.string().optional(), state: z.string().optional(), sourceType: z.string().optional(), driverType: z.string().optional(),
  status: z.string().optional(), accountStatus: z.enum(['Active', 'Inactive','Suspended']).optional(),
  login: z.enum(['linked', 'unlinked']).optional(),
  fee: z.enum(['Unpaid','Partial','No fee required','Pending','Paid','Failed','Waived','Refunded']).optional(),
  eligibility: z.enum(['ready','blocked']).optional(),
  profile: z.enum(['incomplete']).optional(),
  documents: z.enum(['missing']).optional(),
  licence: z.enum(['Manual approved','Expired / invalid','Not checked']).optional(),
  sort: z.enum(['createdAt', 'firstName', 'lastName', 'phone', 'email', 'status', 'state', 'driverType', 'accountStatus', 'city', 'id', 'completionPercentage']).default('createdAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

export function driverListWhere(query: z.infer<typeof DriverListQuery>): Prisma.DriverWhereInput {
  const where: Prisma.DriverWhereInput = {};
  if (query.search?.trim()) {
    const contains = query.search.trim();
    where.OR = ['id', 'firstName', 'lastName', 'phone', 'email', 'dlNo'].map(key => ({ [key]: { contains, mode: 'insensitive' } }));
    const words=contains.split(/\s+/).filter(Boolean);
    if(words.length>1) where.OR.push({AND:words.map(word=>({OR:[{firstName:{contains:word,mode:'insensitive'}},{lastName:{contains:word,mode:'insensitive'}}]}))});
  }
  for (const key of ['city', 'state', 'sourceType', 'status', 'accountStatus'] as const) if (query[key]) where[key] = query[key];
  if(query.status==='Needs Review')where.status={not:'Verified'};
  if (query.driverType) where.driverType = { contains: query.driverType, mode: 'insensitive' };
  if (query.login === 'linked') where.userId = { not: null };
  if (query.login === 'unlinked') where.userId = null;
  return where;
}

export async function searchDrivers(input: unknown, scope?: { ownerUserId: string | null }) {
  const parsed = DriverListQuery.safeParse(input);
  if (!parsed.success) throw new HttpError(422, 'VALIDATION_ERROR', 'Invalid driver search filters', parsed.error.flatten());
  const query = parsed.data;
  const predicate = driverSearchPredicate(query, scope);
  const policy=Prisma.sql`SELECT p.*,d."userId",d.status,(d.status<>'Verified' AND (d."onboardingStatus"='completed' OR d."assignedVerifierId" IS NOT NULL OR EXISTS (SELECT 1 FROM "DriverKycCheck" ck WHERE ck."driverId"=d.id))) AS "needsKycReview" FROM (${driverPolicySql()}) p JOIN "Driver" d ON d.id=p.id WHERE ${predicate}`;
  const [stats]=await prisma.$queryRaw<{totalDrivers:number;driverUsers:number;kycPending:number;readyForTrips:number;feeUnpaid:number}[]>(Prisma.sql`SELECT COUNT(*)::int AS "totalDrivers",COUNT(*) FILTER(WHERE "userId" IS NOT NULL)::int AS "driverUsers",COUNT(*) FILTER(WHERE "needsKycReview")::int AS "kycPending",COUNT(*) FILTER(WHERE "readyForTrips")::int AS "readyForTrips",COUNT(*) FILTER(WHERE "feeStatus"='Unpaid')::int AS "feeUnpaid" FROM (${policy}) p`);
  const summary=stats??{totalDrivers:0,driverUsers:0,kycPending:0,readyForTrips:0,feeUnpaid:0};
  const selected=query.view==='users'?Prisma.sql`p."userId" IS NOT NULL`:query.view==='review'?Prisma.sql`p."needsKycReview"`:query.view==='ready'?Prisma.sql`p."readyForTrips"`:Prisma.sql`true`;
  const pageRows=await prisma.$queryRaw<DriverPolicyRow[]>(Prisma.sql`SELECT p.* FROM (${policy}) p JOIN "Driver" d ON d.id=p.id WHERE ${selected} ORDER BY ${Prisma.raw('d."'+query.sort+'"')} ${Prisma.raw(query.direction.toUpperCase())},d.id ASC LIMIT ${query.pageSize} OFFSET ${(query.page-1)*query.pageSize}`);
  const rows=pageRows.length?await prisma.driver.findMany({where:{id:{in:pageRows.map(row=>row.id)}},include:{documents:true,financialMovements:{where:{kind:'registration_payment'},select:{reference:true,method:true,amountPaise:true,createdAt:true,reason:true},orderBy:{createdAt:'desc'},take:1},driverStatusMaster:{select:{id:true,name:true,status:true}},user:{select:{id:true,name:true,email:true,phone:true}},assignedVerifier:{select:{id:true,name:true,email:true,phone:true}}}}):[];
  const records=new Map(rows.map(row=>[row.id,row]));
  const enriched=pageRows.flatMap(state=>{const row=records.get(state.id);return row?[{...row,...state,driverStatusName:row.driverStatusMaster?.name??null,blockingReasons:eligibilityReasons(row,state.feeStatus,undefined,state.busyNow?1:0)}]:[];});
  const total=query.view==='users'?summary.driverUsers:query.view==='review'?summary.kycPending:query.view==='ready'?summary.readyForTrips:summary.totalDrivers;
  const displayed=await Promise.all(enriched.map(async row=>{
    const {financialMovements,...record}=row;
    const payment=row.feeStatus==='Paid'?financialMovements?.[0]:undefined;
    const details=payment?{
      registrationPaymentReference:payment.reference,
      preferredPaymentMode:payment.method==='cash'?'Cash':payment.method==='upi'?'UPI':payment.method.startsWith('razorpay:')?'Online':['NEFT','RTGS','Cheque'].includes(row.preferredPaymentMode??'')?row.preferredPaymentMode!:'NEFT',
      amount:String(payment.amountPaise/100),
      paymentReceiptDate:/^Registration fee received on (\d{4}-\d{2}-\d{2})$/.exec(payment.reason)?.[1]??payment.createdAt.toISOString().slice(0,10),
    }:{};
    return {...record,...details,profilePhoto:await driverProfilePhoto(row),dlApiStatus:(await dlReviewState(row.id,row)).status};
  }));
  return {rows:displayed,meta:{total,page:query.page,pageSize:query.pageSize,summary:{...summary,noLogin:summary.totalDrivers-summary.driverUsers}}};
}

/** Prepared SQL predicates shared by page IDs and aggregate counts; no full ID arrays. */
export function driverSearchPredicate(query:z.infer<typeof DriverListQuery>, scope?: { ownerUserId: string | null }){
  const terms:Prisma.Sql[]=[Prisma.sql`true`];
  // Vendor/Sales/Data Operator see only drivers they themselves created — never a
  // client-supplied filter, always the caller's own id (see `driverOwnerScope`).
  if (scope?.ownerUserId) terms.push(Prisma.sql`d."createdByUserId" = ${scope.ownerUserId}`);
  if(query.search?.trim()){
    const pattern='%'+query.search.trim().replace(/[\\%_]/g,'\\$&')+'%';
    terms.push(Prisma.sql`(d.id ILIKE ${pattern} OR d."firstName" ILIKE ${pattern} OR d."lastName" ILIKE ${pattern} OR concat_ws(' ',d."firstName",d."lastName") ILIKE ${pattern} OR d.phone ILIKE ${pattern} OR d.email ILIKE ${pattern} OR d."dlNo" ILIKE ${pattern})`);
  }
  for(const key of ['city','state','sourceType','accountStatus'] as const)if(query[key])terms.push(Prisma.sql`${Prisma.raw('d."'+key+'"')}=${query[key]}`);
  if(query.status)terms.push(query.status==='Needs Review'?Prisma.sql`d.status<>'Verified'`:Prisma.sql`d.status=${query.status}`);
  if(query.driverType)terms.push(Prisma.sql`d."driverType" ILIKE ${'%'+query.driverType+'%'}`);
  if(query.login)terms.push(query.login==='linked'?Prisma.sql`d."userId" IS NOT NULL`:Prisma.sql`d."userId" IS NULL`);
  if(query.profile==='incomplete')terms.push(Prisma.sql`d."onboardingStatus"='in_progress'`);
  if(query.documents==='missing')terms.push(Prisma.sql`NOT EXISTS(SELECT 1 FROM "DriverDocument" doc WHERE doc."driverId"=d.id AND doc."archivedAt" IS NULL AND COALESCE(LENGTH(doc."filePath"),0)>0)`);
  if(query.fee)terms.push(Prisma.sql`p."feeStatus"=${query.fee}`);
  if(query.licence)terms.push(Prisma.sql`p."licenceStatus"=${query.licence}`);
  if(query.eligibility)terms.push(Prisma.sql`p."readyForTrips"=${query.eligibility==='ready'}`);
  return Prisma.join(terms,' AND ');
}
