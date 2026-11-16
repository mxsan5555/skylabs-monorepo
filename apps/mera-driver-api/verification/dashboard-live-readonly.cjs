// Run with TSX_TSCONFIG_PATH=apps/mera-driver-api/tsconfig.app.json node --import tsx.
// Existing local accounts only. Single connection is explicitly read-only; providers are blocked.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
require('dotenv').config({path:'apps/mera-driver-api/.env.local',quiet:true});
const url=new URL(process.env.DATABASE_URL);
assert.ok(['localhost','127.0.0.1'].includes(url.hostname),'Only an existing local database may be inspected');
url.searchParams.set('connection_limit','1');process.env.DATABASE_URL=url.toString();
let providerCalls=0;global.fetch=async()=>{providerCalls++;throw new Error('Providers are disabled during verification');};
const {prisma}=require('../src/lib/prisma.ts');
const {accountDashboard}=require('../src/services/dashboard.service.ts');
const {driverOwnerScope,bookingOwnerScope}=require('../src/lib/ownerScope.ts');
const {searchDrivers}=require('../src/services/driver-list.service.ts');
const {accountsOverview}=require('../src/services/accounts.service.ts');
const {app}=require('../src/app.ts'); // no main.ts, listener, offer sweeper or timers
const {signAccessToken}=require('../src/lib/jwt.ts');
const request=require('supertest');
async function run(){
 const results=[],gaps=[];
 try{
  await prisma.$executeRawUnsafe('SET default_transaction_read_only = on');
  for(const role of ['super_admin','admin','vendor','marketing','sales','company','data_operator','support','kyc_verification']){
   const users=await prisma.user.findMany({where:{status:'active',deletedAt:null,roles:{some:{role:{key:role,isActive:true}}}},select:{id:true},take:2});
   if(users.length<2&&['vendor','company','kyc_verification'].includes(role))gaps.push(`${role}: ${users.length} existing active accounts; two-account live comparison unavailable`);
   if(!users.length&&!['vendor','company','kyc_verification'].includes(role))gaps.push(`${role}: no existing active account; covered with mocked API/browser fixtures`);
   for(const user of users){
    const req={user:{sub:user.id,roles:[role]},query:{vendorId:'other',companyId:'other',userId:'other',role:'super_admin'}};
    const result=await accountDashboard(req);const ownerUserId=await driverOwnerScope(req);
    const drivers=result.cards.find(c=>c.key==='drivers');
    if(drivers){const list=await searchDrivers({pageSize:1},{ownerUserId});assert.equal(drivers.value,list.meta.summary.totalDrivers);const review=result.cards.find(c=>c.key==='review');if(review)assert.equal(review.value,list.meta.summary.kycPending);}
    const collections=result.cards.find(c=>c.key==='collections');
    if(collections){const accounts=await accountsOverview({},await bookingOwnerScope(req));assert.equal(collections.value,accounts.totals.collected);assert.equal(result.cards.find(c=>c.key==='commission').value,accounts.totals.commission);}
    // Exercise every aggregate's actual filtered list SQL through the mounted API.
    const token=signAccessToken({sub:user.id,roles:[role],app:'mera-driver',portalContext:'staff'});
    const mounted=await request(app).get('/dashboard?role=super_admin&userId=other').set('Authorization','Bearer '+token);assert.equal(mounted.status,200);assert.deepEqual(mounted.body.data.cards,result.cards);
    for(const card of result.cards){
     const destination=new URL(card.path,'http://local');
     if(destination.pathname==='/account/drivers'){
       const list=await searchDrivers(Object.fromEntries(destination.searchParams),{ownerUserId});assert.equal(card.value,list.meta.total,card.title);
     }
     if(destination.pathname==='/account/kyc-assignments'){
       const response=await request(app).get('/drivers/assigned-to-me'+destination.search).set('Authorization','Bearer '+token);assert.equal(response.status,200);assert.equal(card.value,response.body.meta.total,card.title);
     }
     if(destination.pathname==='/account/trips/bookings'){
      const response=await request(app).get('/trips/bookings'+destination.search).set('Authorization','Bearer '+token);assert.equal(response.status,200,JSON.stringify(response.body.error));
      if(card.key!=='outstanding'&&response.body.data.length<1000)assert.equal(card.value,response.body.data.length,card.title);
     }
    }
    results.push({role,cards:result.cards.length,sqlAndDestinationConsistency:true});
   }
  }
  for(const role of ['driver','customer']){
   const users=await prisma.user.findMany({where:{status:'active',deletedAt:null,roles:{some:{role:{key:role,isActive:true}}},...(role==='driver'?{driver:{accountStatus:'Active'}}:{customer:{accountStatus:'Active'}})},select:{id:true},take:2});
   if(users.length<2)gaps.push(`${role}: two linked active accounts unavailable`);
   for(const user of users){const token=signAccessToken({sub:user.id,roles:[role],app:'mera-driver',portalContext:role});const response=await request(app).get(`/workflow/${role}/dashboard?userId=other`).set('Authorization','Bearer '+token);assert.equal(response.status,200,JSON.stringify(response.body.error));results.push({role,ownDashboard:true});}
  }
  assert.equal(providerCalls,0);fs.writeFileSync(path.join(__dirname,'artifacts','dashboard-live-readonly-results.json'),JSON.stringify({readOnly:true,providerCalls,results,gaps},null,2));console.log(JSON.stringify({passed:results.length,readOnly:true,providerCalls,gaps}));
 }finally{await prisma.$disconnect();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
