// Local smoke verification only. Creates isolated fixtures and removes only those IDs.
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: 'apps/mera-driver-api/.env.local', quiet: true });
const { PrismaClient } = require('../src/generated/prisma-client');
const p = new PrismaClient();
const api = process.env.VERIFY_API ?? 'http://localhost:3335';
const ui = process.env.VERIFY_UI ?? 'http://localhost:4401';
const output = path.resolve('apps/mera-driver-api/verification/artifacts');
const ids = { driver: randomUUID(), customer: randomUUID(), reviewer: randomUUID(), driverUser: randomUUID(), customerUser: randomUUID(), booking: randomUUID() };
let browser;
const uploadPaths=[];
const results = [];
const sign = (id, roles) => jwt.sign({ sub: id, roles, app: 'mera-driver' }, process.env.JWT_SECRET, { expiresIn: '10m' });
async function request(token, endpoint, method = 'GET', body) {
  const r = await fetch(api + endpoint, { method, headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(r.status < 400, true, `${method} ${endpoint}: HTTP ${r.status}`);
  return r.json();
}
async function portal(token, route) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(({token,origin})=>{if(location.origin===origin){try{localStorage?.setItem('mera_driver_auth_token',token);}catch{/* Native PDF frames do not expose local storage. */}}},{token,origin:new URL(ui).origin});
  // Proxy to the updated real local backend, preserving the Angular API configuration.
  if(api!=='http://localhost:3334')await context.route('http://localhost:3334/**', async route => {
    const response = await route.fetch({ url: route.request().url().replace('http://localhost:3334', api) });
    await route.fulfill({ response });
  });
  const page = await context.newPage();
  await page.goto(ui + route);
  return { context, page };
}
async function run() {
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname), 'Smoke fixtures are restricted to local PostgreSQL');
  fs.mkdirSync(output, { recursive: true });
  const before = { drivers: await p.driver.count(), customers: await p.customer.count(), bookings: await p.booking.count() };
  const roles = await p.role.findMany({ where: { key: { in: ['driver', 'customer', 'kyc_verification'] } } });
  const admin = await p.user.findFirst({ where: { roles: { some: { role: { isSuperAdmin: true } } }, deletedAt: null }, include: { roles: { include: { role: true } } } });
  assert.ok(admin && roles.length === 3, 'Existing admin and portal roles must be seeded');
  await p.$transaction(async tx => {
    for (const [id, roleKey] of [[ids.driverUser, 'driver'], [ids.customerUser, 'customer'], [ids.reviewer, 'kyc_verification']]) {
      await tx.user.create({ data: { id, name: 'Local UI verification fixture', roles: { create: { roleId: roles.find(r => r.key === roleKey).id } } } });
    }
    await tx.driver.create({ data: { id: ids.driver, userId: ids.driverUser, assignedVerifierId: ids.reviewer, firstName: 'Verification Driver', gender: 'Male', dob: '1990-02-01', email: 'fixture@example.org', phone: '9876543210', city: 'Verification City', dlNo: 'DL1420110012345', dlExpiryDate: '2099-01-01', completedSubSteps: [10], completionPercentage: 9, currentSubStep: 1 } });
    await tx.customer.create({ data: { id: ids.customer, userId: ids.customerUser, firstName: 'Verification Customer', mobileNumber: 'verification-' + ids.customer } });
    await tx.booking.create({ data: { id: ids.booking, customerId: ids.customer, customerName: 'Verification Customer', bookingCode: 'VERIFY-' + ids.booking, pickupAddress: 'Verification pickup', dropAddress: 'Verification drop', estimatedFare: 1000 } });
  });
  const driverToken = sign(ids.driverUser, ['driver']);
  const reviewerToken = sign(ids.reviewer, ['kyc_verification']);
  const customerToken = sign(ids.customerUser, ['customer']);
  const adminToken = sign(admin.id, admin.roles.map(r => r.role.key));
  const form = new FormData();
  form.set('category', 'personal'); form.set('type', 'Driving License');
  form.set('file', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4V8AAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'fixture.png');
  const upload = await fetch(api + '/drivers/me/documents', { method: 'POST', headers: { Authorization: 'Bearer ' + driverToken }, body: form });
  assert.equal(upload.status, 201);
  const uploadedDocument=(await upload.json()).data;uploadPaths.push(uploadedDocument.filePath);
  browser = await chromium.launch({ headless: true, channel: 'chromium' });

  const d = await portal(driverToken, '/driver/profile');
  await d.page.getByRole('heading', { name: 'Contact & Address Info', exact: true }).waitFor();
  await d.page.screenshot({ path: path.join(output, 'driver-profile.png'), fullPage: true });
  await d.page.getByRole('button', { name: 'Open menu', exact: true }).click();
  assert.ok(await d.page.locator('nav[aria-label="Driver portal navigation"]').innerText().then(t => t.includes('Logout') && !t.includes('User Management')));
  await d.page.getByRole('button', { name: 'Close menu', exact: true }).click();
  await d.page.screenshot({ path: path.join(output, 'driver-profile.png'), fullPage: true });
  results.push('Driver own profile, existing sidebar and exact saved pill resume');

  const r = await portal(reviewerToken, '/account/kyc-assignments');
  await r.page.locator('sky-data-table').waitFor();
  await r.page.waitForFunction(id => document.querySelector('sky-data-table')?.rows?.includes(id), ids.driver);
  await r.page.locator('sky-data-table').evaluate((el, id) => el.dispatchEvent(new CustomEvent('sky-dt-row-action', { detail: { action: 'review_kyc', row: { id } }, bubbles: true })), ids.driver);
  await r.page.locator('md-pill-review').getByRole('heading', { name: 'Personal & Identity Details', exact: true }).waitFor();
  const first = r.page.locator('md-pill-review .py-3').first();
  await first.locator('md-outlined-text-field').evaluate(el => { el.value = 'Correct the name spelling'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  const checkResponse = r.page.waitForResponse(response => response.url().endsWith('/pill-review') && response.request().method() === 'PATCH');
  await first.locator('md-outlined-button').filter({ hasText: 'Issue' }).click();
  const savedCheck = await checkResponse;
  assert.equal(savedCheck.status(), 200, JSON.stringify(await savedCheck.json()));
  await r.page.getByText('Changes requested', { exact: false }).waitFor();
  await r.page.reload();
  const persisted = await request(reviewerToken, `/drivers/assigned-to-me/${ids.driver}/pill-review`);
  assert.equal(persisted.data.issues, 1);
  await d.page.goto(ui + '/driver/kyc');
  await d.page.getByText('Correction: Correct the name spelling').waitFor();
  await d.page.locator('a').filter({ hasText: 'Fix this pill' }).click();
  await d.page.getByRole('heading', { name: 'Personal & Identity Details', exact: true }).waitFor();
  await d.page.getByRole('textbox', { name: 'First name', exact: true }).fill('Corrected Driver');
  await d.page.locator('md-filled-button').filter({ hasText: 'Save changes' }).click();
  await d.page.getByText('Saved', { exact: true }).waitFor();
  const corrected = await request(reviewerToken, `/drivers/assigned-to-me/${ids.driver}/pill-review`);
  assert.equal(corrected.data.pills[0].items[0].status, 'Pending');
  assert.equal(corrected.data.pills[0].items[0].changedSinceReview, true);
  assert.equal(await p.driverKycDecision.count({ where: { driverId: ids.driver } }), 1);
  results.push('Real pill issue persisted across reload; driver correction resets affected check and preserves decision history');

  await d.page.goto(ui + '/driver/kyc');
  await d.page.locator('md-pill-review md-filter-chip').filter({ hasText: 'Documents Details' }).click();
  await d.page.locator('md-pill-review md-filter-chip').filter({ hasText: 'Personal & Category Docs' }).click();
  await d.page.locator('md-outlined-button').filter({ hasText: 'Preview document' }).click();
  await d.page.locator('img[alt="Uploaded document"]').waitFor();
  assert.equal(await d.page.locator('img[alt="Uploaded document"]').evaluate(img => img.complete && img.naturalWidth > 0), true);
  results.push('Authenticated uploaded image preview');
  await d.page.locator('md-pill-review md-filter-chip').filter({hasText:'Driving License Details'}).click();await d.page.getByRole('checkbox').check();await d.page.getByRole('button',{name:'Record verification consent',exact:true}).click();await d.page.getByText('Recorded for this saved licence and DOB',{exact:false}).waitFor();
  const preflight=await request(reviewerToken,`/drivers/${ids.driver}/dl-verification/preflight`,'POST',{retry:false});assert.equal(preflight.data.providerCalled,false);assert.ok(['Provider failed','Manual review required'].includes(preflight.data.status));
  await r.page.reload();await r.page.locator('sky-data-table').waitFor();await r.page.waitForFunction(id=>document.querySelector('sky-data-table')?.rows?.includes(id),ids.driver);await r.page.locator('sky-data-table').evaluate((el,id)=>el.dispatchEvent(new CustomEvent('sky-dt-row-action',{detail:{action:'review_kyc',row:{id}},bubbles:true})),ids.driver);await r.page.locator('md-pill-review md-filter-chip').filter({hasText:'Documents Details'}).click();await r.page.locator('md-pill-review md-filter-chip').filter({hasText:'Driving License Details'}).click();assert.equal(await r.page.getByRole('button',{name:'Verify DL · unavailable',exact:true}).isDisabled(),true);
  results.push('Driver-owned saved-DL consent persisted; assigned verifier blocked preflight audited with providerCalled=false; live Verify DL stays disabled');
  const documentReview=(await request(reviewerToken,`/drivers/assigned-to-me/${ids.driver}/pill-review`)).data;
  const documentCheck=documentReview.pills.flatMap(pill=>pill.items).find(item=>item.documentId===uploadedDocument.id||item.key.includes(uploadedDocument.id));
  assert.ok(documentCheck);
  await request(reviewerToken,`/drivers/${ids.driver}/pill-review`,'PATCH',{key:documentCheck.key,hash:documentCheck.hash,status:'Pass'});
  const replacement=new FormData();replacement.set('category','personal');replacement.set('type','Driving License');replacement.set('file',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4V8AAAAASUVORK5CYII=','base64')],{type:'image/png'}),'replacement.png');
  const replacementResponse=await fetch(api+'/drivers/me/documents',{method:'POST',headers:{Authorization:'Bearer '+driverToken},body:replacement});assert.equal(replacementResponse.status,201);const replaced=(await replacementResponse.json()).data;uploadPaths.push(replaced.filePath);
  const inventory=await p.driverDocument.findMany({where:{driverId:ids.driver},orderBy:{version:'asc'}});assert.equal(inventory.length,2);assert.equal(inventory[0].version,1);assert.ok(inventory[0].archivedAt);assert.equal(inventory[1].version,2);assert.equal(inventory[1].archivedAt,null);
  assert.ok(await p.driverKycDecision.count({where:{driverId:ids.driver,itemKey:documentCheck.key}}));
  for(const filePath of uploadPaths){const preview=await fetch(api+'/uploads/'+filePath,{headers:{Authorization:'Bearer '+reviewerToken}});assert.equal(preview.status,200);const privateResponse=await fetch(api+'/uploads/'+filePath,{headers:{Authorization:'Bearer '+customerToken}});assert.ok([403,404].includes(privateResponse.status));}
  await d.page.reload();await d.page.getByText('All documents & previous versions (2)',{exact:false}).waitFor();
  const pdfUpload=new FormData();pdfUpload.set('category','education');pdfUpload.set('type','Training certificate');pdfUpload.set('file',new Blob([fs.readFileSync(path.join(output,'booking-invoice.pdf'))],{type:'application/pdf'}),'certificate.pdf');
  const uploadedPdf=await fetch(api+'/drivers/me/documents',{method:'POST',headers:{Authorization:'Bearer '+driverToken},body:pdfUpload});assert.equal(uploadedPdf.status,201);uploadPaths.push((await uploadedPdf.json()).data.filePath);
  await d.page.reload();await d.page.getByText('All documents & previous versions (3)',{exact:false}).click();await d.page.getByRole('button',{name:'Preview certificate.pdf',exact:true}).click();await d.page.locator('iframe[title="Document preview"]').waitFor();assert.ok((await d.page.locator('iframe[title="Document preview"]').getAttribute('src')).startsWith('blob:'));await d.page.getByRole('button',{name:'Close preview',exact:true}).click();
  results.push('Document replacement archives version 1, preserves its Pass decision, creates current version 2 and permits authorized previews of both originals while denying customers; uploaded PDF opens in the page preview');

  const c = await portal(customerToken, '/customer/bookings');
  await c.page.getByRole('heading', { name: 'VERIFY-' + ids.booking }).waitFor();
  await c.page.screenshot({ path: path.join(output, 'customer-booking.png'), fullPage: true });
  results.push('Customer existing portal reads its own database fixture booking; website booking creation not verified');

  const missing=await p.driverDocument.create({data:{driverId:ids.driver,category:'health',type:'Missing-file fixture',fileName:'missing.png',filePath:`drivers/${ids.driver}/missing.png`,mimeType:'image/png'}});
  const damagedPath=`drivers/${ids.driver}/damaged.png`;fs.writeFileSync(path.resolve('apps/mera-driver-api/uploads',damagedPath),'broken image');uploadPaths.push(damagedPath);
  const damaged=await p.driverDocument.create({data:{driverId:ids.driver,category:'health',type:'Damaged-file fixture',fileName:'damaged.png',filePath:damagedPath,mimeType:'image/png'}});
  const a = await portal(adminToken, '/account/drivers');
  a.page.on('download',file=>console.log('Staff verification download:',file.suggestedFilename()));
  a.page.on('response',response=>{if(response.url().endsWith('/resume.pdf'))console.log('Resume HTTP status:',response.status());});
  const staffErrors=[];a.page.on('pageerror',error=>staffErrors.push(error.message));
  await a.page.getByText('Total Drivers', { exact: false }).first().waitFor();
  await a.page.getByRole('textbox', { name: 'City', exact: true }).fill('Verification City');
  await a.page.getByRole('textbox', { name: 'City', exact: true }).press('Tab');
  await a.page.waitForFunction(id => document.querySelector('sky-data-table')?.rows?.includes(id), ids.driver);
  await a.page.locator('md-filter-chip').filter({ hasText: 'Driver Users' }).click();
  await a.page.waitForFunction(() => document.querySelector('sky-data-table')?.total === 1);
  await a.page.screenshot({ path: path.join(output, 'driver-list.png'), fullPage: true });
  await a.page.getByRole('button', { name: /^More actions:/ }).click();
  await a.page.getByRole('button', { name: 'Manage Driver User', exact: true }).waitFor();
  const listDownload=a.page.waitForEvent('download');await a.page.getByRole('button',{name:'Download Full Driver Report',exact:true}).click();const downloaded=await listDownload;await downloaded.saveAs(path.join(output,'driver-list-download.pdf'));assert.equal(fs.readFileSync(path.join(output,'driver-list-download.pdf')).subarray(0,5).toString(),'%PDF-');
  await a.page.getByRole('button', { name: /^View:/ }).click();
  await a.page.waitForURL('**/account/drivers/'+ids.driver+'/details');
  await a.page.getByRole('heading',{name:'Personal & Identity Details',exact:true}).waitFor();
  await a.page.getByRole('heading',{name:'Account Details',exact:true}).waitFor();
  assert.equal(await a.page.locator('md-pill-review, md-tabs').count(),0);
  await a.page.locator('.document-image').first().waitFor();
  await a.page.locator('iframe[title$="PDF preview"]').waitFor();
  await a.page.getByRole('heading',{name:/Previous version history/}).waitFor();
  await a.page.getByText('File is damaged or its preview format is unsupported',{exact:true}).waitFor();
  await a.page.locator('.document').filter({hasText:'Missing-file fixture'}).getByText(/HTTP 404/).waitFor();
  results.push('Missing and damaged originals show isolated errors while every other field/document remains readable');
  const details=(await request(adminToken,`/drivers/${ids.driver}/details`)).data;
  assert.equal(await a.page.locator('.document').count(),details.sections.flatMap(s=>s.documents).length);
  assert.ok(await a.page.locator('.fields dt').count()>=details.sections.flatMap(s=>s.fields).length);
  await a.page.locator('.document').filter({hasText:'Training certificate'}).scrollIntoViewIfNeeded();
  await a.page.waitForTimeout(2000);
  await a.page.locator('.document').filter({hasText:'Training certificate'}).screenshot({path:path.join(output,'driver-details-inline-pdf.png')});
  for(const token of [driverToken,customerToken,reviewerToken]){const denied=await fetch(api+`/drivers/${ids.driver}/details`,{headers:{Authorization:'Bearer '+token}});assert.equal(denied.status,403);}
  const resumeDownload=a.page.waitForEvent('download',{predicate:download=>download.suggestedFilename().endsWith('_Driver_Resume.pdf')});await a.page.getByRole('button',{name:'Download Resume',exact:true}).focus();await a.page.getByRole('button',{name:'Download Resume',exact:true}).press('Enter');await (await resumeDownload).saveAs(path.join(output,'driver-resume-partial.pdf'));
  await a.page.setViewportSize({width:390,height:844});await a.page.getByRole('button',{name:'Hide sidebar',exact:true}).click();await a.page.screenshot({path:path.join(output,'driver-detail-mobile.png'),fullPage:true});assert.equal(await a.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await a.page.setViewportSize({width:1440,height:1000});await a.page.getByRole('button',{name:'Show sidebar',exact:true}).click();
  results.push('Dedicated continuous details page: partial saved fields, authenticated images/PDF, archived versions, mobile layout, protected staff route and shareable resume');
  await a.page.screenshot({ path: path.join(output, 'driver-detail.png'), fullPage: true });
  await a.page.getByRole('link',{name:/Back to Drivers/}).click();
  await p.driverDocument.deleteMany({where:{id:{in:[missing.id,damaged.id]},driverId:ids.driver}});
  results.push('Server-backed combined city/login list filters');
  for (const [name, full] of [['partial', false], ['complete', true]]) {
    if (full) await p.driver.update({ where: { id: ids.driver }, data: {
      onboardingStatus:'completed',completionPercentage:100,completedSubSteps:[10,11,12,13,20,21,30,31,32,40,41],completedSteps:[1,2,3,4],currentStep:4,currentSubStep:1,
      lastName:'Fixture',fatherName:'Fixture Father',motherName:'Fixture Mother',maritalStatus:'Single',language:'Hindi',languages:['Hindi','English'],
      emergencyNumber:'9876543211',pincode:'110001',state:'Delhi',address:'Local verification address',height:'170 cm',weight:'70 kg',religion:'Not specified',color:'Not specified',
      sourceType:'Website',jobType:'Full-time',experience:'5 years',driverType:'Car Driver, Ambulance Driver',avatar:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4V8AAAAASUVORK5CYII=',
      education:'Graduate',trainingStatus:'Completed',trainingCertificate:'certificate.pdf',eyeVision:'Normal',bloodGroup:'O+',healthInsurance:'Fixture policy',
      licenseDetails:'Fixture driving licence',vehicleType:'Car',dlIssueDate:'2011-01-01',policeVerifiedStatus:'Verified',policeVerifiedNo:'Fixture police reference',currentSalary:'30000',expectedSalary:'35000',
      accountPaymentMethod:'Bank transfer',bankName:'Verification Bank',bankAccountNo:'000000000001',ifscCode:'TEST0000001',branchName:'Verification Branch',upiIdOrChequeNo:'fixture@example',
      preferredPaymentMode:'Waiver',amount:'0',paymentReceiptDate:'2026-09-30'
    } });
    if (full) {
      const review = (await request(reviewerToken, `/drivers/assigned-to-me/${ids.driver}/pill-review`)).data;
      for (const item of review.pills.flatMap(pill => pill.items).filter(item => item.checkable)) {
        await request(reviewerToken, `/drivers/${ids.driver}/pill-review`, 'PATCH', { key: item.key, hash: item.hash, status: 'Pass' });
      }
      const denied = await fetch(api + `/drivers/${ids.driver}`, { method: 'PATCH', headers: { Authorization: 'Bearer ' + reviewerToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'Verified' }) });
      assert.equal(denied.status, 403);
      const approved = await request(adminToken, `/drivers/${ids.driver}`, 'PATCH', { status: 'Verified' });
      assert.equal(approved.data.status, 'Verified');
      await d.page.goto(ui + '/driver/kyc');
      await d.page.getByText("You're fully verified. No action needed.").waitFor();
      await d.page.screenshot({ path: path.join(output, 'manual-kyc-approved.png'), fullPage: true });
      results.push('Manual current-check final KYC approval: verifier denied approval, authorized admin approved, own portal showed Verified');
    }
    const response = await fetch(api + `/drivers/${ids.driver}/profile.pdf`, { headers: { Authorization: 'Bearer ' + adminToken } });
    assert.equal(response.status, 200);
    const pdf = Buffer.from(await response.arrayBuffer());
    assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
    fs.writeFileSync(path.join(output, `driver-${name}.pdf`),pdf);
    assert.ok(response.headers.get('content-type').includes('application/pdf'));
    assert.ok(response.headers.get('content-disposition').includes(`driver-${ids.driver}.pdf`));
    await a.page.goto(ui+`/account/drivers/${ids.driver}/details`);
    await a.page.getByRole('heading',{name:'Account Details',exact:true}).waitFor();
    const pageResume=a.page.waitForEvent('download',{predicate:download=>download.suggestedFilename().endsWith('_Driver_Resume.pdf')});await a.page.getByRole('button',{name:'Download Resume',exact:true}).focus();await a.page.getByRole('button',{name:'Download Resume',exact:true}).press('Enter');await (await pageResume).saveAs(path.join(output,`driver-resume-${name}.pdf`));
    if(full){
      await a.page.getByText('Verification Bank',{exact:true}).waitFor();
      await a.page.screenshot({path:path.join(output,'driver-detail-complete.png'),fullPage:true});
      await a.page.goto(ui+'/account/drivers');
      await a.page.getByRole('textbox',{name:'City',exact:true}).fill('Verification City');
      await a.page.getByRole('textbox',{name:'City',exact:true}).press('Tab');
      await a.page.waitForFunction(id=>document.querySelector('sky-data-table')?.rows?.includes(id),ids.driver);
      await a.page.getByRole('button',{name:/^More actions:/}).click();
      const completedDownload=a.page.waitForEvent('download');
      await a.page.getByRole('button',{name:'Download Full Driver Report',exact:true}).click();
      const completedFile=await completedDownload;
      await completedFile.saveAs(path.join(output,'driver-complete-browser.pdf'));
      assert.ok(completedFile.suggestedFilename().endsWith('.pdf'));
      assert.equal(fs.readFileSync(path.join(output,'driver-complete-browser.pdf')).subarray(0,5).toString(),'%PDF-');
    }
  }
  assert.deepEqual(staffErrors,[],'Staff details and native PDF preview must not cause page errors');
  results.push('Authorized backend-generated binary PDFs downloaded for partial and complete drivers');
  await browser.close(); browser = null;
  await cleanup();
  const after = { drivers: await p.driver.count(), customers: await p.customer.count(), bookings: await p.booking.count() };
  assert.deepEqual(after, before);
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ results, before, after, limitations: ['Local signed tokens used; login itself not exercised', 'No live IDSPay calls', 'Dispatch, payment and Accounts verified separately in connected-smoke.cjs'] }, null, 2));
  console.log(JSON.stringify({ passed: results, preservedCounts: after }));
}
async function cleanup() {
  await p.$transaction(async tx => {
    await tx.driverKycCheck.deleteMany({ where: { driverId: ids.driver } });
    await tx.driverKycDecision.deleteMany({ where: { driverId: ids.driver } });
    await tx.driverDocument.deleteMany({ where: { driverId: ids.driver } });
    await tx.portalMessage.deleteMany({ where: { userId: { in: [ids.driverUser, ids.customerUser, ids.reviewer] } } });
    await tx.auditLog.deleteMany({where:{targetType:'Driver',targetId:ids.driver}});
    await tx.driver.deleteMany({ where: { id: ids.driver, userId: ids.driverUser } });
    await tx.booking.deleteMany({ where: { id: ids.booking, customerId: ids.customer } });
    await tx.customer.deleteMany({ where: { id: ids.customer, userId: ids.customerUser } });
    await tx.user.deleteMany({ where: { id: { in: [ids.driverUser, ids.customerUser, ids.reviewer] }, name: 'Local UI verification fixture' } });
  });
  for (const uploadPath of uploadPaths) {
    const root = path.resolve('apps/mera-driver-api/uploads');
    const file = path.resolve(root, uploadPath);
    assert.ok(file.startsWith(root + path.sep));
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}
run().catch(async error => {
  console.error('Local smoke verification failed:', error.code ?? error.name, error.message);
  if (browser) for (const [index, context] of browser.contexts().entries()) for (const page of context.pages()) {
    await page.screenshot({ path: path.join(output, `failure-${index}.png`), fullPage: true });
    fs.writeFileSync(path.join(output, `failure-${index}.txt`), await page.innerText('body'));
  }
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); await cleanup(); await p.$disconnect(); });
