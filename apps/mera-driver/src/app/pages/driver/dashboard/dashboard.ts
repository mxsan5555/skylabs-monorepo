import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { AdminPage } from '../../../admin/admin-page/admin-page';
import { Workflow } from '../../workflow/workflow';
import { DriverSelfApiService, type DriverSelf } from '../../../core/drivers/driver-self-api.service';
import { statusVariant } from '../status-variant';
import { PillReviewApi, PillReview } from '../../../core/drivers/pill-review-api.service';
import { DlVerificationApi, DlState } from '../../../core/drivers/dl-verification-api.service';

@Component({
  selector: 'md-driver-dashboard',
  imports: [AdminPage, Workflow],
  templateUrl: './dashboard.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DriverDashboard implements OnInit {
  private readonly api = inject(DriverSelfApiService);
  private readonly router = inject(Router);
  private readonly reviews = inject(PillReviewApi);
  private readonly dlApi=inject(DlVerificationApi);
  protected readonly dl=signal<DlState|null>(null);
  private readonly http = inject(HttpClient);
  protected readonly readiness = signal<{fee:string;driver:{online:boolean;registrationFeeRequired:boolean};offers:unknown[]}|null>(null);
  protected readonly review = signal<PillReview | null>(null);
  protected readonly nextAction = computed(() => {
    const d = this.driver();
    if (!d) return null;
    const issue = this.review()?.pills.find(p => p.items.some(i => i.status === 'Issue'));
    if (issue) return { label: `Fix ${issue.tabLabel} → ${issue.label}`, path: `/driver/profile?tab=${issue.tab}&pill=${issue.pill}` };
    if ([10,11,12,13,20,21,30,31,32,40].some(key=>!d.completedSubSteps.includes(key))) return { label: `Continue onboarding · ${d.completionPercentage}%`, path: `/driver/profile?tab=${d.currentStep}&pill=${d.currentSubStep}` };
    if (d.status !== 'Verified') return { label: 'Waiting for KYC review and final approval', path: '/driver/kyc' };
    const ready=this.readiness();
    if(ready?.driver.registrationFeeRequired&&!['Paid','Waived'].includes(ready.fee))return {label:`Resolve registration fee · ${ready.fee}`,path:'/driver/fee'};
    if(ready&&!ready.driver.online)return {label:'Go online to receive trip requests',path:'/driver/availability'};
    if(ready?.offers.length)return {label:'Respond to your trip requests',path:'/driver/requests'};
    return { label: 'View KYC approval', path: '/driver/kyc' };
  });

  protected readonly driver = signal<DriverSelf | null>(null);
  protected readonly loading = signal(true);
  protected readonly statusVariant = statusVariant;

  ngOnInit(): void {
    this.dlApi.state('',true).subscribe({next:s=>this.dl.set(s)});
    this.http.get<{data:{fee:string;driver:{online:boolean;registrationFeeRequired:boolean};offers:unknown[]}}>(`${environment.apiUrl}/workflow/driver/overview`).subscribe({next:r=>this.readiness.set(r.data),error:()=>this.readiness.set(null)});
    this.reviews.getOwn().subscribe({ next: review => this.review.set(review) });
    this.api.get().subscribe({
      next: (d) => {
        this.driver.set(d);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected go(path: string): void {
    this.router.navigateByUrl(path);
  }
}
