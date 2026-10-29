import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { normalizeIdentifier } from '../lib/normalizeIdentifier';
import { HttpError } from '../middleware/errorHandler';
import { createDriver } from './driver.service';
const label = (name:string) => /non[ -]?commercial/i.test(name) ? 'Non-commercial' : /^commercial$/i.test(name) ? 'Commercial' : /^other$/i.test(name) ? 'Other' : null;
export const DriverApplicationSchema=z.object({fullName:z.string().trim().min(2).max(150).refine(v=>/\p{L}/u.test(v),'Enter your full name'),phone:z.string().trim().max(30).transform(normalizeIdentifier).refine(v=>/^\+91[6-9]\d{9}$/.test(v),'Enter a valid Indian mobile number'),driverTypeId:z.string().uuid()}).strict();
export async function driverApplicationOptions() {
  const options=await prisma.masterListItem.findMany({where:{category:'driver-types',status:'Active'},orderBy:{createdAt:'asc'}});
  return options.flatMap(option=>{const text=label(option.name);return text?[{id:option.id,label:text}]:[]}).sort((a,b)=>['Commercial','Non-commercial','Other'].indexOf(a.label)-['Commercial','Non-commercial','Other'].indexOf(b.label));
}
export async function submitDriverApplication(input:z.infer<typeof DriverApplicationSchema>) {
  await prisma.$transaction(async tx=>{
    // A phone-normalized transaction lock serializes repeated/concurrent public applications.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${input.phone},0))`;
    const legacy=input.phone.slice(3);
    const existing=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "Driver" WHERE regexp_replace(COALESCE(phone,''),'[^0-9]','','g') IN (${legacy},${'91'+legacy}) UNION ALL SELECT id FROM "User" WHERE regexp_replace(COALESCE(phone,''),'[^0-9]','','g') IN (${legacy},${'91'+legacy}) LIMIT 1`;
    const user=await tx.user.findFirst({where:{OR:[{phone:input.phone},{phone:legacy}]},select:{id:true}});
    if(existing.length || user) throw new HttpError(409,'APPLICATION_ALREADY_EXISTS','Is phone number par application ya account pehle se maujood hai. Hamari team se sampark karein.');
    const type=await tx.masterListItem.findUnique({where:{id:input.driverTypeId}});
    if(!type || type.category!=='driver-types' || type.status!=='Active' || !label(type.name)) throw new HttpError(422,'DRIVER_TYPE_INVALID','Choose an available Driver Type.');
    const source=await tx.masterListItem.findFirst({where:{category:'source-types',name:{equals:'website',mode:'insensitive'},status:'Active'}});
    if(!source) throw new HttpError(503,'APPLICATION_CONFIG_MISSING','Website application source is unavailable. Please contact the team.');
    const [firstName,...rest]=input.fullName.split(/\s+/);
    await createDriver({firstName,lastName:rest.join(' ') || undefined,phone:legacy,driverType:type.name,sourceType:source.name,completeStep:false}, {}, tx);
  });
  return {message:'Aapki driver application submit ho gayi hai. Hamari team review karke aapka login activate karegi.'};
}
