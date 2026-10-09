const path=require('node:path');require('dotenv').config({path:path.resolve('apps/mera-driver-api/.env.local'),quiet:true});
const {PrismaClient}=require('../src/generated/prisma-client');const db=new PrismaClient();
(async()=>{try{for(const port of [4400,4401,3334,3335]){try{const r=await fetch(`http://localhost:${port}/`,{signal:AbortSignal.timeout(2000)});console.log('port',port,'HTTP',r.status);}catch{console.log('port',port,'unavailable');}}
 const result=await db.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name='Customer' AND column_name='createdByUserId'`;console.log('customer owner column',result.length===1?'present':'absent');
 const migrations=await db.$queryRaw`SELECT migration_name, finished_at IS NOT NULL AS applied FROM "_prisma_migrations" WHERE rolled_back_at IS NULL ORDER BY started_at DESC LIMIT 8`;console.log(JSON.stringify(migrations));
 console.log('existing direct grants',await db.userPermissionOverride.count({where:{effect:'grant'}}));
 console.log('direct grant keys',(await db.userPermissionOverride.findMany({where:{effect:'grant'},select:{permission:{select:{key:true}}}})).map(row=>row.permission.key));
 console.log('active staff role counts',await db.role.count({where:{isActive:true,key:{notIn:['customer','driver']}}}));
 }catch(e){console.error(e.code||e.message);process.exitCode=1;}finally{await db.$disconnect();}})();
