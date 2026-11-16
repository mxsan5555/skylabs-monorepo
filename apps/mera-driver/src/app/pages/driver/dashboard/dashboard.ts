import { AuthService } from '@skylabs-monorepo/shared-auth/angular';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { httpErrorMessage } from '../../../core/http-error';
import { Component, CUSTOM_ELEMENTS_SCHEMA, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminPage } from '../../../admin/admin-page/admin-page';
import { DriverSelfApiService, type DriverSelf } from '../../../core/drivers/driver-self-api.service';
import { DriverWorkflowApiService, type DriverWorkflowOverview } from '../../../core/drivers/driver-workflow-api.service';
import { statusVariant } from '../status-variant';
import { maskEmail, maskPhone } from '../mask-contact';
import { calculateProfileCompletion } from '../profile-completion';
import { PillReviewApi, PillReview } from '../../../core/drivers/pill-review-api.service';

const ONGOING_TRIP_STATUSES = ['on_the_way', 'arrived', 'in_progress'];
/** Required onboarding sub-steps (mirrors the server's own eligibility rule, minus the
 *  finance-only Registration Fees pill which never blocks onboarding). */
const REQUIRED_SUB_STEPS = [10, 11, 12, 13, 20, 21, 30, 31, 32, 40];

@Component({
  selector: 'md-driver-dashboard',
  imports: [AdminPage],
  templateUrl: './dashboard.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DriverDashboard implements OnInit, OnDestroy {
  private readonly auth=inject(AuthService);
  protected readonly userName=computed(()=>this.auth.bootstrap()?.user.name??[this.driver()?.firstName,this.driver()?.lastName].filter(Boolean).join(' '));
  private readonly api = inject(DriverSelfApiService);
  private readonly workflow = inject(DriverWorkflowApiService);
  private readonly reviews = inject(PillReviewApi);
  private readonly router = inject(Router);

  protected readonly driver = signal<DriverSelf | null>(null);
  protected readonly review = signal<PillReview | null>(null);
  protected readonly overview = signal<DriverWorkflowOverview | null>(null);
  protected readonly loading = signal(true);
  protected readonly photoUrl = signal('');
  protected readonly photoFailed = signal(false);
  protected readonly statusVariant = statusVariant;
  protected readonly maskPhone = maskPhone;
  protected readonly maskEmail = maskEmail;

  protected readonly completion = computed(() => {
    const d = this.driver();
    return d ? calculateProfileCompletion(d) : null;
  });

  /** "Account & Lead Info" pill (tab 1 / pill 3) carries driverType/experience — admin-set,
   *  read-only here; never exposed as an editable field to the driver. */
  private readonly accountLeadItems = computed(() => this.review()?.pills.find(p => p.tab === 1 && p.pill === 3)?.items ?? []);
  protected readonly driverTypeDisplay = computed(() => this.fieldValue('driverType') || 'Not set');
  protected readonly experienceDisplay = computed(() => this.fieldValue('experience') || 'Not set');
  private fieldValue(field: string): string {
    const value = this.accountLeadItems().find(i => i.field === field)?.value;
    return Array.isArray(value) ? value.join(', ') : typeof value === 'string' ? value : '';
  }

  protected readonly kycIssueCount = computed(() => this.review()?.issues ?? 0);
  protected readonly cityState = computed(() => {
    const d = this.driver();
    return d ? [d.city, d.state].filter(Boolean).join(', ') : '';
  });

  protected readonly feeRequired = computed(() => this.overview()?.driver.registrationFeeRequired ?? false);
  protected readonly feeStatus = computed(() => this.overview()?.fee ?? null);

  protected readonly eligible = computed(() => (this.overview()?.reasons.length ?? 1) === 0);
  protected readonly blockers = computed(() => this.overview()?.reasons ?? []);

  protected readonly activeTrip = computed(() => this.overview()?.trips.find(t => ONGOING_TRIP_STATUSES.includes(t.status)) ?? null);
  protected readonly pendingOfferCount = computed(() => this.overview()?.offers.length ?? 0);
  protected readonly upcomingTrips=computed(()=>(this.overview()?.trips??[]).filter(t=>['confirmed','on_the_way','arrived'].includes(t.status)&&t.startsAt&&Date.parse(t.startsAt)>=Date.now()).slice(0,5));
  protected readonly online = computed(() => this.overview()?.driver.online ?? false);

  /** Most relevant pending action, prioritized exactly like the eligibility rule itself:
   *  a flagged KYC issue (with the reviewer's own reason text) outranks everything else. */
  protected readonly nextAction = computed(() => {
    const d = this.driver();
    if (!d) return null;
    const issuePill = this.review()?.pills.find(p => p.items.some(i => i.status === 'Issue'));
    const issueItem = issuePill?.items.find(i => i.status === 'Issue');
    if (issuePill && issueItem) {
      return {
        label: issueItem.reason || `Fix ${issuePill.tabLabel} → ${issuePill.label}`,
        path: `/driver/profile?tab=${issuePill.tab}&pill=${issuePill.pill}`,
      };
    }
    if (REQUIRED_SUB_STEPS.some(key => !d.completedSubSteps.includes(key))) {
      return { label: `Continue onboarding · ${d.completionPercentage}%`, path: `/driver/profile?tab=${d.currentStep}&pill=${d.currentSubStep}` };
    }
    if (d.status !== 'Verified') return { label: 'Waiting for KYC review and final approval', path: '/driver/kyc' };
    const overview = this.overview();
    if (overview?.driver.registrationFeeRequired && !['Paid', 'Waived'].includes(overview.fee)) {
      return { label: `Resolve registration fee · ${overview.fee}`, path: '/driver/fee' };
    }
    if (overview && !overview.driver.online) return { label: 'Go online to receive trip requests', path: '/driver/availability' };
    if (overview?.offers.length) return { label: 'Respond to your trip requests', path: '/driver/requests' };
    return { label: 'View KYC approval', path: '/driver/kyc' };
  });

  /** One row per onboarding pill (minus the finance-only one) — click opens that section. */
  protected readonly checklist = computed(() =>
    (this.review()?.pills ?? [])
      .filter(p => !(p.tab === 4 && p.pill === 1))
      .map(p => ({ label: `${p.tabLabel} · ${p.label}`, complete: p.completed, tab: p.tab, pill: p.pill })),
  );

  private readonly http=inject(HttpClient);
  protected readonly error=signal('');protected readonly upcoming=signal(0);
  ngOnInit():void{void this.reload();}
  protected async reload(){this.loading.set(true);this.error.set('');
    try{const [overview,review,driver,stats]=await Promise.all([firstValueFrom(this.workflow.overview()),firstValueFrom(this.reviews.getOwn()),firstValueFrom(this.api.get()),firstValueFrom(this.http.get<{data:{upcoming:number}}>(`${environment.apiUrl}/workflow/driver/dashboard`))]);this.overview.set(overview);this.review.set(review);this.driver.set(driver);this.upcoming.set(stats.data.upcoming);await this.loadPhoto(review.profile?.photo??null);}
    catch(error){this.error.set(await httpErrorMessage(error as Parameters<typeof httpErrorMessage>[0]));}finally{this.loading.set(false);}
  }

  ngOnDestroy(): void {
    if (this.photoUrl().startsWith('blob:')) URL.revokeObjectURL(this.photoUrl());
  }

  /** Same authenticated-blob pattern as the shared KYC pill-review photo/document preview
   *  (`pill-review.ts`'s `loadPhoto`) — a data: URI is used directly, an `/uploads/...` path
   *  is fetched through the ownership-checked file route, anything else falls back to initials. */
  private async loadPhoto(photo: string | null): Promise<void> {
    this.photoFailed.set(false);
    if (!photo) return;
    if (photo.startsWith('data:image/')) { this.photoUrl.set(photo); return; }
    if (!photo.startsWith('/uploads/drivers/')) { this.photoFailed.set(true); return; }
    try {
      // `photo` is already percent-encoded by the backend; `preview()` encodes its input
      // itself, so decode first or a space ("%20") becomes "%2520" and 404s.
      const blob = await firstValueFrom(this.reviews.preview(decodeURIComponent(photo.slice('/uploads/'.length))));
      this.photoUrl.set(URL.createObjectURL(blob));
    } catch {
      this.photoFailed.set(true);
    }
  }

  protected initials(): string {
    const d = this.driver();
    return d ? `${d.firstName?.[0] ?? ''}${d.lastName?.[0] ?? ''}`.toUpperCase() || '?' : '?';
  }

  protected go(path: string): void {
    this.router.navigateByUrl(path);
  }
}
