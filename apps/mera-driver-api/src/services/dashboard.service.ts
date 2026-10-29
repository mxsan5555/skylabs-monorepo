import type { Request } from 'express';
import { prisma } from '../lib/prisma';
import { Prisma } from '../generated/prisma-client';
import { driverOwnerScope, bookingOwnerScope, customerOwnerScope } from '../lib/ownerScope';
import { resolveEffectivePermissionsForUser } from './permission.service';
import { driverPolicySql } from './driver-readiness-sql';
import { accountBookingSql } from './accounts.service';
import { bookingScopeSql, ownerWhere } from './booking.service';

export interface DashboardCard { key:string; title:string; value:number; money?:boolean; hint:string; path:string }
export interface DashboardLink { label:string; path:string }
const roles = ['super_admin','admin','vendor','marketing','sales','company','data_operator','support','kyc_verification'];
const names = ['Super Admin','Admin','Vendor','Marketing','Sales','Company','Data Operator','Support','KYC Verification'];

/** No provider calls, client-selected identities, full-record downloads or cached account data. */
export async function accountDashboard(req:Request) {
  const permissions=new Set(await resolveEffectivePermissionsForUser(req.user!.sub,req.user!.roles));
  const activeRoles=await prisma.role.findMany({where:{key:{in:req.user!.roles},isActive:true,users:{some:{userId:req.user!.sub}}},select:{key:true,name:true}});
  const role=roles.find(key=>activeRoles.some(row=>row.key===key))??'staff';
  const user=await prisma.user.findUniqueOrThrow({where:{id:req.user!.sub},select:{name:true}});
  const cards:DashboardCard[]=[],actions:DashboardLink[]=[],attention:DashboardLink[]=[],records:{label:string;detail:string;path:string}[]=[];
  const gaps:string[]=[];
  const can=(key:string)=>permissions.has(key);
  const add=(key:string,title:string,value:number,path:string,hint='Within your permitted scope',money=false)=>cards.push({key,title,value,path,hint,money});
  if(can('drivers:view') && !['marketing','company','sales','support'].includes(role)) {
    const owner=await driverOwnerScope(req);
    const scope=owner?Prisma.sql`d."createdByUserId"=${owner}`:Prisma.sql`true`;
    const cohort=Prisma.sql`SELECT d.*,p."readyForTrips",(d.status<>'Verified' AND (d."onboardingStatus"='completed' OR d."assignedVerifierId" IS NOT NULL OR EXISTS(SELECT 1 FROM "DriverKycCheck" ck WHERE ck."driverId"=d.id))) AS review FROM "Driver" d JOIN (${driverPolicySql()}) p ON p.id=d.id WHERE ${scope}`;
    const [totals]=await prisma.$queryRaw<{all:number;review:number;incomplete:number;missing:number;ready:number}[]>(Prisma.sql`SELECT COUNT(*)::int AS all,COUNT(*) FILTER(WHERE review)::int AS review,COUNT(*) FILTER(WHERE "onboardingStatus"='in_progress')::int AS incomplete,COUNT(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM "DriverDocument" doc WHERE doc."driverId"=d.id AND doc."archivedAt" IS NULL AND COALESCE(LENGTH(doc."filePath"),0)>0))::int AS missing,COUNT(*) FILTER(WHERE "readyForTrips")::int AS ready FROM (${cohort}) d`);
    add('drivers','All Drivers',totals.all,'/account/drivers?view=all&from=dashboard');
    add('review','Need KYC Review',totals.review,'/account/drivers?view=review&from=dashboard');
    if(['data_operator','vendor'].includes(role)) {
      if(role==='data_operator')add('incomplete','Incomplete Profiles',totals.incomplete,'/account/drivers?profile=incomplete&from=dashboard');
      add('missing','Missing Documents',totals.missing,'/account/drivers?documents=missing&from=dashboard','No current uploaded documents');
      if(totals.incomplete)attention.push({label:`${totals.incomplete} profiles need information`,path:'/account/drivers?profile=incomplete&from=dashboard'});
      if(totals.missing)attention.push({label:`${totals.missing} drivers need documents`,path:'/account/drivers?documents=missing&from=dashboard'});
    }
    if(totals.review)attention.push({label:`${totals.review} drivers need KYC review`,path:'/account/drivers?view=review&from=dashboard'});
    const rows=await prisma.driver.findMany({where:{...(owner?{createdByUserId:owner}:{}),...(role==='data_operator'?{onboardingStatus:'in_progress'}:{})},select:{id:true,firstName:true,lastName:true,phone:true,status:true},orderBy:{updatedAt:'desc'},take:5});
    records.push(...rows.map(d=>({label:[d.firstName,d.lastName].filter(Boolean).join(' '),detail:`${d.phone??''} · ${d.status==='Non-Verified'?'Pending':d.status}`,path:can('drivers:edit')?`/account/drivers?edit=${d.id}`:`/account/drivers/${d.id}/details`})));
  }
  if((role==='kyc_verification'||role==='staff')&&can('kyc-assignments:view')) {
    const where={assignedVerifierId:req.user!.sub};
    const [all,pending,issues,completed,rows]=await Promise.all([
      prisma.driver.count({where}),prisma.driver.count({where:{...where,status:{not:'Verified'},kycChecks:{none:{status:'Issue'}}}}),
      prisma.driver.count({where:{...where,status:{not:'Verified'},kycChecks:{some:{status:'Issue'}}}}),prisma.driver.count({where:{...where,status:'Verified'}}),
      prisma.driver.findMany({where:{...where,status:{not:'Verified'}},select:{id:true,firstName:true,lastName:true,phone:true,status:true},orderBy:{updatedAt:'desc'},take:5}),
    ]);
    add('assigned','Assigned Drivers',all,'/account/kyc-assignments');add('pending','Pending Reviews',pending,'/account/kyc-assignments?state=Assigned');
    add('issues','Issues Raised',issues,'/account/kyc-assignments?state=Issues%20Raised');add('completed','Completed Reviews',completed,'/account/kyc-assignments?state=Completed');
    if(issues)attention.push({label:`${issues} assigned cases have issues`,path:'/account/kyc-assignments?state=Issues%20Raised'});
    records.push(...rows.map(d=>({label:[d.firstName,d.lastName].filter(Boolean).join(' '),detail:d.phone??'',path:`/account/kyc-assignments?review=${d.id}`})));
    actions.push({label:'Open Review Queue',path:'/account/kyc-assignments'});
    gaps.push('A distinct resubmission state is not persisted; changed records appear in the assigned review queue.');
  }
  if(can('trips.bookings:view')&&role!=='marketing') {
    const scope=await bookingOwnerScope(req),cohort=Prisma.sql`SELECT * FROM (${accountBookingSql()}) b WHERE ${bookingScopeSql(scope)}`;
    const [t]=await prisma.$queryRaw<{all:number;today:number;pending:number;unassigned:number;unpaid:number;confirmed:number;cancelled:number;upcoming:number;ongoing:number;outstanding:number;collected:number;commission:number}[]>(Prisma.sql`SELECT COUNT(*)::int AS all,COUNT(*) FILTER(WHERE (("startsAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date)::int AS today,COUNT(*) FILTER(WHERE status='requested')::int AS pending,COUNT(*) FILTER(WHERE "driverId" IS NULL AND status NOT IN ('completed','cancelled'))::int AS unassigned,COUNT(*) FILTER(WHERE (CASE WHEN "farePaise" IS NULL THEN "paymentStatus" ELSE "computedPaymentStatus" END) IN ('unpaid','partial','pending') AND status<>'cancelled')::int AS unpaid,COUNT(*) FILTER(WHERE status IN ('confirmed','accepted'))::int AS confirmed,COUNT(*) FILTER(WHERE status='cancelled')::int AS cancelled,COUNT(*) FILTER(WHERE status IN ('requested','confirmed','accepted','on_the_way','arrived') AND "startsAt">=now())::int AS upcoming,COUNT(*) FILTER(WHERE status IN ('in_progress','ongoing'))::int AS ongoing,COALESCE(SUM(GREATEST(0,"farePaise"-"customerCollected")) FILTER(WHERE status<>'cancelled'),0)::float8 AS outstanding,COALESCE(SUM(collected),0)::float8 AS collected,COALESCE(SUM(commission),0)::float8 AS commission FROM (${cohort}) b`);
    const base='/account/trips/bookings';
    if(role==='sales'){add('bookings','All Bookings',t.all,base);add('pending','Awaiting Confirmation',t.pending,base+'?status=requested');add('unpaid','Unpaid Bookings',t.unpaid,base+'?payment=unpaid');add('confirmed','Confirmed Bookings',t.confirmed,base+'?status=confirmed');}
    else if(role==='support'){add('pending','Pending Bookings',t.pending,base+'?status=requested');add('unassigned','Unassigned Bookings',t.unassigned,base+'?assignment=unassigned');add('cancelled','Cancelled Bookings',t.cancelled,base+'?status=cancelled');add('unpaid','Unpaid Bookings',t.unpaid,base+'?payment=unpaid');}
    else if(role==='company'){add('bookings','Company Bookings',t.all,base);add('upcoming','Upcoming Trips',t.upcoming,base+'?timing=upcoming');add('ongoing','Ongoing Trips',t.ongoing,base+'?status=in_progress');if(can('payments.overview:view'))add('outstanding','Outstanding Payment',t.outstanding,'/account/accounts/booking-payments','Current balance · priced bookings',true);}
    else if(role==='vendor'){add('bookings','Own Bookings',t.all,base);}
    else {add('today',"Today's Bookings",t.today,base+'?timing=today','Schedule date · India time');add('unassigned','Pending Driver Assignment',t.unassigned,base+'?assignment=unassigned');}
    if(can('payments.overview:view')&&['super_admin','admin'].includes(role)){add('collections','Confirmed Collections',t.collected,'/account/accounts/booking-payments','All time · platform booking receipts; excludes driver COD and registration fees',true);add('commission','Recorded Commission',t.commission,'/account/accounts/commissions','All time · completed, fully paid bookings',true);}
    if(t.pending)attention.push({label:`${t.pending} bookings await confirmation`,path:base+'?status=requested'});
    if(t.unassigned)attention.push({label:`${t.unassigned} bookings await driver assignment`,path:base+'?assignment=unassigned'});
    if(role!=='data_operator'){
      records.splice(0);
      const work:Prisma.BookingWhereInput=role==='company'?{status:{in:['requested','confirmed','on_the_way','arrived','accepted']},startsAt:{gte:new Date()}}:role==='sales'?{OR:[{status:'requested'},{status:{not:'cancelled'},paymentStatus:{in:['pending','unpaid','partial']}}]}:role==='support'?{OR:[{status:{in:['requested','cancelled']}},{driverId:null,status:{notIn:['completed','cancelled']}}]}:{};
      const rows=await prisma.booking.findMany({where:{AND:[ownerWhere(scope),work]},select:{bookingCode:true,customerName:true,status:true,driverName:true},orderBy:{createdAt:'desc'},take:5});
      records.push(...rows.map(b=>({label:b.bookingCode,detail:`${b.customerName} · ${b.status}${b.driverName?' · '+b.driverName:''}`,path:base+'?search='+encodeURIComponent(b.bookingCode)})));
    }
    if(can('trips.bookings:create'))actions.push({label:'Create Booking',path:base+'?add=1'});
    if(can('trips.bookings:edit')&&!can('trips.bookings:create'))actions.push({label:'Open Bookings',path:base});
  }
  if(can('drivers:view')&&can('drivers:create')&&role!=='marketing')actions.push({label:'Add Driver',path:'/account/drivers?add=1'});
  if(can('drivers:assign'))actions.push({label:'Assign Verifier',path:'/account/drivers?view=all&from=dashboard'});
  if(can('payments.overview:view'))actions.push({label:'Accounts',path:'/account/accounts/overview'});
  if(role==='staff'&&can('customers:view')){const owner=customerOwnerScope(req);add('customers','Customers',await prisma.customer.count({where:owner?{createdByUserId:owner}:{}}),'/account/customers');}
  if(can('customers:view'))actions.push({label:'Customer Lookup',path:'/account/customers'});
  if(can('customers:view')&&can('customers:create'))actions.push({label:'Add Customer',path:'/account/customers?add=1'});
  if(role==='marketing') {
    gaps.push('Promotions, attribution/conversion tracking and registration reports have no working database/API metric source.');
    for(const [permission,label,path] of [['promotions.promo-codes:view','Promotions','/account/promotions/promo-codes'],['faqs:view','Website Content','/account/faqs'],['reports:view','Reports','/account/reports']])if(can(permission))actions.push({label,path});
  }
  if(role==='vendor')gaps.push('No vendor settlement ledger exists; platform-wide collections and commission are omitted.');
  return {userName:user.name,role: activeRoles[0]?.name ?? names[roles.indexOf(role)] ?? 'Staff',cards:cards.slice(0,role==='super_admin'?6:4),actions:actions.slice(0,4),attention:attention.slice(0,3),records:records.slice(0,5),gaps};
}
