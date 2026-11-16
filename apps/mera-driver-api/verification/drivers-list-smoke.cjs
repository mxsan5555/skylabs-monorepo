// Real local database/API/browser verification; remove only this run's fixture IDs.
const {chromium}=require('playwright');
const {randomUUID}=require('node:crypto');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const jwt=require('jsonwebtoken');
require('dotenv').config({path:'apps/mera-driver-api/.env.local',quiet:true});
const {PrismaClient}=require('../src/generated/prisma-client');const p=new PrismaClient();
const api=process.env.VERIFY_API||'http://localhost:3334',ui=process.env.VERIFY_UI||'http://localhost:4400';
const output=path.resolve('apps/mera-driver-api/verification/artifacts');
const ids=Array.from({length:25},()=>randomUUID()),users=Array.from({length:4},()=>randomUUID());
const city='List verification '+randomUUID();let browser,page;
async function list(token,query){const r=await fetch(api+'/drivers/search?'+new URLSearchParams(query),{headers:{Authorization:'Bearer '+token}});assert.equal(r.status,200);return r.json();}
async function waitRows(total){await page.waitForFunction(total=>{const t=document.querySelector('sky-data-table');return t&&!t.loading&&t.total===total;},total);}
async function run(){
  assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname));fs.mkdirSync(output,{recursive:true});
  const baseline={drivers:await p.driver.count(),users:await p.user.count()};
  const admin=await p.user.findFirst({where:{roles:{some:{role:{isSuperAdmin:true}}}},include:{roles:{include:{role:true}}}});
  const token=jwt.sign({sub:admin.id,roles:admin.roles.map(r=>r.role.key),app:'mera-driver'},process.env.JWT_SECRET,{expiresIn:'20m'});
  await p.$transaction(async tx=>{
    for(let i=0;i<users.length;i++)await tx.user.create({data:{id:users[i],name:'List fixture user '+i}});
    for(let i=0;i<ids.length;i++)await tx.driver.create({data:{id:ids[i],firstName:'ListFixture'+String(i).padStart(2,'0'),lastName:'Driver',phone:'987654'+String(i).padStart(4,'0'),email:'list-fixture-'+i+'@example.org',city,userId:i<4?users[i]:null,status:i<4?'Verified':'Non-Verified',online:i<9,accountStatus:'Active',registrationFeeRequired:false,dlNo:'FIXTURE-DL-'+i,dlExpiryDate:'2099-01-01',completedSubSteps:i<4?[10,11,12,13,20,21,30,31,32,40,41]:[10],completionPercentage:i<4?100:9,onboardingStatus:i<4?'completed':'in_progress'}});
  });
  const expected={all:25,users:4,review:21,ready:4};
  for(const [view,count]of Object.entries(expected)){const result=await list(token,{city,view});assert.equal(result.meta.total,count);assert.deepEqual(Object.fromEntries(['totalDrivers','driverUsers','kycPending','readyForTrips'].map(k=>[k,result.meta.summary[k]])),{totalDrivers:25,driverUsers:4,kycPending:21,readyForTrips:4});}
  const combined=await list(token,{city,view:'users',search:'ListFixture00',fee:'Unpaid',availability:'online',status:'Verified'});assert.equal(combined.meta.total,1);assert.equal(combined.meta.summary.totalDrivers,1);
  browser=await chromium.launch({headless:true,channel:'chromium'});const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(({token,origin,city})=>{if(location.origin===origin){localStorage.setItem('mera_driver_auth_token',token);sessionStorage.setItem('mera-driver-list-state',JSON.stringify({city,view:'all',page:1,pageSize:10,sort:'firstName',direction:'asc',visible:true}));}window.print=()=>{};},{token,origin:new URL(ui).origin,city});
  page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(ui+'/account/drivers');await waitRows(25);
  assert.equal(await page.locator('sky-data-table md-outlined-text-field').count(),1);
  assert.ok((await page.locator('sky-data-table').evaluate(t=>JSON.parse(t.rows)[0].name)).includes(' ID '),'Wait for the current frontend build before running this harness');
  assert.equal(await page.getByText('No Login',{exact:true}).count(),0);
  assert.equal(await page.locator('sky-data-table md-outlined-select.filter-select').count(),0);
  const cards=page.locator('sky-card').filter({has:page.locator('strong.text-xl')});assert.equal(await cards.count(),4);
  for(const [index,count]of [25,4,21,4].entries())assert.equal((await cards.nth(index).locator('strong').innerText()).trim(),String(count));
  for(const [label,total]of [['Driver Users',4],['Need KYC Review',21],['Ready for Trips',4],['All Drivers',25]]){await page.getByRole('button',{name:label,exact:true}).first().click();await waitRows(total);}
  await page.getByRole('button',{name:'Filters \u00b7 Hide',exact:true}).click();assert.equal(await page.locator('md-outlined-text-field[label="City"]').count(),0);await page.getByRole('button',{name:'Filters \u00b7 Show',exact:true}).waitFor();
  const next=page.waitForResponse(r=>r.url().includes('/drivers/search?')&&new URL(r.url()).searchParams.get('page')==='2');await page.getByRole('button',{name:'Next page',exact:true}).click();await next;await page.waitForFunction(()=>document.querySelector('sky-data-table').page===2&&!document.querySelector('sky-data-table').loading);
  assert.equal(await page.locator('sky-data-table').evaluate(t=>JSON.parse(t.rows).length),10);
  const search=page.locator('sky-data-table').getByRole('searchbox');await search.fill('ListFixture00');await waitRows(1);assert.equal(await page.locator('sky-data-table').evaluate(t=>t.page),1);
  await page.locator('sky-data-table').getByRole('button',{name:/^View:/}).first().click();await page.waitForURL('**/details');await page.getByRole('link',{name:'Back to Drivers',exact:true}).click();await waitRows(1);assert.equal(await page.locator('sky-data-table').getByRole('searchbox').inputValue(),'ListFixture00');await page.getByRole('button',{name:'Filters \u00b7 Show',exact:true}).waitFor();
  await search.fill('');await waitRows(25);await page.locator('sky-data-table').getByRole('button',{name:'Select columns',exact:true}).click();await page.locator('sky-data-table label.col-option').filter({hasText:'Mobile'}).getByRole('checkbox').press('Space');await page.locator('sky-data-table').getByRole('button',{name:'Select columns',exact:true}).click();
  const sort=page.waitForResponse(r=>r.url().includes('/drivers/search?')&&new URL(r.url()).searchParams.get('sort')==='phone');await page.locator('sky-data-table th').filter({hasText:'Mobile'}).click();await sort;
  await page.locator('sky-data-table').getByRole('checkbox',{name:'Select row 1',exact:true}).click();assert.equal(await page.locator('sky-data-table tbody tr.row--selected').count(),1);
  await page.locator('sky-data-table').getByRole('button',{name:/^More actions:/}).first().click();await page.locator('md-dialog').filter({hasText:'More actions'}).getByRole('button',{name:'Download Driver Resume',exact:true}).waitFor();await page.locator('md-dialog').filter({hasText:'More actions'}).getByRole('button',{name:'Close',exact:true}).click();
  const popup=context.waitForEvent('page');await page.locator('sky-data-table').getByRole('button',{name:'Export as PDF',exact:true}).click();const exported=await popup;await exported.waitForLoadState();assert.equal(await exported.locator('tbody tr').count(),10);await exported.close();
  await page.screenshot({path:path.join(output,'drivers-list-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('.admin-sidebar')?.getBoundingClientRect().right<=1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(output,'drivers-list-mobile.png'),fullPage:true});
  await page.getByRole('button',{name:'Clear Filters',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('sky-data-table').loading);assert.equal(await page.locator('md-filter-chip').filter({hasText:'City: '+city}).count(),0);assert.deepEqual(errors,[]);
  await browser.close();browser=null;await cleanup();const after={drivers:await p.driver.count(),users:await p.user.count()};assert.deepEqual(after,baseline);
  fs.writeFileSync(path.join(output,'drivers-list-results.json'),JSON.stringify({views:expected,combinedFilters:true,oneSearch:true,hideRetainsValues:true,pagination:true,searchResetsPage:true,returnState:true,sorting:true,columnSelection:true,rowSelection:true,existingCurrentPageExport:true,moreActions:true,mobileNoOverflow:true,baseline,after,limitations:['Local signed admin token; password login not exercised','Shared DataTable has no public custom cell/action renderer']},null,2));console.log(JSON.stringify({driversList:'passed',views:expected,baseline,after}));
}
async function cleanup(){await p.driver.deleteMany({where:{id:{in:ids}}});await p.user.deleteMany({where:{id:{in:users},name:{startsWith:'List fixture user '}}});}
run().catch(async e=>{console.error(e.stack);process.exitCode=1;if(page)await page.screenshot({path:path.join(output,'drivers-list-failure.png'),fullPage:true});}).finally(async()=>{if(browser)await browser.close();await cleanup();await p.$disconnect();});
