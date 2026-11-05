import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController,provideHttpClientTesting} from '@angular/common/http/testing';
import {provideRouter} from '@angular/router';
import {provideSharedAuth} from '@skylabs-monorepo/shared-auth/angular';
import {KycAssignments} from './kyc-assignments';
describe('permission-scoped KYC queue UI',()=>{
 let http:HttpTestingController;let component:KycAssignments;
 beforeEach(async()=>{await TestBed.configureTestingModule({imports:[KycAssignments],providers:[provideRouter([]),provideHttpClient(),provideHttpClientTesting(),provideSharedAuth({appPrefix:'test_kyc',apiBaseUrl:'http://localhost/api'})]}).compileComponents();const fixture=TestBed.createComponent(KycAssignments);component=fixture.componentInstance;http=TestBed.inject(HttpTestingController);fixture.detectChanges();http.expectOne(request=>request.url.endsWith('/drivers/assigned-to-me')).flush({data:[],meta:{total:100000,page:1,pageSize:25,counts:{Unassigned:50000,Assigned:25000,'Issues Raised':20000,Completed:5000}}});});
 afterEach(()=>{http.verify();TestBed.resetTestingModule();});
 it('uses database totals rather than the page length',()=>{expect(component.totalDrivers()).toBe(100000);expect(component.counts()['Issues Raised']).toBe(20000);});
 it('combines state/search with server pagination and sorting without supplying an owner identity',()=>{component.filterState('Issues Raised');http.expectOne(request=>request.url.endsWith('/drivers/assigned-to-me')).flush({data:[],meta:{total:20000,counts:{}}});component.tableParams(new CustomEvent('params',{detail:{page:2,pageSize:50,search:'Ravi',sortKey:'firstName',sortDir:'asc'}}));const request=http.expectOne(request=>request.url.endsWith('/drivers/assigned-to-me'));expect(request.request.params.get('state')).toBe('Issues Raised');expect(request.request.params.get('pageSize')).toBe('50');expect(request.request.params.get('search')).toBe('Ravi');expect(request.request.params.get('sort')).toBe('firstName');expect(request.request.params.has('verifierId')).toBe(false);request.flush({data:[],meta:{total:3,counts:{}}});});
 it('surfaces a real request error instead of claiming an empty queue',async()=>{component.filterState('Assigned');http.expectOne(request=>request.url.endsWith('/drivers/assigned-to-me')).flush({error:{message:'KYC permission denied'}},{status:403,statusText:'Forbidden'});await vi.waitFor(()=>expect(component.actionError()).toContain('KYC permission denied'));expect(component.loading()).toBe(false);});
});
