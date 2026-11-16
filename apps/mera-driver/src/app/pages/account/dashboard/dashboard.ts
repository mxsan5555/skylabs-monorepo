import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@skylabs-monorepo/shared-auth/angular';
import { AdminPage } from '../../../admin/admin-page/admin-page';
import { environment } from '../../../../environments/environment';
import { httpErrorMessage } from '../../../core/http-error';
interface Link {label:string;path:string}
interface Summary {userName:string;role:string;cards:{key:string;title:string;value:number;money?:boolean;hint:string;path:string}[];actions:Link[];attention:Link[];records:{label:string;detail:string;path:string}[];gaps:string[]}
@Component({selector:'md-account-dashboard',imports:[AdminPage,RouterLink],templateUrl:'./dashboard.html',schemas:[CUSTOM_ELEMENTS_SCHEMA]})
export class Dashboard {
  private readonly auth=inject(AuthService);private readonly http=inject(HttpClient);private readonly router=inject(Router);
  protected readonly summary=signal<Summary|null>(null);protected readonly loading=signal(true);protected readonly error=signal('');
  protected readonly userName=computed(()=>this.auth.bootstrap()?.user.name??'');
  private sequence=0;
  constructor(){effect(()=>{const userId=this.auth.bootstrap()?.user.id;this.sequence++;this.summary.set(null);if(userId)this.refresh();});}
  protected refresh(){const sequence=++this.sequence;this.loading.set(true);this.error.set('');this.summary.set(null);
    this.http.get<{data:Summary}>(`${environment.apiUrl}/dashboard`).subscribe({next:r=>{if(sequence!==this.sequence)return;this.summary.set(r.data);this.loading.set(false);},error:async e=>{const message=await httpErrorMessage(e);if(sequence!==this.sequence)return;this.error.set(message);this.loading.set(false);}});
  }
  protected value(card:Summary['cards'][number]){return card.money?new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(card.value/100):card.value.toLocaleString('en-IN');}
  protected destination(path:string){return this.router.parseUrl(path);}
}
