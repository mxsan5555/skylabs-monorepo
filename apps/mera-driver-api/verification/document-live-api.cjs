const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict'),jwt=require('jsonwebtoken');
require('dotenv').config({path:path.resolve('apps/mera-driver-api/.env.local'),quiet:true});
const {PrismaClient}=require('../src/generated/prisma-client');const prisma=new PrismaClient();
const api='http://localhost:3335';let fixture;
(async()=>{try{
 const user=await prisma.user.findFirst({where:{status:'active',deletedAt:null,roles:{some:{role:{isSuperAdmin:true,isActive:true}}}},include:{roles:{include:{role:true}}}});assert.ok(user);
 const token=jwt.sign({sub:user.id,roles:user.roles.map(r=>r.role.key),app:'mera-driver',portalContext:'staff'},process.env.JWT_SECRET,{expiresIn:'10m'});
 const call=async(method,url,body)=>{const response=await fetch(api+url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,...await response.json()};};
 fixture=await prisma.driver.create({data:{firstName:'Document concurrency verification fixture'}});const url='/drivers/'+fixture.id+'/documents';
 const metadata={category:'education',type:'10th Certificate / Marksheet',typeKey:'education:10th'};
 const concurrent=await Promise.all([call('POST',url,metadata),call('POST',url,metadata)]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[201,422]);assert.equal(concurrent.find(r=>r.status===422).error.code,'DOCUMENT_TYPE_DUPLICATE');
 const original=concurrent.find(r=>r.status===201).data;
 const duplicate=await call('POST',url,metadata);assert.equal(duplicate.status,422);assert.ok(duplicate.error.details.fieldErrors.type);
 const replacement=await call('POST',url,{...metadata,replaceDocumentId:original.id});assert.equal(replacement.status,201);assert.equal(replacement.data.version,2);
 const stale=await call('POST',url,{...metadata,replaceDocumentId:original.id});assert.equal(stale.status,409);
 const list=await call('GET',url);assert.equal(list.data.length,2);assert.equal(list.data.filter(d=>!d.archivedAt).length,1);assert.ok(list.data.find(d=>d.id===original.id).archivedAt);
 const failed=await call('DELETE',url+'/00000000-0000-4000-8000-000000000000');assert.equal(failed.status,404);assert.equal((await call('POST',url,metadata)).status,422);
 const batch=await call('POST',url,[metadata,metadata]);assert.equal(batch.status,422);
 assert.equal((await call('DELETE',url+'/'+replacement.data.id)).status,200);assert.equal((await call('POST',url,metadata)).status,201);
 // Seed a legacy duplicate only on the disposable fixture; replacement must not silently archive its sibling.
 const active=await prisma.driverDocument.findFirst({where:{driverId:fixture.id,archivedAt:null}});
 const legacy=await prisma.driverDocument.create({data:{driverId:fixture.id,category:'education',type:metadata.type,version:10,fileName:'legacy-preserved.pdf'}});
 const update=await call('POST',url,{...metadata,replaceDocumentId:active.id});assert.equal(update.status,201);assert.equal(update.data.version,11);assert.equal((await prisma.driverDocument.findUnique({where:{id:legacy.id}})).archivedAt,null);
 assert.equal((await call('GET',url)).data.find(d=>d.id===legacy.id).fileName,'legacy-preserved.pdf');
 fs.writeFileSync(path.resolve('apps/mera-driver-api/verification/artifacts/document-live-api-results.json'),JSON.stringify({realApi:true,realDatabase:true,actualLogin:false,fixture:'temporary unlinked driver; metadata only; no provider calls',passed:['concurrent create: one succeeds, one rejects','direct duplicate field error','explicit version replacement','stale replacement rejected','failed delete retains reservation','array payload rejected (no supported batch endpoint)','archive releases type','legacy sibling and history preserved'],cleanup:'temporary driver, its documents and its test audit logs removed; no existing records modified'},null,2));
 console.log('Real document API/concurrency checks passed.');
 }finally{if(fixture){await prisma.auditLog.deleteMany({where:{targetId:fixture.id}});await prisma.driverDocument.deleteMany({where:{driverId:fixture.id}});await prisma.driver.delete({where:{id:fixture.id}});}await prisma.$disconnect();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
