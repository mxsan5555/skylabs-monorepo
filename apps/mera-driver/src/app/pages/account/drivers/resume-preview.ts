import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@skylabs-monorepo/shared-auth/angular';
import { environment } from '../../../../environments/environment';
import { httpErrorMessage } from '../../../core/http-error';

export interface ResumeProfile {
  summary:string;workExperience:{jobTitle:string;employer:string;location:string;startDate:string;endDate:string;current:boolean;responsibilities:string[]}[];
  keySkills:string[];transmissionSkills:('Manual'|'Automatic')[];education:{institution:string;location:string;year:string};availability:string;
  servicePreferences:('Local'|'Outstation'|'Long-term')[];sharePhone:boolean;shareEmail:boolean;
}
export interface ResumeSnapshot {html:string;revision:string;filename:string;missing:string[];profile:ResumeProfile;data:{name:string}}
@Component({selector:'md-resume-preview',standalone:true,imports:[RouterLink,FormsModule],templateUrl:'./resume-preview.html',styleUrl:'./resume-preview.css'})
export class ResumePreview implements OnInit, OnDestroy {
  private readonly http=inject(HttpClient);private readonly route=inject(ActivatedRoute);private readonly sanitizer=inject(DomSanitizer);
  readonly auth=inject(AuthService);readonly own=!this.route.snapshot.paramMap.get('id');
  readonly routeId=this.route.snapshot.paramMap.get('id');
  readonly base=`${environment.apiUrl}/drivers/${this.own?'me':encodeURIComponent(this.route.snapshot.paramMap.get('id')!)}`;
  readonly snapshot=signal<ResumeSnapshot|null>(null);readonly preview=signal<SafeHtml|null>(null);readonly error=signal('');readonly saving=signal(false);readonly editing=signal(false);
  profile!:ResumeProfile;reason='';skillsText='';responsibilityTexts:string[]=[];
  private resizeObserver?:ResizeObserver;private frame?:HTMLIFrameElement;
  async ngOnInit(){await this.reload();}
  canDownload(){return this.own||this.auth.can('drivers','export');}
  canEdit(){return !this.own&&this.auth.can('drivers','edit');}
  private accept(value:ResumeSnapshot){this.snapshot.set(value);this.preview.set(this.sanitizer.bypassSecurityTrustHtml(value.html));this.profile=structuredClone(value.profile);this.skillsText=this.profile.keySkills.join('\n');this.responsibilityTexts=this.profile.workExperience.map(e=>e.responsibilities.join('\n'));}
  async reload(){try{this.accept((await firstValueFrom(this.http.get<{data:ResumeSnapshot}>(`${this.base}/resume`))).data);this.error.set('');}catch(e){await this.fail(e);}}
  addExperience(){if(this.profile.workExperience.length>=6)return;this.profile.workExperience.push({jobTitle:'',employer:'',location:'',startDate:'',endDate:'',current:false,responsibilities:[]});this.responsibilityTexts.push('');}
  removeExperience(index:number){this.profile.workExperience.splice(index,1);this.responsibilityTexts.splice(index,1);}
  currentChanged(index:number){if(this.profile.workExperience[index].current)this.profile.workExperience[index].endDate='';}
  toggleTransmission(value:'Manual'|'Automatic',checked:boolean){this.profile.transmissionSkills=this.profile.transmissionSkills.filter(v=>v!==value);if(checked)this.profile.transmissionSkills.push(value);}
  togglePreference(value:'Local'|'Outstation'|'Long-term',checked:boolean){this.profile.servicePreferences=this.profile.servicePreferences.filter(v=>v!==value);if(checked)this.profile.servicePreferences.push(value);}
  hasTransmission(value:string){return this.profile.transmissionSkills.some(v=>v===value);}
  setTransmission(value:string,checked:boolean){if(value==='Manual'||value==='Automatic')this.toggleTransmission(value,checked);}
  hasPreference(value:string){return this.profile.servicePreferences.some(v=>v===value);}
  setPreference(value:string,checked:boolean){if(value==='Local'||value==='Outstation'||value==='Long-term')this.togglePreference(value,checked);}
  resizePreview(event:Event){this.frame=event.target as HTMLIFrameElement;this.resizeObserver?.disconnect();let width=0;this.resizeObserver=new ResizeObserver(entries=>{const next=entries[0]?.contentRect.width??0;if(next===width)return;width=next;this.fitPreview();});this.resizeObserver.observe(this.frame);this.fitPreview();}
  private fitPreview(){const height=this.frame?.contentDocument?.body.scrollHeight;if(height&&this.frame)this.frame.style.height=`${height+40}px`;}
  ngOnDestroy(){this.resizeObserver?.disconnect();}
  lines(value:string){return value.split('\n').map(v=>v.trim()).filter(Boolean);}
  async save(){if(!this.canEdit()||this.saving())return;this.saving.set(true);try{this.profile.keySkills=this.lines(this.skillsText);this.profile.workExperience.forEach((entry,index)=>entry.responsibilities=this.lines(this.responsibilityTexts[index]||''));this.accept((await firstValueFrom(this.http.patch<{data:ResumeSnapshot}>(`${this.base}/resume`,{profile:this.profile,revision:this.snapshot()!.revision,reason:this.reason}))).data);this.editing.set(false);this.reason='';this.error.set('');}catch(e){await this.fail(e);}finally{this.saving.set(false);}}
  cancel(){this.accept(this.snapshot()!);this.editing.set(false);this.reason='';}
  async download(){if(!this.canDownload()||!this.snapshot())return;try{const blob=await firstValueFrom(this.http.get(`${this.base}/resume.pdf`,{params:{revision:this.snapshot()!.revision},responseType:'blob'}));const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=this.snapshot()!.filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),30000);this.error.set('');}catch(e){await this.fail(e);}}
  private async fail(e:unknown){this.error.set(await httpErrorMessage(e instanceof HttpErrorResponse?e:{message:e instanceof Error?e.message:'Resume request failed'}));}
}
