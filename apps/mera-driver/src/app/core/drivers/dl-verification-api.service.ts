import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface DlState {
  submissionHash?:string;checkedByName?:string|null;enabled:boolean; status:string; reason:string;
  inputs:{dlNo:string|null;dob:string|null}; checkedAt:string|null;
  providerCalled:boolean; validFrom:string|null; validTo:string|null;
  identityMatch?:boolean|null;
  history:{id:string;createdAt:string;action:string;summary:{status?:string;reason?:string;providerCalled?:boolean}}[];
}
export const dlInputKey=(dl:string,dob:string)=>JSON.stringify([dl.replace(/[ -]/g,'').toUpperCase(),dob.trim()]);
export function validDlDate(value:string|null):value is string {
  if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function dlInputError(dl:string,dob:string):string {
  if(!dob)return 'Please complete Date of Birth in Personal Details';
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if(!match)return 'Enter a valid Date of Birth in Personal Details';
  const date=new Date(Date.UTC(+match[1],+match[2]-1,+match[3]));
  if(date.getUTCFullYear()!==+match[1]||date.getUTCMonth()!==+match[2]-1||date.getUTCDate()!==+match[3]||+match[1]<1900||date>new Date())return 'Enter a valid Date of Birth in Personal Details';
  if(!/^[A-Za-z0-9 -]{8,30}$/.test(dl.trim()))return 'Enter a complete valid DL number';
  return '';
}
/** UI presentation of restricted backend evidence, never evidence for a save/approval. */
export function dlPresentation(state:DlState|null){
  if(!state||state.status==='Not checked')return {label:'Not checked',icon:'pending',variant:'neutral'};
  const expiry=validDlDate(state.validTo)?state.validTo:null;
  if(state.providerCalled&&state.status==='Expired'||state.enabled&&state.providerCalled&&state.status==='API verified'&&expiry&&expiry<new Date().toISOString().slice(0,10))return {label:'Licence expired',icon:'warning',variant:'warning'};
  if(state.enabled&&state.providerCalled&&state.identityMatch===true&&state.status==='API verified'&&expiry)return {label:'DL Verified',icon:'check_circle',variant:'success'};
  if(state.providerCalled&&state.status==='Invalid / no record found')return {label:'No licence record found',icon:'error',variant:'error'};
  if(state.providerCalled&&state.status==='Mismatch/Invalid')return {label:'Identity mismatch · Review required',icon:'warning',variant:'warning'};
  return {label:'Verification unavailable · Retry',icon:'warning',variant:'warning'};
}
@Injectable({providedIn:'root'})
export class DlVerificationApi {
  private readonly http=inject(HttpClient);
  private path(id:string,own:boolean){return `${environment.apiUrl}/drivers/${own?'me':encodeURIComponent(id)}/dl-verification`;}
  state(id:string,own:boolean){return this.http.get<{data:DlState}>(this.path(id,own)).pipe(map(r=>r.data));}
}
