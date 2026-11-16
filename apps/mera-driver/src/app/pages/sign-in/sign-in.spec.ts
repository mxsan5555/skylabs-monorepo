import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController,provideHttpClientTesting} from '@angular/common/http/testing';
import {provideRouter,Router} from '@angular/router';
import {provideSharedAuth} from '@skylabs-monorepo/shared-auth/angular';
import {SignIn} from './sign-in';
describe('OTP request navigation',()=>{
 let component:SignIn;let http:HttpTestingController;let navigate:ReturnType<typeof vi.spyOn>;
 beforeEach(async()=>{TestBed.resetTestingModule();await TestBed.configureTestingModule({imports:[SignIn],providers:[provideRouter([]),provideHttpClient(),provideHttpClientTesting(),provideSharedAuth({appPrefix:'otp_test',apiBaseUrl:'http://localhost/api'})]}).compileComponents();const fixture=TestBed.createComponent(SignIn);component=fixture.componentInstance;http=TestBed.inject(HttpTestingController);fixture.detectChanges();navigate=vi.spyOn(TestBed.inject(Router),'navigate').mockResolvedValue(true);});
 afterEach(()=>{http.verify();TestBed.resetTestingModule();});
 it('stays on sign-in and displays the real error when delivery fails',async()=>{(component as any).value='9999999999';(component as any).sendOtp();http.expectOne(r=>r.url.endsWith('/auth/otp/request')).flush({data:null,error:{code:'OTP_PROVIDER_REJECTED',message:'SMS provider did not accept the OTP request.'}},{status:503,statusText:'Service Unavailable'});await vi.waitFor(()=>expect((component as any).error()).toContain('SMS provider did not accept'));expect(navigate).not.toHaveBeenCalled();expect((component as any).loading()).toBe(false);});
 it('navigates only after an accepted delivery and prevents simultaneous requests',()=>{(component as any).value='9999999999';(component as any).sendOtp();(component as any).sendOtp();const requests=http.match(r=>r.url.endsWith('/auth/otp/request'));expect(requests).toHaveLength(1);requests[0].flush({data:{message:'If the identifier is valid, an OTP has been sent.'},error:null});expect(navigate).toHaveBeenCalledWith(['/otp'],{state:{destination:'9999999999',method:'phone',role:'customer',redirectTo:null}});});
});
