import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {provideHttpClientTesting,HttpTestingController} from '@angular/common/http/testing';
import {provideRouter} from '@angular/router';
import {DriverApplication} from './driver-application';
describe('three-field public Driver application',()=>{
 let component:DriverApplication;let http:HttpTestingController;
 beforeEach(async()=>{TestBed.resetTestingModule();await TestBed.configureTestingModule({imports:[DriverApplication],providers:[provideRouter([]),provideHttpClient(),provideHttpClientTesting()]}).compileComponents();const f=TestBed.createComponent(DriverApplication);component=f.componentInstance;http=TestBed.inject(HttpTestingController);f.detectChanges();http.expectOne(r=>r.url.endsWith('/drivers/application-options')).flush({data:[{id:'commercial',label:'Commercial'},{id:'non',label:'Non-commercial'},{id:'other',label:'Other'}],error:null});});
 afterEach(()=>{http.verify();TestBed.resetTestingModule();});
 const fill=()=>{(component as any).fullName='Saved Driver';(component as any).phone='9000000009';(component as any).driverTypeId='commercial';};
 it('uses Master IDs and requires exactly the three application fields',()=>{(component as any).submit();expect(Object.keys((component as any).fields())).toEqual(['fullName','phone','driverTypeId']);http.expectNone(r=>r.url.endsWith('/drivers/applications'));});
 it('disables repeated saving and shows success only after backend confirmation',()=>{fill();(component as any).submit();(component as any).submit();expect((component as any).saving()).toBe(true);expect((component as any).success()).toBe('');const req=http.expectOne(r=>r.url.endsWith('/drivers/applications'));expect(req.request.body).toEqual({fullName:'Saved Driver',phone:'9000000009',driverTypeId:'commercial'});req.flush({data:{message:'Application saved; login activation pending'},error:null});expect((component as any).success()).toContain('activation pending');expect((component as any).saving()).toBe(false);});
 it('reports a duplicate safely and never shows success',async()=>{fill();(component as any).submit();http.expectOne(r=>r.url.endsWith('/drivers/applications')).flush({data:null,error:{code:'APPLICATION_ALREADY_EXISTS',message:'Application already submitted. Contact the team.'}},{status:409,statusText:'Conflict'});await vi.waitFor(()=>expect((component as any).error()).toContain('already submitted'));expect((component as any).success()).toBe('');});
});
