import { AuthService } from '@skylabs-monorepo/shared-auth/angular';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { httpErrorMessage } from '../../../core/http-error';
import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { AdminPage } from '../../../admin/admin-page/admin-page';
import { Workflow } from '../../workflow/workflow';
import { CustomerSelfApiService, type CustomerSelf } from '../../../core/customers/customer-self-api.service';

@Component({
  selector: 'md-customer-dashboard',
  imports: [AdminPage, Workflow],
  templateUrl: './dashboard.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class CustomerDashboard implements OnInit {
  private readonly auth=inject(AuthService);
  protected readonly userName=computed(()=>this.auth.bootstrap()?.user.name??[this.customer()?.firstName,this.customer()?.lastName].filter(Boolean).join(' '));
  private readonly api = inject(CustomerSelfApiService);
  private readonly router = inject(Router);

  protected readonly customer = signal<CustomerSelf | null>(null);
  protected readonly loading = signal(true);

  private readonly http=inject(HttpClient);
  protected readonly error=signal('');
  protected readonly summary=signal<{total:number;upcoming:number;completed:number;pendingPaise:number}|null>(null);
  protected money(value:number){return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(value/100);}
  ngOnInit(): void {void this.reload();}
  protected async reload(){this.loading.set(true);this.error.set('');this.summary.set(null);
    try{const [customer,response]=await Promise.all([firstValueFrom(this.api.get()),firstValueFrom(this.http.get<{data:{total:number;upcoming:number;completed:number;pendingPaise:number}}>(`${environment.apiUrl}/workflow/customer/dashboard`))]);this.customer.set(customer);this.summary.set(response.data);}catch(error){this.error.set(await httpErrorMessage(error as Parameters<typeof httpErrorMessage>[0]));}finally{this.loading.set(false);}
  }
  protected go(path: string): void {
    this.router.navigateByUrl(path);
  }
}
