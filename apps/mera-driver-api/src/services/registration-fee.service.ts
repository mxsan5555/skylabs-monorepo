import type { MoneyMovement } from '../generated/prisma-client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errorHandler';

/** The policy is an amount owed; only confirmed ledger movements settle it. */
export function registrationFeeBalance(policy:{registrationFeePaise:number}, movements:Pick<MoneyMovement,'kind'|'amountPaise'>[] = []) {
  const sum=(kind:string)=>movements.filter(m=>m.kind===kind).reduce((total,m)=>total+m.amountPaise,0);
  const receivedPaise=sum('registration_payment'),refundedPaise=sum('registration_refund'),waivedPaise=sum('registration_waiver');
  const netReceivedPaise=receivedPaise-refundedPaise,remainingPaise=Math.max(0,policy.registrationFeePaise-netReceivedPaise-waivedPaise);
  const fee=policy.registrationFeePaise<=0?'No fee required':remainingPaise===0&&waivedPaise>0?'Waived':netReceivedPaise>=policy.registrationFeePaise?'Paid':netReceivedPaise+waivedPaise>0?'Partial':refundedPaise>0?'Refunded':'Unpaid';
  return {fee,receivedPaise,refundedPaise,waivedPaise,netReceivedPaise,remainingPaise};
}

export async function registrationFeeRecord(id:string,ownerUserId:string|null) {
  const driver=await prisma.driver.findFirst({where:{id,...(ownerUserId?{createdByUserId:ownerUserId}:{})},select:{id:true,firstName:true,lastName:true,city:true,registrationFeePaise:true,registrationFeeRequired:true}});
  if(!driver)throw new HttpError(404,'NOT_FOUND','Driver not found');
  const totals=await prisma.$queryRaw<{kind:string;amountPaise:number}[]>`SELECT kind,SUM("amountPaise")::float8 AS "amountPaise" FROM "MoneyMovement" WHERE "driverId"=${id} AND kind IN ('registration_payment','registration_refund','registration_waiver') GROUP BY kind`;
  const receipts=await prisma.moneyMovement.findMany({where:{driverId:id,kind:{in:['registration_payment','registration_refund','registration_waiver']}},orderBy:[{createdAt:'desc'},{id:'asc'}],take:20});
  return {...driver,...registrationFeeBalance(driver,totals),receipts};
}
