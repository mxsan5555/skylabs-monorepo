// Local PostgreSQL + real API + real Angular UI. No payment-provider or IDSPay calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const {chromium} = require('playwright');
require('dotenv').config({path:'apps/mera-driver-api/.env.local',quiet:true});
const {PrismaClient} = require('../src/generated/prisma-client');
const p = new PrismaClient();
const api=process.env.VERIFY_API??'http://localhost:3335', ui=process.env.VERIFY_UI??'http://localhost:4401', marker='Connected verification '+randomUUID();
const out=path.resolve('apps/mera-driver-api/verification/artifacts');
const ids={d1:randomUUID(),d2:randomUUID(),u1:randomUUID(),u2:randomUUID(),c:randomUUID(),cu:randomUUID(),other:randomUUID(),ou:randomUUID(),verifier:randomUUID(),fare:randomUUID()};
const bookingIds=[], results=[];let browser;
const city='Connected-'+ids.c;
async function raw(token,url,method='GET',body){return fetch(api+url,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});}
async function call(token,url,method='GET',body){const r=await raw(token,url,method,body);const data=await r.json();assert.ok(r.ok,`${method} ${url} HTTP ${r.status}: ${data.error?.message}`);return data.data;}
async function portal(token,route){const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'});await context.addInitScript(t=>localStorage.setItem('mera_driver_auth_token',t),token);if(api!=='http://localhost:3334')await context.route('http://localhost:3334/**',async route=>{const response=await route.fetch({url:route.request().url().replace('http://localhost:3334',api)});await route.fulfill({response});});const page=await context.newPage();await page.goto(ui+route);return page;}
async function login(userId){const result=await call(null,'/auth/password/login','POST',{identifier:userId+'@example.invalid',password:'Local verification fixture only 2026'});return result.accessToken;}
async function run(){
 assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL).hostname));
 const before={drivers:await p.driver.count(),customers:await p.customer.count(),bookings:await p.booking.count()};fs.mkdirSync(out,{recursive:true});
 const roles=await p.role.findMany({where:{key:{in:['driver','customer','kyc_verification']}}});const admin=await p.user.findFirst({where:{deletedAt:null,roles:{some:{role:{isSuperAdmin:true}}}},include:{roles:{include:{role:true}}}});assert.ok(admin);
 const adminToken=jwt.sign({sub:admin.id,roles:admin.roles.map(r=>r.role.key),app:'mera-driver'},process.env.JWT_SECRET,{expiresIn:'20m'});
 const hash=await bcrypt.hash('Local verification fixture only 2026',10);
 await p.$transaction(async tx=>{
  for(const[id,key]of[[ids.u1,'driver'],[ids.u2,'driver'],[ids.cu,'customer'],[ids.ou,'customer'],[ids.verifier,'kyc_verification']])await tx.user.create({data:{id,email:id+'@example.invalid',name:marker,passwordHash:hash,roles:{create:{roleId:roles.find(r=>r.key===key).id}}}});
  for(const[id,userId,name]of[[ids.d1,ids.u1,'Connected Driver One'],[ids.d2,ids.u2,'Connected Driver Two']])await tx.driver.create({data:{id,userId,firstName:name,city,status:'Non-Verified',assignedVerifierId:ids.verifier,accountStatus:'Active',online:false,dlNo:'DL1420110012345',dob:'1990-01-01',address:'PRIVATE-HOME-'+id,dlExpiryDate:'2099-01-01',driverType:'Automatic',onboardingStatus:'completed',completionPercentage:100,completedSubSteps:[10,11,12,13,20,21,30,31,32,40,41]}});
  for(const[id,userId]of[[ids.c,ids.cu],[ids.other,ids.ou]])await tx.customer.create({data:{id,userId,firstName:'Connected Customer',mobileNumber:'fixture-'+id}});
  await tx.fareRule.create({data:{id:ids.fare,zoneName:city,tripTypeName:'Hourly',vehicleCategoryName:'Car',baseFare:1000,perKmRate:0,perMinRate:0,waitingChargePerMin:0,minFare:1000,driverAllowance:0,surgeMultiplier:1,effectiveFrom:'2020-01-01',commissionBps:1500}});
 });
 const driverToken=await login(ids.u1),secondToken=await login(ids.u2),customerToken=await login(ids.cu),otherToken=await login(ids.ou),verifierToken=await login(ids.verifier);
 results.push('Real password login with isolated customer, driver and verifier users');
 for(const driverId of [ids.d1,ids.d2]){
  const review=await call(verifierToken,`/drivers/assigned-to-me/${driverId}/pill-review`);
  for(const item of review.pills.flatMap(pill=>pill.items).filter(item=>item.checkable))await call(verifierToken,`/drivers/${driverId}/pill-review`,'PATCH',{key:item.key,hash:item.hash,status:'Pass'});
  const approved=await call(adminToken,`/drivers/${driverId}`,'PATCH',{status:'Verified'});assert.equal(approved.status,'Verified');
 }
 results.push('Both trip drivers passed current human KYC checks and received authorized backend final approval before matching');

 browser=await chromium.launch({headless:true});
 const customer=await portal(customerToken,'/ride/payment');const driver=await portal(driverToken,'/driver/availability');const accounts=await portal(adminToken,'/account/accounts/overview');
 await driver.getByRole('heading',{name:'Availability',exact:true}).waitFor();await driver.getByRole('button',{name:'Go online',exact:true}).click();await driver.getByText('Availability: Online',{exact:true}).waitFor();
 await call(secondToken,'/workflow/driver/availability','PATCH',{online:true});
 await call(adminToken,`/workflow/accounts/drivers/${ids.d1}/fee-policy`,'PATCH',{registrationFeeRequired:true,registrationFeePaise:20000,reason:'Isolated registration fee fixture'});
 const blocked=await call(driverToken,'/workflow/driver/overview');assert.ok(blocked.reasons.includes('Required registration fee is not settled'));
 const blockedList=await call(adminToken,'/drivers/search?city='+encodeURIComponent(city)+'&fee=Unpaid&availability=online&eligibility=blocked');assert.deepEqual(blockedList.map(d=>d.id),[ids.d1]);
 const pay={reference:marker+'-registration',driverId:ids.d1,kind:'registration_payment',amountPaise:20000,method:'cash',reason:'Isolated offline payment confirmation fixture'};
 await call(adminToken,'/workflow/accounts/movements','POST',pay);await call(adminToken,'/workflow/accounts/movements','POST',pay);
 assert.equal(await p.moneyMovement.count({where:{reference:pay.reference}}),1);
 assert.equal((await call(driverToken,'/workflow/driver/overview')).reasons.length,0);
 const readyList=await call(adminToken,'/drivers/search?city='+encodeURIComponent(city)+'&eligibility=ready&licence='+encodeURIComponent('Manual approved'));assert.equal(readyList.length,2);assert.ok(readyList.every(d=>d.readyForTrips&&d.blockingReasons.length===0));
 results.push('Independent compulsory fee, trusted staff confirmation, replay idempotency and online eligibility');
 await customer.getByRole('combobox',{name:'Available fare rule'}).selectOption(ids.fare);
 await customer.getByRole('textbox',{name:'Pickup',exact:true}).fill('Connected pickup');await customer.getByRole('textbox',{name:'Drop',exact:true}).fill('Connected drop');
 const starts=new Date(Date.now()+3600000).toISOString().slice(0,16);await customer.locator('input[name="startsAt"]').fill(starts);
 await customer.getByRole('button',{name:'Calculate price',exact:true}).click();await customer.getByText('Estimated booking amount:',{exact:false}).waitFor();
 const saved=customer.waitForResponse(r=>r.url().endsWith('/workflow/customer/bookings')&&r.request().method()==='POST');await customer.getByRole('button',{name:'Confirm booking',exact:true}).click();const response=await saved;assert.equal(response.status(),201);const booking=(await response.json()).data;bookingIds.push(booking.id);
 assert.equal(booking.customerId,ids.c);assert.equal(booking.driver,null);assert.equal(booking.farePaise,100000);assert.equal(booking.commissionPaise,15000);assert.equal(booking.paymentMode,'cash');assert.equal(booking.paymentStatus,'unpaid');const uncollected=await call(adminToken,'/workflow/accounts?city='+encodeURIComponent(city));assert.equal(uncollected.totals.collected,0);assert.equal(uncollected.totals.commission,0);assert.equal(uncollected.totals.driverPayable,0);
 await customer.goto(ui+'/customer/bookings');await customer.getByText(booking.bookingCode,{exact:true}).waitFor();await customer.getByText('Finding a driver',{exact:true}).first().waitFor();
 await customer.screenshot({path:path.join(out,'customer-finding-driver.png'),fullPage:true});
 assert.equal((await call(otherToken,'/workflow/customer/bookings')).length,0);
 assert.equal((await raw(otherToken,`/workflow/customer/bookings/${booking.id}/invoice.pdf`)).status,404);
 assert.equal((await raw(otherToken,`/workflow/customer/bookings/${booking.id}/status`,'POST',{status:'cancelled',reason:'Other customer attempt'})).status,404);
 results.push('Website creates a real owned, backend-priced booking; customer sees Finding a driver; cross-owner access denied');
 const dispatch=await portal(adminToken,'/account/dispatch');await dispatch.getByText(booking.bookingCode,{exact:true}).waitFor();await dispatch.screenshot({path:path.join(out,'admin-dispatch.png'),fullPage:true});
 await driver.goto(ui+'/driver/requests');await driver.getByText(booking.bookingCode,{exact:true}).waitFor();await driver.getByRole('button',{name:'Accept',exact:true}).click();await driver.getByText('No open trip requests.',{exact:true}).waitFor();
 await customer.reload();await customer.getByText('Driver: Connected Driver One',{exact:false}).waitFor();const owned=(await call(customerToken,'/workflow/customer/bookings')).find(b=>b.id===booking.id);
 assert.equal(owned.status,'confirmed');assert.equal(owned.driver.id,ids.d1);assert.ok(!JSON.stringify(owned.driver).includes('PRIVATE'));assert.ok(!('dob'in owned.driver));assert.ok(!('dlNo'in owned.driver));assert.ok(!('documents'in owned.driver));
 await customer.screenshot({path:path.join(out,'customer-assigned-driver.png'),fullPage:true});results.push('Admin Dispatch, real driver request accepted in UI, customer sees only approved public driver details');
 await driver.goto(ui+'/driver/trips');await driver.getByRole('button',{name:'View booking',exact:true}).click();await driver.getByRole('button',{name:'On the way',exact:true}).click();await driver.locator('.account-card__head').getByText('On the way',{exact:true}).waitFor();
 await driver.getByRole('button',{name:'View booking',exact:true}).click();await driver.getByRole('button',{name:'Arrived',exact:true}).click();await driver.locator('.account-card__head').getByText('Arrived',{exact:true}).waitFor();
 await driver.getByRole('button',{name:'View booking',exact:true}).click();await driver.getByRole('textbox',{name:'Customer start OTP',exact:true}).fill(owned.otp);await driver.getByRole('button',{name:'In progress',exact:true}).click();await driver.locator('.account-card__head').getByText('In progress',{exact:true}).waitFor();
 await driver.getByRole('button',{name:'View booking',exact:true}).click();await driver.locator('md-filled-button').getByRole('button',{name:'Completed',exact:true}).click();await driver.locator('.account-card__head').getByText('Completed',{exact:true}).waitFor();
 assert.equal((await call(customerToken,'/workflow/customer/bookings')).find(b=>b.id===booking.id).status,'completed');
 const payment={reference:marker+'-booking',bookingId:booking.id,kind:'booking_payment',amountPaise:100000,method:'cash',reason:'Isolated customer collection fixture'};
 await accounts.getByRole('textbox',{name:'Booking ID',exact:true}).fill(booking.id);await accounts.locator('input[name="amount"]').fill('100000');await accounts.getByRole('textbox',{name:'Unique transaction reference',exact:true}).fill(payment.reference);await accounts.getByRole('textbox',{name:'Audit reason',exact:true}).fill(payment.reason);
 const moneyResponse=accounts.waitForResponse(r=>r.url().endsWith('/accounts/movements')&&r.request().method()==='POST');await accounts.getByRole('button',{name:'Record confirmation',exact:true}).click();assert.equal((await moneyResponse).status(),200);
 const overview=await call(adminToken,'/workflow/accounts?city='+encodeURIComponent(city));assert.equal(overview.totals.collected,100000);assert.equal(overview.totals.commission,15000);assert.equal(overview.totals.platformIncome,35000);assert.equal(overview.totals.driverPayable,85000);assert.equal(overview.totals.registrationFees,20000);
 await accounts.getByRole('textbox',{name:'City',exact:true}).fill(city);await accounts.getByRole('button',{name:'Apply filters',exact:true}).click();await accounts.getByText('₹350.00',{exact:true}).waitFor();await accounts.screenshot({path:path.join(out,'accounts-verified-totals.png'),fullPage:true});
 await driver.goto(ui+'/driver/earnings');await driver.getByText('Settled earnings ₹850.00',{exact:true}).waitFor();results.push('Customer and driver share trip progression through OTP start and completion; offline collection yields ₹1000 collected, ₹150 commission, ₹850 payable, ₹350 platform income including ₹200 fee exactly once');
 const invoice=await raw(customerToken,`/workflow/customer/bookings/${booking.id}/invoice.pdf`);assert.equal(invoice.status,200);const invoicePdf=Buffer.from(await invoice.arrayBuffer());assert.equal(invoicePdf.subarray(0,5).toString(),'%PDF-');fs.writeFileSync(path.join(out,'booking-invoice.pdf'),invoicePdf);
 const nextInput={city,service:'Hourly',vehicleCategory:'Car',pickupAddress:'Concurrent pickup',dropAddress:'Concurrent drop',startsAt:new Date(Date.now()+86400000).toISOString(),durationMinutes:60,distanceKm:10};
 const next=await call(customerToken,'/workflow/customer/bookings','POST',nextInput);bookingIds.push(next.id);
 const firstOffer=(await call(driverToken,'/workflow/driver/overview')).offers.find(o=>o.bookingId===next.id);const secondOffer=(await call(secondToken,'/workflow/driver/overview')).offers.find(o=>o.bookingId===next.id);assert.ok(firstOffer&&secondOffer);
 const raced=await Promise.all([raw(driverToken,`/workflow/driver/offers/${firstOffer.id}`,'POST',{accept:true}),raw(secondToken,`/workflow/driver/offers/${secondOffer.id}`,'POST',{accept:true})]);assert.deepEqual(raced.map(r=>r.status).sort(),[200,409]);assert.equal((await p.tripOffer.findMany({where:{bookingId:next.id,status:'accepted'}})).length,1);
 const assigned=await p.booking.findUnique({where:{id:next.id}});const otherDriver=assigned.driverId===ids.d1?ids.d2:ids.d1;await call(adminToken,`/workflow/dispatch/${next.id}/assign`,'POST',{driverId:otherDriver,reason:'Isolated reassignment audit fixture'});assert.equal((await p.booking.findUnique({where:{id:next.id}})).driverId,otherDriver);
 results.push('Real PostgreSQL concurrent acceptance: exactly one winner and one 409; authorized reassignment records reason and history');
 const unauthorized=await raw(verifierToken,'/workflow/accounts/movements','POST',payment);assert.equal(unauthorized.status,403);assert.equal((await raw(verifierToken,'/workflow/accounts')).status,403);
 const verifier=await portal(verifierToken,'/account/kyc-assignments');await verifier.getByRole('heading',{name:'KYC Assignments',exact:true}).waitFor();assert.ok(!(await verifier.innerText('body')).includes('Record confirmation'));
 const payout=await call(adminToken,'/workflow/accounts/movements','POST',{reference:marker+'-payout',bookingId:booking.id,driverId:ids.d1,kind:'driver_payout',amountPaise:85000,method:'bank_transfer',reason:'Isolated completed payout fixture'});assert.ok(payout.id);
 const paid=await call(adminToken,'/workflow/accounts?city='+encodeURIComponent(city));assert.equal(paid.totals.driverPaid,85000);assert.equal(paid.totals.driverPayable,0);
 await call(adminToken,'/workflow/accounts/movements','POST',{reference:marker+'-fee-refund',driverId:ids.d1,kind:'registration_refund',amountPaise:20000,method:'bank_transfer',reason:'Isolated completed fee refund fixture'});
 const refunded=await call(adminToken,'/workflow/accounts?city='+encodeURIComponent(city));assert.equal(refunded.totals.platformIncome,15000);assert.equal((await call(driverToken,'/workflow/driver/overview')).fee,'Refunded');
 results.push('Invoice PDF, restricted verifier Accounts access, completed payout reducing payable, registration refund reversing platform fee income');
 const pdfResponse=await raw(adminToken,`/drivers/${ids.d1}/profile.pdf`);assert.equal(pdfResponse.status,200);fs.writeFileSync(path.join(out,'driver-complete-with-trips.pdf'),Buffer.from(await pdfResponse.arrayBuffer()));
 const htmlResponse=await raw(adminToken,`/drivers/${ids.d1}/profile-report`);const html=await htmlResponse.text();for(const text of [booking.bookingCode,'registration_refund','driver_payout','Trips &amp; earnings'])assert.ok(html.includes(text));
 const refund={reference:marker+'-booking-refund',bookingId:booking.id,kind:'booking_refund',amountPaise:100000,method:'bank_transfer',reason:'Isolated completed refund after recovery'};
 assert.equal((await raw(adminToken,'/workflow/accounts/movements','POST',refund)).status,422);
 await call(adminToken,'/workflow/accounts/movements','POST',{reference:marker+'-recovery',bookingId:booking.id,driverId:ids.d1,kind:'driver_recovery',amountPaise:85000,method:'bank_transfer',reason:'Isolated completed driver recovery'});
 await call(adminToken,'/workflow/accounts/movements','POST',refund);
 const reversed=await call(adminToken,'/workflow/accounts?city='+encodeURIComponent(city));assert.equal(reversed.totals.commission,0);assert.equal(reversed.totals.platformIncome,0);assert.equal(reversed.totals.driverPayable,0);assert.equal(reversed.bookings.find(b=>b.id===booking.id).paymentStatus,'refunded');
 results.push('Real derived fee/licence/readiness list filters; payout recovery required before customer refund; refund reverses earned commission and driver share');
 const declinedBooking=await call(customerToken,'/workflow/customer/bookings','POST',{...nextInput,startsAt:new Date(Date.now()+172800000).toISOString()});bookingIds.push(declinedBooking.id);
 const declineOffer=(await call(secondToken,'/workflow/driver/overview')).offers.find(o=>o.bookingId===declinedBooking.id);assert.ok(declineOffer);
 await call(secondToken,`/workflow/driver/offers/${declineOffer.id}`,'POST',{accept:false});assert.equal((await p.tripOffer.findUnique({where:{id:declineOffer.id}})).status,'declined');
 assert.equal((await raw(adminToken,`/workflow/dispatch/${declinedBooking.id}/assign`,'POST',{driverId:ids.d1,reason:'Ineligible driver must be rejected'})).status,422);
 await call(adminToken,'/workflow/accounts/movements','POST',{reference:marker+'-waiver',driverId:ids.d1,kind:'registration_waiver',amountPaise:0,method:'waiver',reason:'Isolated approved fee waiver'});
 await call(adminToken,'/workflow/accounts/movements','POST',{reference:marker+'-waiver',driverId:ids.d1,kind:'registration_waiver',amountPaise:0,method:'waiver',reason:'Isolated approved fee waiver'});
 const waiverRows=await p.moneyMovement.findMany({where:{reference:marker+'-waiver'}});assert.equal(waiverRows.length,1);assert.equal(waiverRows[0].amountPaise,20000);
 await call(adminToken,`/workflow/dispatch/${declinedBooking.id}/offers`,'POST',{});
 const expiring=(await call(driverToken,'/workflow/driver/overview')).offers.find(o=>o.bookingId===declinedBooking.id);assert.ok(expiring);
 await p.tripOffer.update({where:{id:expiring.id},data:{expiresAt:new Date(Date.now()-1000)}});
 assert.equal((await raw(driverToken,`/workflow/driver/offers/${expiring.id}`,'POST',{accept:true})).status,409);
 await call(adminToken,`/workflow/dispatch/${declinedBooking.id}/offers`,'POST',{});assert.equal((await p.tripOffer.findUnique({where:{id:expiring.id}})).status,'expired');assert.equal((await p.booking.findUnique({where:{id:declinedBooking.id}})).status,'requested');
 results.push('Decline and expiry return an unassigned booking to dispatch; late acceptance and ineligible manual assignment rejected; audited waiver settles the required fee independently');
 await customer.setViewportSize({width:390,height:844});await customer.goto(ui+'/customer/bookings');await customer.getByRole('heading',{name:'My Bookings',exact:true}).waitFor();await customer.getByText(declinedBooking.bookingCode,{exact:true}).waitFor();await customer.screenshot({path:path.join(out,'customer-mobile.png'),fullPage:true});
 const bodyWidth=await customer.evaluate(()=>document.documentElement.scrollWidth);assert.ok(bodyWidth<=410,`Mobile page overflows to ${bodyWidth}px`);
 const menu=await call(customerToken,'/rbac/bootstrap');assert.equal(menu.customer.id,ids.c);assert.ok(!JSON.stringify(menu.menu).includes('rbac.users'));
 await customer.getByRole('button',{name:'Open menu',exact:true}).click();const nav=await customer.locator('nav[aria-label="Customer portal navigation"]').innerText();for(const label of ['Dashboard','Book a Driver','My Bookings','Payments & Invoices','My Profile','Help & Support','Logout'])assert.ok(nav.includes(label));assert.ok(!nav.includes('User Management'));
 await customer.goto(ui+'/customer/payments');await customer.getByRole('heading',{name:'Payments & Invoices',exact:true}).waitFor();await customer.getByText(booking.bookingCode,{exact:false}).waitFor();assert.ok(await customer.getByRole('button',{name:'Download invoice',exact:true}).count());
 await customer.goto(ui+'/customer/support');await customer.getByRole('textbox',{name:'Subject',exact:true}).fill(marker);await customer.getByRole('textbox',{name:'Message',exact:true}).fill('Own booking support verification');await customer.getByRole('button',{name:'Send support request',exact:true}).click();await customer.getByRole('heading',{name:marker,exact:true}).waitFor();assert.ok(!(await call(otherToken,'/workflow/messages')).some(m=>m.subject===marker));
 await driver.goto(ui+'/driver/notifications');await driver.getByRole('heading',{name:'New trip request',exact:true}).first().waitFor();await driver.goto(ui+'/driver/fee');await driver.getByRole('heading',{name:'Waived',exact:true}).waitFor();
 results.push('Customer Payments & Invoices and support use owned records; driver notifications and registration fee show real saved workflow data; customer mobile sidebar verified');
 await call(adminToken,`/drivers/${ids.d1}/status`,'PATCH',{accountStatus:'Suspended',reason:'Isolated suspension verification'});assert.equal((await raw(driverToken,'/workflow/driver/overview')).status,403);assert.equal((await raw(null,'/auth/password/login','POST',{identifier:ids.u1+'@example.invalid',password:'Local verification fixture only 2026'})).status,403);const suspended=await call(adminToken,'/drivers/search?city='+encodeURIComponent(city)+'&accountStatus=Suspended');assert.deepEqual(suspended.map(d=>d.id),[ids.d1]);assert.ok(await p.driver.findUnique({where:{id:ids.d1}}));await call(adminToken,`/drivers/${ids.d1}/status`,'PATCH',{accountStatus:'Active'});
 await p.customer.update({where:{id:ids.c},data:{accountStatus:'Blocked'}});assert.equal((await raw(customerToken,'/workflow/customer/bookings')).status,403);await p.customer.update({where:{id:ids.c},data:{accountStatus:'Active'}});
 results.push('Suspended driver login and own-trip access revoked without deleting history; suspension filter works; blocked customer own access denied');
 await browser.close();browser=null;await cleanup();const after={drivers:await p.driver.count(),customers:await p.customer.count(),bookings:await p.booking.count()};assert.deepEqual(after,before);
 fs.writeFileSync(path.join(out,'connected-results.json'),JSON.stringify({results,before,after,limitations:['Admin browser uses a local signed token; fixture customer/driver/verifier password login exercised','No live payment-provider call; real offline confirmation fixtures and gateway unit tests','No production IDSPay call']},null,2));console.log(JSON.stringify({passed:results,preservedCounts:after}));
}
async function cleanup(){
 const userIds=[ids.u1,ids.u2,ids.cu,ids.ou,ids.verifier],driverIds=[ids.d1,ids.d2];
 await p.$transaction(async tx=>{
  const rows=await tx.booking.findMany({where:{customerId:{in:[ids.c,ids.other]}}});const ownedIds=rows.map(b=>b.id);
  await tx.paymentIntent.deleteMany({where:{userId:{in:userIds}}});await tx.moneyMovement.deleteMany({where:{OR:[{driverId:{in:driverIds}},{bookingId:{in:ownedIds}}]}});
  await tx.tripEvent.deleteMany({where:{bookingId:{in:ownedIds}}});await tx.tripOffer.deleteMany({where:{bookingId:{in:ownedIds}}});await tx.booking.deleteMany({where:{id:{in:ownedIds}}});
  await tx.portalMessage.deleteMany({where:{userId:{in:userIds}}});await tx.auditLog.deleteMany({where:{OR:[{targetId:{in:[...driverIds,...ownedIds,ids.fare]}},{actorUserId:{in:userIds}}]}});
  await tx.driverKycCheck.deleteMany({where:{driverId:{in:driverIds}}});await tx.driverKycDecision.deleteMany({where:{driverId:{in:driverIds}}});
  await tx.driver.deleteMany({where:{id:{in:driverIds}}});await tx.customer.deleteMany({where:{id:{in:[ids.c,ids.other]}}});await tx.user.deleteMany({where:{id:{in:userIds},name:marker}});await tx.fareRule.deleteMany({where:{id:ids.fare,zoneName:city}});
 });
}
run().catch(async e=>{console.error('Connected verification failed:',e.message);if(browser)for(const[index,context]of browser.contexts().entries())for(const page of context.pages()){await page.screenshot({path:path.join(out,`connected-failure-${index}.png`),fullPage:true});fs.writeFileSync(path.join(out,`connected-failure-${index}.txt`),await page.innerText('body'));}process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await cleanup();await p.$disconnect();});
