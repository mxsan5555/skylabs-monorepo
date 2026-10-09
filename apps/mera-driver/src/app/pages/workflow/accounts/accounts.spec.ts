import {TestBed} from '@angular/core/testing';
import {ActivatedRoute,provideRouter} from '@angular/router';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController,provideHttpClientTesting} from '@angular/common/http/testing';
import {of} from 'rxjs';
import {signal} from '@angular/core';
import {AuthService} from '@skylabs-monorepo/shared-auth/angular';
import {Accounts} from './accounts';
import {environment} from '../../../../environments/environment';

describe('Accounts overview',()=>{
  let http:HttpTestingController;
  async function mount(can=true){
    const auth={bootstrap:signal(undefined as never),can:vi.fn(()=>can)};
    await TestBed.configureTestingModule({imports:[Accounts],providers:[provideRouter([]),provideHttpClient(),provideHttpClientTesting(),{provide:ActivatedRoute,useValue:{data:of({section:'Overview'}),queryParamMap:of(new URLSearchParams() as never) }},{provide:AuthService,useValue:auth}]}).compileComponents();
    const fixture=TestBed.createComponent(Accounts);http=TestBed.inject(HttpTestingController);fixture.detectChanges();
    const lists=http.match(request=>request.url===environment.apiUrl+'/workflow/accounts');
    expect(lists.length).toBeGreaterThan(0);
    return {fixture,auth,lists};
  }
  it('loads the scoped overview and offers only the four actual ledger measures',async()=>{
    const {fixture,lists}=await mount();
    for(const list of lists)list.flush({data:{metrics:{platformCollections:120000,registrationFeesReceived:50000,earnedCommission:25000,driverPayoutDue:30000,postedPeriod:'Receipts posted this month',earnedPeriod:'Earned this month',balanceAsOf:'2026-10-08T00:00:00Z'},totals:{},bookings:[],drivers:[],movements:[],pendingActions:[],pendingFees:[],activity:[],meta:{total:0},dateRule:'test'}});
    fixture.detectChanges();expect(fixture.componentInstance.data()?.metrics?.['platformCollections']).toBe(120000);expect(fixture.componentInstance.cards()).toHaveLength(4);expect(fixture.nativeElement.textContent).toContain('Platform Collections');expect(fixture.nativeElement.textContent).not.toContain('Confirm financial movement');fixture.destroy();
  });
  it('opens an accessible driver record in the contextual fee dialog',async()=>{
    const {fixture,lists}=await mount();
    for(const list of lists)list.flush({data:{totals:{},bookings:[],drivers:[],movements:[],pendingActions:[],pendingFees:[],activity:[],meta:{total:0},dateRule:'test'}});
    fixture.componentInstance.openRecord('driver','driver-1');
    http.expectOne(environment.apiUrl+'/workflow/accounts/drivers/driver-1/fee').flush({data:{id:'driver-1',firstName:'Asha',registrationFeePaise:50000,registrationFeeRequired:true,fee:'Partial',netReceivedPaise:20000,remainingPaise:30000,receipts:[]}});
    fixture.detectChanges();expect(fixture.nativeElement.textContent).toContain('Asha');expect(fixture.nativeElement.textContent).toContain('Remaining:');fixture.destroy();
  });
  it('restarts the initial query when authenticated scope arrives and discards the stale response',async()=>{
    const {fixture,auth,lists}=await mount();
    auth.bootstrap.set({user:{id:'staff-1'},permissions:[],roles:[]} as never);
    fixture.detectChanges();
    const refreshed=http.expectOne(request=>request.url===environment.apiUrl+'/workflow/accounts');
    lists[0].flush({data:{totals:{stale:true},bookings:[],drivers:[],movements:[],pendingActions:[],meta:{total:0},dateRule:'stale'}});
    refreshed.flush({data:{metrics:{platformCollections:1,registrationFeesReceived:2,earnedCommission:3,driverPayoutDue:4,postedPeriod:'posted',earnedPeriod:'earned',balanceAsOf:'2026-10-08'},totals:{},bookings:[],drivers:[],movements:[],pendingActions:[],pendingFees:[],activity:[],meta:{total:0},dateRule:'test'}});
    fixture.detectChanges();
    expect(fixture.componentInstance.data()?.metrics?.['platformCollections']).toBe(1);
    expect(fixture.componentInstance.loading()).toBe(false);
    fixture.destroy();
  });
});
