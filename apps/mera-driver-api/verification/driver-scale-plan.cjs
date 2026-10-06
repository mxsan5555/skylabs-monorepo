// Local connection-private TEMP data only. No production Driver insert or index.
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');const ts=require('typescript');
require('dotenv').config({path:'apps/mera-driver-api/.env.local',quiet:true});
assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname));
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {prisma}=require('../src/lib/prisma.ts');const {Prisma}=require('../src/generated/prisma-client');
const {candidatePageSql}=require('../src/services/trip-workflow.service.ts');const {driverPolicySql}=require('../src/services/driver-readiness-sql.ts');const {DriverListQuery,driverSearchPredicate}=require('../src/services/driver-list.service.ts');
async function run(){const before=await prisma.driver.count();const result=await prisma.$transaction(async tx=>{
 await tx.$executeRawUnsafe('CREATE TEMP TABLE "Driver" (LIKE public."Driver" INCLUDING ALL) ON COMMIT DROP');
 await tx.$executeRaw`INSERT INTO "Driver" (id,"firstName","updatedAt","userId",status,online,city,"driverType","completedSubSteps","registrationFeeRequired","dlNo","dlExpiryDate") SELECT 'scale-'||lpad(i::text,6,'0'),'Scale Driver '||lpad(i::text,6,'0'),now(),CASE WHEN i%5 IN(0,1) THEN 'scale-user-'||i ELSE NULL END,CASE WHEN i%5 IN(0,1) THEN 'Verified' ELSE 'Non-Verified' END,i%4=0,'Scale City '||(i%10),'Car Driver',ARRAY[10,11,12,13,20,21,30,31,32,40,41]::integer[],false,'SCALE-DL-'||i,'2099-01-01' FROM generate_series(1,100000) i`;
 await tx.$executeRawUnsafe('CREATE TEMP TABLE "User" (LIKE public."User" INCLUDING ALL) ON COMMIT DROP');
 await tx.$executeRaw`INSERT INTO "User" (id,name,"updatedAt") SELECT "userId",'Transient scale user',now() FROM "Driver" WHERE "userId" IS NOT NULL`;
 await tx.$executeRawUnsafe('ANALYZE "Driver"');await tx.$executeRawUnsafe('ANALYZE "User"');
 const policy=(query)=>Prisma.sql`SELECT p.*,d."userId",d.status FROM (${driverPolicySql()}) p JOIN "Driver" d ON d.id=p.id WHERE ${driverSearchPredicate(DriverListQuery.parse(query))}`;
 const all=policy({});const totals=await tx.$queryRaw(Prisma.sql`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE "userId" IS NOT NULL)::int AS users,COUNT(*) FILTER(WHERE status<>'Verified')::int AS review,COUNT(*) FILTER(WHERE "readyForTrips")::int AS ready FROM (${all}) p`);
 assert.deepEqual(totals[0],{total:100000,users:40000,review:60000,ready:10000});
 const page=Prisma.sql`SELECT p.* FROM (${all}) p JOIN "Driver" d ON d.id=p.id ORDER BY d."firstName" ASC,d.id ASC LIMIT 25 OFFSET 99975`;
 const rows=await tx.$queryRaw(page);assert.equal(rows.length,25);assert.equal(rows[0].id,'scale-099976');assert.equal(rows[24].id,'scale-100000');
 const filtered=await tx.$queryRaw(Prisma.sql`SELECT COUNT(*)::int AS total FROM (${policy({city:'Scale City 0',status:'Verified',availability:'online'})}) p WHERE p."readyForTrips"`);assert.equal(filtered[0].total,5000);
 const candidates=await tx.$queryRaw(candidatePageSql({id:'scale-booking',city:null,requiredSkill:'Car Driver',startsAt:new Date('2090-01-01'),endsAt:new Date('2090-01-02')},{publicOnly:true,pageSize:100000}));assert.equal(candidates.length,25);assert.ok(candidates.every(row=>row.ready));
 const plan=await tx.$queryRaw(Prisma.sql`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${page}`);return {totals:totals[0],candidateRows:candidates.length,lastPageRows:rows.length,filteredReady:filtered[0].total,plan:plan[0]['QUERY PLAN'],note:'100000 generated rows in a connection-private TEMP Driver table, dropped at commit. Existing copied indexes only. Not a production latency benchmark.'};
 },{timeout:120000,maxWait:10000});const after=await prisma.driver.count();assert.equal(after,before);fs.writeFileSync(path.resolve('apps/mera-driver-api/verification/artifacts/driver-scale-plan.json'),JSON.stringify({...result,before,after},null,2));console.log(JSON.stringify({scale:'passed',totals:result.totals,lastPageRows:25,filteredReady:5000,publicDriversBefore:before,publicDriversAfter:after,executionMs:result.plan[0]['Execution Time']}));}
run().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>prisma.$disconnect());
