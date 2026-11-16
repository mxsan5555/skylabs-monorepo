import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { provideSharedAuth } from '@skylabs-monorepo/shared-auth/angular';
import { Drivers } from './drivers';

describe('Drivers server-backed registry', () => {
  let component: Drivers;
  let http: HttpTestingController;
  const summary = { totalDrivers: 5000, driverUsers: 2000, noLogin: 3000, kycPending: 1000 };
  const row = { id: 'driver-1', firstName: 'Ravi', phone: '9876543210', documents: [], completedSubSteps: [10], currentStep: 1, currentSubStep: 1, completionPercentage: 9, onboardingStatus: 'in_progress' };
  beforeEach(async () => {
    sessionStorage.clear();
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [Drivers], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), provideSharedAuth({ appPrefix: 'test_md', apiBaseUrl: 'http://localhost/api' })] }).compileComponents();
    const fixture = TestBed.createComponent(Drivers); component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController); fixture.detectChanges();
    http.expectOne(r=>r.url.endsWith('/masters/onboarding-options')).flush({data:{'job-types':[{id:'full-time',name:'Full Time',status:'Active'},{id:'part-time',name:'Part Time',status:'Active'}]}});
    http.expectOne('data/drivers-registry.json').flush({});
    http.expectOne(r => r.url.endsWith('/drivers/search')).flush({ data: [row], meta: { total: 5000, summary } });
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });
  it('reserves unsaved types and prevents repeated empty rows',()=>{component.addEducationDoc();expect(component.educationDocs()).toHaveLength(1);component.onDocChange('education',0,'type',{target:{value:'education:10th'}} as unknown as Event);component.addEducationDoc();expect(component.educationDocs()).toHaveLength(2);expect(component.educationDocs()[1].type).toBe('');expect(component.documentOptions('education',1).map(c=>c.id)).not.toContain('education:10th');expect(component.documentOptions('education',0).map(c=>c.id)).toContain('education:10th');component.clearDocFile('education',0);expect(component.documentOptions('education',1).map(c=>c.id)).not.toContain('education:10th');});
  it('releases an unsaved type and reindexes pending files when a preceding row is deleted',async()=>{component.educationDocs.set([{type:'10th Certificate / Marksheet',file:'first.pdf',regNo:''},{type:'12th Certificate / Marksheet',file:'second.pdf',regNo:''}]);const file=new File(['second'],'second.pdf');component.onDocFileChange('education',1,{target:{files:[file]}} as unknown as Event);await component.deleteEducationDoc(0);expect(component.documentOptions('education').map(c=>c.id)).toContain('education:10th');expect((component as any).pendingFiles.get('education-0')).toBe(file);expect((component as any).pendingFiles.has('education-1')).toBe(false);});
  it('keeps a saved row reserved on failed deletion and releases it only after success',async()=>{component.editingDriverId.set('driver-1');component.educationDocs.set([{id:'doc',type:'10th Certificate / Marksheet',file:'saved.pdf',regNo:''}]);vi.spyOn(window,'confirm').mockReturnValue(true);const failed=component.deleteEducationDoc(0);expect(component.educationDocs()).toHaveLength(1);http.expectOne(r=>r.method==='DELETE').flush({error:{message:'Deletion denied'}},{status:403,statusText:'Forbidden'});await failed;expect(component.educationDocs()[0].file).toBe('saved.pdf');expect(component.documentOptions('education').map(c=>c.id)).not.toContain('education:10th');const success=component.deleteEducationDoc(0);http.expectOne(r=>r.method==='DELETE').flush({data:{id:'doc'}});await success;expect(component.documentOptions('education').map(c=>c.id)).toContain('education:10th');vi.restoreAllMocks();});
  it('loads only active saved rows and ignores responses from a previous driver',()=>{component.editingDriverId.set('driver-1');(component as any).loadSavedDocuments('driver-1');const old=http.expectOne(r=>r.url.endsWith('/driver-1/documents'));expect(component.canAddDocument('education')).toBe(false);component.editingDriverId.set('driver-2');(component as any).loadSavedDocuments('driver-2');http.expectOne(r=>r.url.endsWith('/driver-2/documents')).flush({data:[{id:'current',category:'education',type:'12th Certificate / Marksheet',fileName:'current.pdf',archivedAt:null},{id:'history',category:'education',type:'12th Certificate / Marksheet',fileName:'history.pdf',archivedAt:'2026-01-01'}]});old.flush({data:[{id:'wrong',category:'education',type:'10th Certificate / Marksheet',fileName:'wrong.pdf'}]});expect(component.educationDocs()).toHaveLength(1);expect(component.educationDocs()[0].id).toBe('current');expect(component.documentOptions('education').map(c=>c.id)).not.toContain('education:12th');});
  it('restores the persisted filename when a replacement file is cleared',()=>{component.educationDocs.set([{id:'saved',type:'10th Certificate / Marksheet',file:'original.pdf',regNo:''}]);component.onDocFileChange('education',0,{target:{files:[new File(['replacement'],'new.pdf')]}} as unknown as Event);expect(component.educationDocs()[0].file).toBe('new.pdf');component.clearDocFile('education',0);expect(component.educationDocs()[0].file).toBe('original.pdf');expect(component.documentOptions('education').map(c=>c.id)).not.toContain('education:10th');expect((component as any).pendingFiles.size).toBe(0);});
  it('cannot close and reset a form while a save or saved deletion is pending',()=>{component.showAddForm.set(true);component.editingDriverId.set('driver-1');component.savingStep.set(true);component.closeAddDriverForm();expect(component.showAddForm()).toBe(true);expect(component.editingDriverId()).toBe('driver-1');component.savingStep.set(false);component.deletingDocument.set('saved');component.closeAddDriverForm();expect(component.showAddForm()).toBe(true);expect(http.match(r=>r.url.endsWith('/drivers/search'))).toHaveLength(0);});
  it('ignores obsolete Availability filters and never sends them',()=>{component.setListFilter('availability','online');const req=http.expectOne(r=>r.url.endsWith('/drivers/search'));expect(req.request.params.has('availability')).toBe(false);req.flush({data:[],meta:{total:0,summary}});expect(JSON.parse(sessionStorage.getItem('mera-driver-list-state:anonymous')!).availability).toBeUndefined();});
  it('keeps a document pill incomplete and retains the file draft when upload fails',async()=>{component.editingDriverId.set('driver-1');component.activeFormTab.set(1);component.activeSubSection.set(0);component.inputEducation.set('10th');component.educationDocs.set([{type:'10th Certificate / Marksheet',regNo:'',file:''}]);const file=new File(['file'],'certificate.pdf');component.onDocFileChange('education',0,{target:{files:[file]}} as unknown as Event);const pending=component.onSaveAndNext();const fields=http.expectOne(r=>r.method==='PATCH');expect(fields.request.body.completeStep).toBe(false);fields.flush({data:{...row,completedSubSteps:[]}});let upload:any;await vi.waitFor(()=>{upload??=http.match(r=>r.method==='POST'&&r.url.endsWith('/documents'))[0];expect(upload).toBeDefined();});upload.flush({error:{message:'Upload rejected'}},{status:422,statusText:'Unprocessable Entity'});await pending;expect(component.activeFormTab()).toBe(1);expect(component.activeSubSection()).toBe(0);expect(component.formCompletedSubSteps()).not.toContain(20);expect((component as any).pendingFiles.get('education-0')).toBe(file);expect(http.match(r=>r.method==='PATCH')).toHaveLength(0);});
  it('saves all master selections in the existing account pill and resumes them',async()=>{
    component.editingDriverId.set('driver-1');component.activeFormTab.set(0);component.activeSubSection.set(3);component.inputDriverTypes.set(['Car Driver']);component.inputAvatar.set('saved.png');component.toggleChoice('jobType','Full Time',true);component.toggleChoice('jobType','Part Time',true);component.toggleChoice('jobChoices','Office Work',true);component.inputWorkLocation.set('Other States');component.inputWorkStates.set(['Maharashtra','Delhi']);
    const save=component.saveDraft();const req=http.expectOne(r=>r.method==='PATCH');expect(req.request.body).toMatchObject({jobType:'Full Time, Part Time',jobChoices:['Office Work'],workLocation:'Other States',workStates:['Maharashtra','Delhi'],completeStep:false,stepCompleted:1,subStepCompleted:3});expect(req.request.body.status).toBeUndefined();req.flush({data:{...row,...req.request.body}});await save;expect(component.inputJobType()).toBe('Full Time, Part Time');expect(component.inputWorkStates()).toEqual(['Maharashtra','Delhi']);http.expectOne(r=>r.url.endsWith('/drivers/search')).flush({data:[],meta:{total:0,summary}});
  });
  it('includes inactive saved values but excludes inactive new choices',()=>{component.formMasters.set({'job-types':[{id:'active',name:'Full Time',status:'Active'},{id:'old',name:'Retired',status:'Inactive'}]});expect(component.masterNames('job-types')).toEqual(['Full Time']);expect(component.masterNames('job-types',['Retired','Legacy'])).toEqual(['Full Time','Retired','Legacy']);});
  it('shows backend total and summary rather than counting one page', () => {
    expect(component.totalDrivers()).toBe(5000); expect(component.allDrivers()).toHaveLength(1);
    expect(component.summary().noLogin).toBe(3000);
  });
  it('View navigates to the dedicated details route without opening a modal',()=>{
    const navigate=vi.spyOn(TestBed.inject(Router),'navigate').mockResolvedValue(true);
    component.openPreview(component.allDrivers()[0]);expect(navigate).toHaveBeenCalledWith(['/account/drivers','driver-1','details']);
  });
  it('combines login and city filters and resets the page', () => {
    component.page.set(4); component.setListFilter('login', 'linked');
    const first = http.expectOne(r => r.url.endsWith('/drivers/search'));
    expect(first.request.params.get('login')).toBe('linked'); expect(first.request.params.get('page')).toBe('1');
    first.flush({ data: [row], meta: { total: 2000, summary } });
    component.setListFilter('city', 'Lucknow');
    const second = http.expectOne(r => r.url.endsWith('/drivers/search'));
    expect(second.request.params.get('login')).toBe('linked'); expect(second.request.params.get('city')).toBe('Lucknow');
    second.flush({ data: [], meta: { total: 0, summary } }); expect(component.totalDrivers()).toBe(0);
  });
  it('does not slice a server page a second time', () => {
    component.searchQuery.set('DL12345');
    component.onParamsChange(new CustomEvent('params', { detail: { page: 3, pageSize: 10, search: 'DL12345', sortKey: 'firstName', sortDir: 'asc', filter: 'Verified' } }));
    const request = http.expectOne(r => r.url.endsWith('/drivers/search'));
    expect(request.request.params.get('page')).toBe('3'); expect(request.request.params.get('search')).toBe('DL12345');
    request.flush({ data: [row], meta: { total: 21, summary } });
    expect(JSON.parse(component.tableRowsString())).toHaveLength(1);
  });
  it('ignores a stale filter response', () => {
    component.setListFilter('city', 'Old'); const old = http.expectOne(r => r.url.endsWith('/drivers/search'));
    component.setListFilter('city', 'New'); const current = http.expectOne(r => r.url.endsWith('/drivers/search'));
    current.flush({ data: [row], meta: { total: 1, summary } }); old.flush({ data: [], meta: { total: 0, summary } });
    expect(component.totalDrivers()).toBe(1); expect(component.allDrivers()).toHaveLength(1);
  });
  it('final registration Save does not replay final KYC or administrative status',async()=>{
    component.editingDriverId.set('driver-1');component.activeFormTab.set(3);component.activeSubSection.set(1);component.inputStatus.set('Verified');component.inputDriverStatusMasterId.set('unrelated');component.inputRegistrationFeeStatus.set('Unpaid');
    const save=component.addDriver();const req=http.expectOne(r=>r.method==='PATCH');expect(req.request.body).toEqual({registrationFeeEntryChoice:'Unpaid',stepCompleted:4,subStepCompleted:1});req.flush({data:{...row,status:'Verified',completedSubSteps:[41]}});await save;http.expectNone(r=>r.url.includes('dl-verification'));http.expectOne(r=>r.url.endsWith('/drivers/search')).flush({data:[],meta:{total:0,summary}});
  });
  it('new Add draft preserves pending KYC and does not mark a pill complete',async()=>{
    component.inputFirstName.set('New');component.inputStatus.set('Verified');const save=component.saveDraft();const req=http.expectOne(r=>r.url.endsWith('/drivers')&&r.method==='POST');expect(req.request.body.status).toBeUndefined();expect(req.request.body.experience).toBeUndefined();expect(req.request.body.dlNo).toBeUndefined();expect(req.request.body.trainingStatus).toBeUndefined();expect(req.request.body.completeStep).toBe(false);expect(req.request.body.stepCompleted).toBe(1);req.flush({data:{...row,status:'Non-Verified',completedSubSteps:[],onboardingStatus:'in_progress'}});await save;expect(component.formCompletedSubSteps()).toEqual([]);http.expectOne(r=>r.url.endsWith('/drivers/search')).flush({data:[],meta:{total:0,summary}});
  });
  it('saves Registration on a partial record without demanding unrelated contact/photo fields',async()=>{
    component.editingDriverId.set('driver-1');component.activeFormTab.set(3);component.activeSubSection.set(1);component.inputAmount.set('150');const save=component.addDriver();const req=http.expectOne(r=>r.method==='PATCH'&&r.url.endsWith('/drivers/driver-1'));expect(req.request.body.amount).toBeUndefined();expect(req.request.body.registrationFeeEntryChoice).toBe('Unpaid');expect(req.request.body.firstName).toBeUndefined();req.flush({data:{...row,status:'Non-Verified',completedSubSteps:[10,41],onboardingStatus:'in_progress'}});await save;http.expectOne(r=>r.url.endsWith('/drivers/search')).flush({data:[],meta:{total:0,summary}});
  });
  it('Unpaid excludes stale mode, amount, date and selected receipt from final save',async()=>{
    component.editingDriverId.set('driver-1');component.activeFormTab.set(3);component.activeSubSection.set(1);component.inputAmount.set('500');component.inputPaymentReceiptDate.set('2026-01-01');component.onRegistrationReceiptFileChange({target:{files:[new File(['receipt'],'receipt.pdf',{type:'application/pdf'})]}} as unknown as Event);component.selectRegistrationFee('Unpaid');const save=component.addDriver();const req=http.expectOne(r=>r.method==='PATCH');expect(req.request.body).toEqual({registrationFeeEntryChoice:'Unpaid',stepCompleted:4,subStepCompleted:1});req.flush({data:row});await save;http.expectNone(r=>r.url.endsWith('/documents'));http.expectNone(r=>r.url.endsWith('/movements'));http.expectOne(r=>r.url.endsWith('/drivers/search')).flush({data:[],meta:{total:0,summary}});
  });
  it('Paid validates its visible details, while Unpaid requires none',async()=>{
    component.editingDriverId.set('driver-1');component.activeFormTab.set(3);component.activeSubSection.set(1);component.selectRegistrationFee('Paid');await component.addDriver();expect(component.stepError()).toContain('positive payment amount');http.expectNone(r=>r.method==='PATCH');component.expectedRegistrationFeePaise.set(1250);component.inputAmount.set('12.50');component.inputPaymentReceiptDate.set('2026-02-30');await component.addDriver();expect(component.stepError()).toContain('valid receipt date');
  });
  it('blocks a verified Paid to Unpaid change without deleting or reversing anything',()=>{component.actualFeeStatus.set('Paid');component.inputRegistrationFeeStatus.set('Paid');component.selectRegistrationFee('Unpaid');expect(component.inputRegistrationFeeStatus()).toBe('Paid');expect(component.stepError()).toContain('refund/correction');http.expectNone(r=>r.method==='POST');});
  it('uses active Driver Status Master IDs and retains the saved inactive option',()=>{component.formMasters.set({statuses:[{id:'active',name:'Available',status:'Active'},{id:'old',name:'Former status',status:'Inactive'},{id:'other-old',name:'Other former',status:'Inactive'}]});component.originalDriverStatusMasterId.set('old');expect(component.driverStatusOptions().map(o=>o.id)).toEqual(['active','old']);});
  it('does not submit unchanged business status or call account login status on payment save',async()=>{component.editingDriverId.set('driver-1');component.activeFormTab.set(3);component.activeSubSection.set(1);component.inputDriverStatusMasterId.set('old');component.originalDriverStatusMasterId.set('old');const save=component.saveDraft();const req=http.expectOne(r=>r.method==='PATCH');expect(req.request.body.driverStatusMasterId).toBeUndefined();expect(req.request.body.accountStatus).toBeUndefined();expect(req.request.body.status).toBeUndefined();req.flush({data:row});await save;http.expectNone(r=>r.url.endsWith('/status'));http.expectOne(r=>r.url.endsWith('/drivers/search')).flush({data:[],meta:{total:0,summary}});});
  it('cannot record payment without Accounts authority',async()=>{component.activeFormTab.set(3);component.activeSubSection.set(1);component.editingDriverId.set('driver-1');component.selectRegistrationFee('Paid');component.expectedRegistrationFeePaise.set(2500);component.inputAmount.set('25');component.inputPaymentReceiptDate.set('2026-10-03');await component.addDriver();expect(component.stepError()).toContain('Accounts permission');http.expectNone(r=>r.method==='PATCH'||r.url.endsWith('/movements'));});
  it('allows an unchanged trusted paid legacy record to save without fabricating missing receipt details',async()=>{
    component.onRowAction(new CustomEvent('action',{detail:{action:'edit_driver',row:{...row,feeStatus:'Paid',preferredPaymentMode:'Bank Account',amount:'',paymentReceiptDate:''}}}));http.expectOne(r=>r.url.endsWith('/driver-1/documents')).flush({data:[]});component.activeFormTab.set(3);component.activeSubSection.set(1);const save=component.addDriver();const req=http.expectOne(r=>r.method==='PATCH');expect(req.request.body.registrationFeeEntryChoice).toBeUndefined();expect(req.request.body.status).toBeUndefined();req.flush({data:row});await save;http.expectNone(r=>r.url.endsWith('/movements'));http.expectOne(r=>r.url.endsWith('/drivers/search')).flush({data:[],meta:{total:0,summary}});
  });
  it('uploads the selected avatar through the protected, versioned document flow before saving its actual reference',async()=>{
    component.editingDriverId.set('driver-1');component.activeFormTab.set(0);component.activeSubSection.set(3);component.inputDriverTypes.set(['Car Driver']);const file=new File(['image fixture'],'photo.png',{type:'image/png'});component.onAvatarFileChange({target:{files:[file]}} as unknown as Event);const save=component.onSaveAndNext();const upload=http.expectOne(r=>r.method==='POST'&&r.url.endsWith('/drivers/driver-1/documents'));expect(upload.request.body.get('type')).toBe('Profile Photo');expect(upload.request.body.get('file')).toBe(file);upload.flush({data:{id:'photo',type:'Profile Photo',fileName:'photo.png',filePath:'drivers/driver-1/photo.png'}});let patch:ReturnType<typeof http.expectOne>|undefined;await vi.waitFor(()=>{patch??=http.match(r=>r.method==='PATCH')[0];expect(patch).toBeDefined();});expect(patch!.request.body.avatar).toBe('drivers/driver-1/photo.png');patch!.flush({data:{...row,status:'Non-Verified',avatar:'drivers/driver-1/photo.png'}});await save;http.expectOne(r=>r.url.endsWith('/drivers/search')).flush({data:[],meta:{total:0,summary}});
  });
  it('loads the current verifier by stable ID without saving dropdown changes',()=>{
    component.openVerifierPanel(component.allDrivers()[0]);http.expectOne(r=>r.url.endsWith('/driver-1/assignment')).flush({data:{...row,assignedVerifierId:'raj',assignedVerifier:{id:'raj',name:'Raj'}}});http.expectOne(r=>r.url.endsWith('/eligible-verifiers')).flush({data:[{id:'raj',name:'Raj',email:'raj@example.invalid'},{id:'suman',name:'Suman'}]});
    expect(component.verifierDraft()).toBe('raj');component.onVerifierChange({target:{value:'suman'}} as unknown as Event);expect(component.verifierPanelDriver()?.assignedVerifier?.name).toBe('Raj');expect(http.match(r=>r.method==='PATCH')).toHaveLength(0);component.closeVerifierPanel();expect(component.verifierPanelDriver()).toBeNull();
  });
  it('keeps an unassigned review unselected and does not save unchanged assignments',()=>{
    component.openVerifierPanel(component.allDrivers()[0]);http.expectOne(r=>r.url.endsWith('/assignment')).flush({data:{...row,assignedVerifierId:null}});http.expectOne(r=>r.url.endsWith('/eligible-verifiers')).flush({data:[]});expect(component.verifierDraft()).toBe('');component.assignVerifier(null);expect(http.match(r=>r.method==='PATCH')).toHaveLength(0);
  });
  it('retains a failed assignment draft and the saved current verifier',()=>{
    component.openVerifierPanel(component.allDrivers()[0]);http.expectOne(r=>r.url.endsWith('/assignment')).flush({data:{...row,assignedVerifierId:'raj',assignedVerifier:{id:'raj',name:'Raj'}}});http.expectOne(r=>r.url.endsWith('/eligible-verifiers')).flush({data:[{id:'suman',name:'Suman'}]});component.verifierDraft.set('suman');vi.spyOn(window,'prompt').mockReturnValue('Assigned new reviewer');component.assignVerifier('suman');const request=http.expectOne(r=>r.url.endsWith('/assign-verifier'));request.flush({error:{message:'Review changed; reload'}},{status:409,statusText:'Conflict'});expect(component.verifierDraft()).toBe('suman');expect(component.verifierPanelDriver()?.assignedVerifier?.id).toBe('raj');expect(component.verifierSuccess()).toBe(false);vi.restoreAllMocks();
  });
  it('ignores a late assignment response for a different driver',()=>{
    const first=component.allDrivers()[0];component.openVerifierPanel(first);const firstLoad=http.expectOne(r=>r.url.endsWith('/driver-1/assignment'));const firstOptions=http.expectOne(r=>r.url.endsWith('/eligible-verifiers'));
    component.openVerifierPanel({...first,id:'driver-2'});http.expectOne(r=>r.url.endsWith('/driver-2/assignment')).flush({data:{...row,id:'driver-2',assignedVerifierId:'suman'}});http.expectOne(r=>r.url.endsWith('/eligible-verifiers')).flush({data:[]});firstLoad.flush({data:{...row,assignedVerifierId:'raj'}});firstOptions.flush({data:[]});expect(component.verifierPanelDriver()?.id).toBe('driver-2');expect(component.verifierDraft()).toBe('suman');
  });

  it('normalizes DL input and rejects extra/missing digits without truncation',()=>{
    for(const [value,error] of [['up-32 2021 0123456',false],['UP322021012345',true],['UP32202101234567',true],['UP32202101234A6',true]] as const){component.onInputChange('dlNo',{target:{value}} as unknown as Event);component.markTouched('dlNo');expect(!!component.dlNoError()).toBe(error);}
    expect(component.inputDlNo()).toBe('UP32202101234A6');http.expectNone(r=>r.url.includes('dl-verification'));
  });
  it('saves an optional empty licence draft without DL provider requests',async()=>{
    component.editingDriverId.set('driver-1');component.activeFormTab.set(2);component.activeSubSection.set(0);component.inputDlNo.set('');const save=component.saveDraft();const req=http.expectOne(r=>r.method==='PATCH');expect(req.request.body.dlNo).toBe('');req.flush({data:row});await save;http.expectNone(r=>r.url.includes('dl-verification'));http.expectOne(r=>r.url.endsWith('/drivers/search')).flush({data:[],meta:{total:0,summary}});
  });
  it('reuses the same Driver create idempotency key after an ambiguous network failure',async()=>{
    component.activeFormTab.set(0);component.activeSubSection.set(0);component.inputFirstName.set('Retry');component.inputGender.set('Female');
    const first=component.saveDraft();const initial=http.expectOne(r=>r.method==='POST'&&r.url.endsWith('/drivers'));const key=initial.request.headers.get('Idempotency-Key');expect(key).toMatch(/^[0-9a-f-]{36}$/i);initial.flush({error:{message:'Connection lost after save'}},{status:503,statusText:'Service Unavailable'});await first;
    const retry=component.saveDraft();const second=http.expectOne(r=>r.method==='POST'&&r.url.endsWith('/drivers'));expect(second.request.headers.get('Idempotency-Key')).toBe(key);second.flush({data:{...row,id:'saved-retry'}});await retry;expect(component.editingDriverId()).toBe('saved-retry');http.expectOne(r=>r.url.endsWith('/drivers/search')).flush({data:[],meta:{total:0,summary}});
  });
  it('uses one save to record an authorized offline fee and never repeats its movement',async()=>{
    vi.spyOn((component as any).auth,'can').mockReturnValue(true);component.editingDriverId.set('driver-1');component.activeFormTab.set(3);component.activeSubSection.set(1);component.expectedRegistrationFeePaise.set(50000);component.inputAmount.set('500');component.inputRegistrationFeeStatus.set('Paid');component.cashConfirmed.set(true);component.collectionReason.set('Offline receipt confirmed');component.inputPaymentReceiptDate.set('2026-10-03');
    const save=(component as any).persistStep(3,1,false,true);const req=http.expectOne(r=>r.method==='PATCH');expect(req.request.body.status).toBeUndefined();expect(req.request.body.registrationFeeEntryChoice).toBeUndefined();req.flush({data:{...row,registrationFeePaise:50000}});
    let balance:any;await vi.waitFor(()=>{balance??=http.match(r=>r.url.endsWith('/accounts/drivers/driver-1/fee'))[0];expect(balance).toBeDefined();});balance.flush({data:{fee:'Unpaid',remainingPaise:50000}});
    let payment:any;await vi.waitFor(()=>{payment??=http.match(r=>r.url.endsWith('/movements'))[0];expect(payment).toBeDefined();});expect(payment.request.body).toMatchObject({driverId:'driver-1',kind:'registration_payment',amountPaise:50000,method:'cash',reason:'Offline receipt confirmed (receipt date 2026-10-03)',confirmed:true});payment.flush({data:{id:'payment'}});
    let state:any;await vi.waitFor(()=>{state??=http.match(r=>r.url.endsWith('/accounts/drivers/driver-1/fee'))[0];expect(state).toBeDefined();});state.flush({data:{fee:'Paid',remainingPaise:0}});await save;expect(component.actualFeeStatus()).toBe('Paid');http.expectOne(r=>r.url.endsWith('/drivers/search')).flush({data:[],meta:{total:0,summary}});
    const repeated=(component as any).persistStep(3,1,false,true);http.expectOne(r=>r.method==='PATCH').flush({data:{...row,registrationFeePaise:50000}});await repeated;http.expectNone(r=>r.url.endsWith('/movements')||r.url.includes('dl-verification'));http.expectOne(r=>r.url.endsWith('/drivers/search')).flush({data:[],meta:{total:0,summary}});vi.restoreAllMocks();
  });

});

describe('Driver list state and independent views',()=>{
  let component:Drivers;let http:HttpTestingController;
  beforeEach(async()=>{sessionStorage.clear();TestBed.resetTestingModule();await TestBed.configureTestingModule({imports:[Drivers],providers:[provideRouter([]),provideHttpClient(),provideHttpClientTesting(),provideSharedAuth({appPrefix:'test_md',apiBaseUrl:'http://localhost/api'})]}).compileComponents();component=TestBed.createComponent(Drivers).componentInstance;http=TestBed.inject(HttpTestingController);});
  afterEach(()=>{http.verify();sessionStorage.clear();});
  it('switches summary views without clearing selected filters and resets pagination',()=>{
    component.cityFilter.set('Pune');component.feeFilter.set('Unpaid');component.statusFilter.set('Non-Verified');component.page.set(3);component.quickView('users');
    const req=http.expectOne(r=>r.url.endsWith('/drivers/search'));expect(req.request.params.get('view')).toBe('users');expect(req.request.params.get('city')).toBe('Pune');expect(req.request.params.get('fee')).toBe('Unpaid');expect(req.request.params.get('status')).toBe('Non-Verified');expect(req.request.params.get('page')).toBe('1');req.flush({data:[],meta:{total:0,summary:{}}});
  });
  it('hides filters without losing values and clears them independently of view/search',()=>{
    component.selectedView.set('review');component.searchQuery.set('Ravi');component.cityFilter.set('Pune');component.toggleFilters();expect(component.filtersVisible()).toBe(false);expect(component.activeFilters()[0].label).toBe('City: Pune');expect(JSON.parse(sessionStorage.getItem('mera-driver-list-state:anonymous')!).visible).toBe(false);
    component.clearFilters();expect(component.activeFilters()).toEqual([]);expect(component.selectedView()).toBe('review');expect(component.searchQuery()).toBe('Ravi');http.expectOne(r=>r.url.endsWith('/drivers/search')).flush({data:[],meta:{total:0,summary:{}}});
  });
  it('shows simple Unpaid and name/phone identity, retaining eligibility reasons',()=>{
    component.allDrivers.set([{id:'one',name:'Ravi',phone:'123',feeStatus:'Unpaid',registrationFeeRequired:false,blockingReasons:['KYC not approved']} as any]);const row=JSON.parse(component.tableRowsString())[0];expect(row.feeLabel).toBe('Unpaid');expect(row.eligibilityLabel).toBe('KYC not approved');expect(row.name).not.toContain('one');expect(row.name).toContain('123');
  });


});
