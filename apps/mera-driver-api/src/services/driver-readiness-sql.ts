import { Prisma } from '../generated/prisma-client';

/** Read-only PostgreSQL projection for scalable list filters and global cards.
 * Assignment still rechecks the live policy under booking and driver row locks. */
export function driverPolicySql(ids?: string[], schedule?:{id?:string;startsAt:Date;endsAt:Date}) {
  const manual = !process.env.DRIVER_DL_POLICY || process.env.DRIVER_DL_POLICY === 'manual';
  return Prisma.sql`
    WITH fee_balance AS (
      SELECT d.*, COALESCE(SUM(CASE WHEN m.kind = 'registration_payment' THEN m."amountPaise" ELSE 0 END),0) AS paid,
        COALESCE(SUM(CASE WHEN m.kind = 'registration_refund' THEN m."amountPaise" ELSE 0 END),0) AS refunded,
        COALESCE(SUM(CASE WHEN m.kind = 'registration_waiver' THEN m."amountPaise" ELSE 0 END),0) AS waived
      FROM "Driver" d LEFT JOIN "MoneyMovement" m ON m."driverId" = d.id AND m.kind LIKE 'registration_%'
      ${ids?.length ? Prisma.sql`WHERE d.id IN (${Prisma.join(ids)})` : Prisma.empty}
      GROUP BY d.id
    ), policy AS (
      SELECT f.*, CASE
        WHEN f."registrationFeePaise"<=0 THEN 'No fee required'
        WHEN paid > 0 AND paid-refunded >= f."registrationFeePaise" THEN 'Paid'
        WHEN waived >= GREATEST(0,f."registrationFeePaise"-paid+refunded) AND waived>0 THEN 'Waived'
        WHEN waived>0 AND paid-refunded+waived>0 THEN 'Partial'
        WHEN paid-refunded>0 THEN 'Partial'
        WHEN refunded > 0 AND paid-refunded < f."registrationFeePaise" THEN 'Refunded'
        WHEN EXISTS(SELECT 1 FROM "PaymentIntent" i WHERE i."driverId"=f.id AND i.status IN ('pending','processing')) THEN 'Pending'
        WHEN EXISTS(SELECT 1 FROM "PaymentIntent" i WHERE i."driverId"=f.id AND i.status='failed') THEN 'Failed'
        ELSE 'Unpaid' END AS "feeStatus",
        CASE WHEN f."dlExpiryDate" ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN
          CASE WHEN RIGHT(f."dlExpiryDate",2)::int <= EXTRACT(DAY FROM (make_date(LEFT(f."dlExpiryDate",4)::int,SUBSTRING(f."dlExpiryDate",6,2)::int,1)+INTERVAL '1 month'-INTERVAL '1 day'))
          THEN f."dlExpiryDate"::date >= (now() AT TIME ZONE 'UTC')::date ELSE false END
        ELSE false END AS "licenceCurrent",
        EXISTS(SELECT 1 FROM "Booking" b WHERE b."driverId"=f.id AND b.status IN ('confirmed','on_the_way','arrived','in_progress')
          AND ${schedule?Prisma.sql`(b.id<>${schedule.id??''} AND (b."startsAt" IS NULL OR b."endsAt" IS NULL OR (b."startsAt"<${schedule.endsAt} AND b."endsAt">${schedule.startsAt}) OR (b.status='in_progress' AND b."endsAt"<=now())))`:Prisma.sql`(b."startsAt" IS NULL OR b."endsAt" IS NULL OR b.status='in_progress' OR (b."startsAt"<=now() AND b."endsAt">now()))`}) AS "busyNow"
      FROM fee_balance f
    ) SELECT id, "feeStatus", "busyNow",(paid-refunded)::float8 AS "registrationNetReceivedPaise",GREATEST(0,"registrationFeePaise"-paid+refunded-waived)::float8 AS "registrationRemainingPaise",
      CASE WHEN "licenceCurrent" AND COALESCE(LENGTH(TRIM("dlNo")),0)>0 AND status='Verified' THEN 'Manual approved'
        WHEN "dlExpiryDate" IS NOT NULL AND NOT "licenceCurrent" THEN 'Expired / invalid' ELSE 'Not checked' END AS "licenceStatus",
      (${manual} AND "accountStatus"='Active' AND status='Verified' AND online AND "licenceCurrent"
       AND COALESCE(LENGTH(TRIM("dlNo")),0)>0 AND "completedSubSteps" @> ARRAY[10,11,12,13,20,21,30,31,32,40]::integer[]
       AND (NOT "registrationFeeRequired" OR "registrationFeePaise"<=0 OR "feeStatus" IN ('Paid','Waived')) AND NOT "busyNow") AS "readyForTrips"
    FROM policy`;
}
export interface DriverPolicyRow { id:string;feeStatus:string;registrationNetReceivedPaise:number;registrationRemainingPaise:number;licenceStatus:string;busyNow:boolean;readyForTrips:boolean }
