// Read-only verification of existing finance links and all new Accounts routes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const jwt=require('jsonwebtoken'),{chromium}=require('playwright');
require('dotenv').config({path:'apps/mera-driver-api/.env.local',quiet:true});
const {PrismaClient}=require('../src/generated/prisma-client');const p=new PrismaClient();
const out=path.resolve('apps/mera-driver-api/verification/artifacts');let browser;
async function run(){const admin=await p.user.findFirst({where:{deletedAt:null,roles:{some:{role:{isSuperAdmin:true}}}},include:{roles:{include:{role:true}}}});assert.ok(admin);const token=jwt.sign({sub:admin.id,roles:admin.roles.map(r=>r.role.key),app:'mera-driver'},process.env.JWT_SECRET,{expiresIn:'10m'});
 browser=await chromium.launch({headless:true,channel:'chromium'});const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addInitScript(t=>localStorage.setItem('mera_driver_auth_token',t),token);const page=await context.newPage();const results=[];
 for(const[route,heading]of[['payments/payments','Booking Payments'],['payments/driver-payouts','Driver Payouts'],...['overview','booking-payments','commissions','driver-payouts','registration-fees','refunds-adjustments','reports'].map((path,i)=>['accounts/'+path,['Overview','Booking Payments','Commissions','Driver Payouts','Registration Fees','Refunds & Adjustments','Reports'][i]])]){
  const response=page.waitForResponse(r=>r.url().includes('/workflow/accounts')&&!r.url().includes('/pricing'));
  await page.goto('http://localhost:4400/account/'+route);assert.equal((await response).status(),200);await page.getByRole('heading',{name:'Accounts '+String.fromCharCode(183)+' '+heading,exact:true}).first().waitFor();assert.ok(!(await page.innerText('body')).includes('Unable to load data'));results.push(route+' uses real Accounts data');
 }
 await page.setViewportSize({width:390,height:844});await page.goto('http://localhost:4400/account/accounts/overview');await page.getByRole('heading',{name:/Accounts.*Overview/}).waitFor();await page.getByRole('button',{name:'Hide sidebar',exact:true}).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));results.push('Accounts overview mobile has no page overflow');
 fs.writeFileSync(path.join(out,'finance-pages-results.json'),JSON.stringify({results,limitations:['Read-only local admin signed token; no money transferred']},null,2));console.log(JSON.stringify({passed:results}));
}
run().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await p.$disconnect();});
