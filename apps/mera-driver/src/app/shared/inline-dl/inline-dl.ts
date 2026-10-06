import { Component, CUSTOM_ELEMENTS_SCHEMA, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { DlVerificationApi, DlState, dlInputKey, dlPresentation } from '../../core/drivers/dl-verification-api.service';
import { httpErrorMessage } from '../../core/http-error';

@Component({selector:'md-inline-dl',templateUrl:'./inline-dl.html',schemas:[CUSTOM_ELEMENTS_SCHEMA]})
export class InlineDl {
  readonly driverId=input<string|null>(null); readonly own=input(false);
  readonly dlNo=input(''); readonly dob=input(''); readonly issueDate=input(''); readonly expiryDate=input('');
  private readonly api=inject(DlVerificationApi);
  readonly savedRevision=input('');
  readonly state=signal<DlState|null>(null); readonly message=signal('');
  readonly presentation=computed(()=>dlPresentation(this.currentState()));
  readonly currentState=computed(()=>{const s=this.state();return s&&dlInputKey(s.inputs.dlNo??'',s.inputs.dob??'')===dlInputKey(this.dlNo(),this.dob())?s:null;});
  readonly discrepancy=computed(()=>{const s=this.currentState();if(!s?.enabled||!s.providerCalled)return '';return [s.validFrom&&this.issueDate()&&s.validFrom!==this.issueDate()?'Confirmed issue date differs from the entered date.':null,s.validTo&&this.expiryDate()&&s.validTo!==this.expiryDate()?'Confirmed expiry date differs from the entered date.':null].filter(Boolean).join(' ');});
  private loadGeneration=0;
  constructor(){
    inject(DestroyRef).onDestroy(()=>{this.loadGeneration++;});
    effect(()=>{const id=this.driverId(),own=this.own();this.savedRevision();const version=++this.loadGeneration;this.state.set(null);this.message.set('');if(id)this.api.state(id,own).subscribe({next:s=>{if(version===this.loadGeneration)this.state.set(s);},error:async e=>{const m=await httpErrorMessage(e);if(version===this.loadGeneration)this.message.set(m);}});});
  }
}
