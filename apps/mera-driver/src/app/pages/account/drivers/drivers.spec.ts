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
    sessionStorage.removeItem('mera-driver-list-state');
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [Drivers], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), provideSharedAuth({ appPrefix: 'test_md', apiBaseUrl: 'http://localhost/api' })] }).compileComponents();
    const fixture = TestBed.createComponent(Drivers); component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController); fixture.detectChanges();
    http.expectOne(r=>r.url.endsWith('/masters/onboarding-options')).flush({data:{'job-types':[{id:'full-time',name:'Full Time',status:'Active'},{id:'part-time',name:'Part Time',status:'Active'}]}});
    http.expectOne('data/drivers-registry.json').flush({});
    http.expectOne(r => r.url.endsWith('/drivers/search')).flush({ data: [row], meta: { total: 5000, summary } });
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });
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
  it('final registration Save sends only its fields/progress, never KYC approval or fee Paid',async()=>{
    component.editingDriverId.set('driver-1');component.inputFirstName.set('Ravi');component.inputGender.set('Male');component.inputPhone.set('9876543210');component.inputEmail.set('ravi@example.org');component.inputDriverTypes.set(['Car Driver']);component.inputAvatar.set('saved.png');component.inputStatus.set('Verified');component.inputRegistrationFeeStatus.set('Paid');component.inputAmount.set('200');component.inputPaymentReceiptDate.set('2026-10-03');
    const save=component.addDriver();const req=http.expectOne(r=>r.url.endsWith('/drivers/driver-1')&&r.method==='PATCH');expect(req.request.body).toEqual({preferredPaymentMode:'Cash',amount:'200',paymentReceiptDate:'2026-10-03',registrationFeeEntryChoice:'Paid',stepCompleted:4,subStepCompleted:1});req.flush({data:{...row,amount:'200',status:'Non-Verified',completedSubSteps:[41]}});await save;http.expectOne(r=>r.url.endsWith('/drivers/search')).flush({data:[],meta:{total:0,summary}});
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
    component.editingDriverId.set('driver-1');component.activeFormTab.set(3);component.activeSubSection.set(1);component.selectRegistrationFee('Paid');await component.addDriver();expect(component.stepError()).toContain('positive payment amount');http.expectNone(r=>r.method==='PATCH');component.inputAmount.set('12.50');component.inputPaymentReceiptDate.set('2026-02-30');await component.addDriver();expect(component.stepError()).toContain('valid receipt date');
  });
  it('blocks a verified Paid to Unpaid change without deleting or reversing anything',()=>{component.actualFeeStatus.set('Paid');component.inputRegistrationFeeStatus.set('Paid');component.selectRegistrationFee('Unpaid');expect(component.inputRegistrationFeeStatus()).toBe('Paid');expect(component.stepError()).toContain('refund/correction');http.expectNone(r=>r.method==='POST');});
  it('uses active Driver Status Master IDs and retains the saved inactive option',()=>{component.formMasters.set({statuses:[{id:'active',name:'Available',status:'Active'},{id:'old',name:'Former status',status:'Inactive'},{id:'other-old',name:'Other former',status:'Inactive'}]});component.originalDriverStatusMasterId.set('old');expect(component.driverStatusOptions().map(o=>o.id)).toEqual(['active','old']);});
  it('does not submit unchanged business status or call account login status on payment save',async()=>{component.editingDriverId.set('driver-1');component.activeFormTab.set(3);component.activeSubSection.set(1);component.inputDriverStatusMasterId.set('old');component.originalDriverStatusMasterId.set('old');const save=component.saveDraft();const req=http.expectOne(r=>r.method==='PATCH');expect(req.request.body.driverStatusMasterId).toBeUndefined();expect(req.request.body.accountStatus).toBeUndefined();expect(req.request.body.status).toBeUndefined();req.flush({data:row});await save;http.expectNone(r=>r.url.endsWith('/status'));http.expectOne(r=>r.url.endsWith('/drivers/search')).flush({data:[],meta:{total:0,summary}});});
  it('radio selection alone cannot confirm a cash collection',async()=>{component.selectRegistrationFee('Paid');component.inputAmount.set('25');component.inputPaymentReceiptDate.set('2026-10-03');await component.confirmCashCollection();expect(component.stepError()).toContain('Confirm actual cash');http.expectNone(r=>r.url.endsWith('/movements'));});
  it('allows an unchanged trusted paid legacy record to save without fabricating missing receipt details',async()=>{
    component.onRowAction(new CustomEvent('action',{detail:{action:'edit_driver',row:{...row,feeStatus:'Paid',preferredPaymentMode:'Bank Account',amount:'',paymentReceiptDate:''}}}));component.activeFormTab.set(3);component.activeSubSection.set(1);const save=component.addDriver();const req=http.expectOne(r=>r.method==='PATCH');expect(req.request.body.registrationFeeEntryChoice).toBe('Paid');expect(req.request.body.status).toBeUndefined();req.flush({data:row});await save;http.expectNone(r=>r.url.endsWith('/movements'));http.expectOne(r=>r.url.endsWith('/drivers/search')).flush({data:[],meta:{total:0,summary}});
  });
  it('uploads the selected avatar through the protected, versioned document flow before saving its actual reference',async()=>{
    component.editingDriverId.set('driver-1');component.activeFormTab.set(0);component.activeSubSection.set(3);component.inputDriverTypes.set(['Car Driver']);const file=new File(['image fixture'],'photo.png',{type:'image/png'});component.onAvatarFileChange({target:{files:[file]}} as unknown as Event);const save=component.onSaveAndNext();const upload=http.expectOne(r=>r.method==='POST'&&r.url.endsWith('/drivers/driver-1/documents'));expect(upload.request.body.get('type')).toBe('Profile Photo');expect(upload.request.body.get('file')).toBe(file);upload.flush({data:{id:'photo',type:'Profile Photo',fileName:'photo.png',filePath:'drivers/driver-1/photo.png'}});let patch:ReturnType<typeof http.expectOne>|undefined;await vi.waitFor(()=>{patch??=http.match(r=>r.method==='PATCH')[0];expect(patch).toBeDefined();});expect(patch!.request.body.avatar).toBe('drivers/driver-1/photo.png');patch!.flush({data:{...row,status:'Non-Verified',avatar:'drivers/driver-1/photo.png'}});await save;http.expectOne(r=>r.url.endsWith('/drivers/search')).flush({data:[],meta:{total:0,summary}});
  });
});

describe('Driver list state and independent views',()=>{
  let component:Drivers;let http:HttpTestingController;
  beforeEach(async()=>{sessionStorage.removeItem('mera-driver-list-state');TestBed.resetTestingModule();await TestBed.configureTestingModule({imports:[Drivers],providers:[provideRouter([]),provideHttpClient(),provideHttpClientTesting(),provideSharedAuth({appPrefix:'test_md',apiBaseUrl:'http://localhost/api'})]}).compileComponents();component=TestBed.createComponent(Drivers).componentInstance;http=TestBed.inject(HttpTestingController);});
  afterEach(()=>{http.verify();sessionStorage.removeItem('mera-driver-list-state');});
  it('switches summary views without clearing selected filters and resets pagination',()=>{
    component.cityFilter.set('Pune');component.feeFilter.set('Unpaid');component.statusFilter.set('Non-Verified');component.page.set(3);component.quickView('users');
    const req=http.expectOne(r=>r.url.endsWith('/drivers/search'));expect(req.request.params.get('view')).toBe('users');expect(req.request.params.get('city')).toBe('Pune');expect(req.request.params.get('fee')).toBe('Unpaid');expect(req.request.params.get('status')).toBe('Non-Verified');expect(req.request.params.get('page')).toBe('1');req.flush({data:[],meta:{total:0,summary:{}}});
  });
  it('hides filters without losing values and clears them independently of view/search',()=>{
    component.selectedView.set('review');component.searchQuery.set('Ravi');component.cityFilter.set('Pune');component.toggleFilters();expect(component.filtersVisible()).toBe(false);expect(component.activeFilters()[0].label).toBe('City: Pune');expect(JSON.parse(sessionStorage.getItem('mera-driver-list-state')!).visible).toBe(false);
    component.clearFilters();expect(component.activeFilters()).toEqual([]);expect(component.selectedView()).toBe('review');expect(component.searchQuery()).toBe('Ravi');http.expectOne(r=>r.url.endsWith('/drivers/search')).flush({data:[],meta:{total:0,summary:{}}});
  });
  it('marks an unpaid optional fee as Optional and retains the exact blocking reason',()=>{
    component.allDrivers.set([{id:'one',name:'Ravi',phone:'123',feeStatus:'Unpaid',registrationFeeRequired:false,blockingReasons:['KYC not approved']} as any]);const row=JSON.parse(component.tableRowsString())[0];expect(row.feeLabel).toBe('Optional');expect(row.eligibilityLabel).toBe('KYC not approved');expect(row.name).toContain('one');
  });
});
