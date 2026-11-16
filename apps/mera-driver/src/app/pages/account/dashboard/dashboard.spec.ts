import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController,provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '@skylabs-monorepo/shared-auth/angular';
import { Dashboard } from './dashboard';
describe('Account dashboard request isolation',()=>{
 let http:HttpTestingController;let fixture:ReturnType<typeof TestBed.createComponent<Dashboard>>;
 const bootstrap=signal<any>(null);
 const summary=(name:string)=>({userName:name,role:'Vendor',cards:[{key:'drivers',title:'All Drivers',value:0,hint:'Own drivers',path:'/account/drivers?view=all'}],actions:[],attention:[],records:[],gaps:[]});
 beforeEach(async()=>{bootstrap.set({user:{id:'vendor-one',name:'Vendor One'}});TestBed.resetTestingModule();await TestBed.configureTestingModule({imports:[Dashboard],providers:[provideRouter([]),provideHttpClient(),provideHttpClientTesting(),{provide:AuthService,useValue:{bootstrap}}]}).compileComponents();fixture=TestBed.createComponent(Dashboard);http=TestBed.inject(HttpTestingController);fixture.detectChanges();});
 afterEach(()=>{http.verify();TestBed.resetTestingModule();});
 it('renders successful empty responses as zero and preserves filter URLs',()=>{http.expectOne(r=>r.url.endsWith('/dashboard')).flush({data:summary('Vendor One')});fixture.detectChanges();expect(fixture.nativeElement.textContent).toContain('0');expect(fixture.nativeElement.querySelector('.grid a').getAttribute('href')).toBe('/account/drivers?view=all');});
 it('shows failed requests with retry instead of zero cards',async()=>{http.expectOne(r=>r.url.endsWith('/dashboard')).flush({error:{message:'Database unavailable'}},{status:500,statusText:'Error'});await fixture.whenStable();fixture.detectChanges();expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Database unavailable');expect(fixture.nativeElement.querySelector('.grid a')).toBeNull();});
 it('clears the old summary and ignores a stale response after account changes',()=>{
   const previous=http.expectOne(r=>r.url.endsWith('/dashboard'));bootstrap.set({user:{id:'vendor-two',name:'Vendor Two'}});fixture.detectChanges();const current=http.expectOne(r=>r.url.endsWith('/dashboard'));previous.flush({data:summary('Vendor One')});fixture.detectChanges();expect((fixture.componentInstance as any).summary()).toBeNull();current.flush({data:summary('Vendor Two')});fixture.detectChanges();expect((fixture.componentInstance as any).summary().userName).toBe('Vendor Two');bootstrap.set(null);fixture.detectChanges();expect((fixture.componentInstance as any).summary()).toBeNull();
 });
});
