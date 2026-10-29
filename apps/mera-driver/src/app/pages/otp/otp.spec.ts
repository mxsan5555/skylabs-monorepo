import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController,provideHttpClientTesting} from '@angular/common/http/testing';
import {provideRouter} from '@angular/router';
import {provideSharedAuth} from '@skylabs-monorepo/shared-auth/angular';
import {Otp} from './otp';
describe('OTP resend',()=>{
 let component:Otp;let http:HttpTestingController;
 beforeEach(async()=>{history.replaceState({destination:'9999999999',method:'phone'},'');TestBed.resetTestingModule();await TestBed.configureTestingModule({imports:[Otp],providers:[provideRouter([]),provideHttpClient(),provideHttpClientTesting(),provideSharedAuth({appPrefix:'otp_test',apiBaseUrl:'http://localhost/api'})]}).compileComponents();const fixture=TestBed.createComponent(Otp);component=fixture.componentInstance;http=TestBed.inject(HttpTestingController);fixture.detectChanges();http.expectOne('data/auth.json').flush({});(component as any).seconds.set(0);});
 afterEach(()=>{http.verify();TestBed.resetTestingModule();history.replaceState({},'');});
 it('reports a resend failure without restarting the cooldown',async()=>{(component as any).resend();http.expectOne(r=>r.url.endsWith('/auth/otp/request')).flush({error:{code:'OTP_NETWORK_BLOCKED',message:'SMS provider connection is blocked on the server.'}},{status:503,statusText:'Service Unavailable'});await vi.waitFor(()=>expect((component as any).error()).toContain('blocked on the server'));expect((component as any).seconds()).toBe(0);expect((component as any).resending()).toBe(false);});
 it('starts cooldown only after success, and blocks duplicate resend',()=>{(component as any).resend();(component as any).resend();const requests=http.match(r=>r.url.endsWith('/auth/otp/request'));expect(requests).toHaveLength(1);requests[0].flush({data:{message:'OTP request accepted'},error:null});expect((component as any).seconds()).toBeGreaterThan(0);expect((component as any).resending()).toBe(false);});
});
