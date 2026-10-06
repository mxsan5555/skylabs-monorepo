import { Component, CUSTOM_ELEMENTS_SCHEMA, OnDestroy, inject, input, signal, effect, computed, untracked, HostListener } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@skylabs-monorepo/shared-auth/angular';
import { httpErrorMessage } from '../../../core/http-error';
import { dlPresentation } from '../../../core/drivers/dl-verification-api.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { PillReviewApi, PillReview, ReviewItem, ReviewPill } from '../../../core/drivers/pill-review-api.service';

type ReviewDocument=NonNullable<PillReview['documentInventory']>[number];
interface DocumentView{url?:string;safe?:SafeResourceUrl;pdf?:boolean;error?:string;loading?:boolean}
@Component({
  selector: 'md-pill-review', standalone: true, imports: [RouterLink], schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl:'./pill-review.html',styleUrl:'./pill-review.css',
})
export class PillReviewComponent implements OnDestroy {
  readonly driverId = input<string>('');
  readonly own = input(false);
  readonly staff = input(false);
  readonly administrativeDl = input(false);
  private readonly api = inject(PillReviewApi);
  private readonly sanitizer = inject(DomSanitizer);
  readonly review = signal<PillReview | null>(null);
  readonly auth=inject(AuthService);
  readonly issueKey=signal<string|null>(null);readonly notice=signal('');
  readonly photoUrl=signal('');readonly photoFailed=signal(false);readonly documentViews=signal<Record<string,DocumentView>>({});
  readonly selectedPill=computed(()=>this.review()?.pills.find(p=>p.tab===this.activeTab()&&p.pill===this.activePill()));
  readonly relevantDocuments=computed(()=>{const p=this.selectedPill();if(!p)return [];const ids=p.items.filter(i=>i.key.startsWith('document:')).map(i=>i.key.slice(9));return (this.review()?.documentInventory??[]).filter(d=>!d.archivedAt&&(ids.includes(d.id)||!!p.category&&p.category===d.category||p.tab===3&&p.pill===0&&this.licenceDocument(d.type)||p.items.some(i=>i.field==='avatar')&&d.type==='Profile Photo'));});
  readonly pending=computed(()=>this.review()?.pills.flatMap(p=>p.items).filter(i=>i.checkable&&i.status==='Pending'&&!i.changedSinceReview).length??0);
  readonly stale=computed(()=>this.review()?.pills.flatMap(p=>p.items).filter(i=>i.checkable&&i.changedSinceReview).length??0);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly reasons = signal<Partial<Record<string, string>>>({});
  readonly activeTab = signal(1);
  readonly activePill = signal(0);
  readonly previewUrl = signal<SafeResourceUrl | null>(null);
  readonly rawPreviewUrl = signal('');
  readonly previewType = signal('');
  private reviewGeneration=0;
  licenceDocument(type:string){return /driving licen[cs]e/i.test(type);}
  dlLabel(){const dl=this.review()?.dl;return dl?dlPresentation({...dl,providerCalled:dl.providerCalled??false,inputs:dl.inputs??{dlNo:null,dob:null},checkedAt:dl.checkedAt??null,validFrom:dl.validFrom??null,validTo:dl.validTo??null,history:[]}).label:'Not checked';}
  dlIcon(){const dl=this.review()?.dl;return dl?dlPresentation({...dl,providerCalled:dl.providerCalled??false,inputs:dl.inputs??{dlNo:null,dob:null},checkedAt:dl.checkedAt??null,validFrom:dl.validFrom??null,validTo:dl.validTo??null,history:[]}).icon:'pending';}
  readonly checkingDl=signal(false);
  verifyDl(retry=false){if(this.checkingDl()||this.own()||(this.staff()&&!this.administrativeDl()))return;const id=this.driverId(),version=this.reviewGeneration;this.checkingDl.set(true);this.error.set(null);this.api.verifyDl(id,retry).subscribe({next:r=>{if(this.driverId()===id&&version===this.reviewGeneration){this.review.set(r);this.checkingDl.set(false);}},error:e=>{if(this.driverId()===id&&version===this.reviewGeneration){this.error.set(e?.error?.error?.message??'Verification unavailable. Retry deliberately.');this.checkingDl.set(false);}}});}
  readonly tabs = [
    { id: 1, label: 'Personal Details' }, { id: 2, label: 'Education & Health Details' },
    { id: 3, label: 'Documents Details' }, { id: 4, label: 'Payment Details' },
  ];
  constructor() {
    effect(onCleanup => {
      const id = this.driverId(),own=this.own(),staff=this.staff();
      if (!id && !own) return;
      untracked(()=>{
      this.reviewGeneration++;this.closePreview();this.releaseDocuments();this.issueKey.set(null);this.reasons.set({});this.error.set(null);this.saving.set(false);this.notice.set('');
      this.review.set(null);
      this.checkingDl.set(false);
      const subscription = (own ? this.api.getOwn() : staff ? this.api.getStaff(id) : this.api.getAssigned(id)).subscribe({
        next: r => { this.review.set(r);void this.loadPhoto(r.profile?.photo??null); try{const saved=JSON.parse(localStorage.getItem(this.navKey())??'null');if(saved&&r.pills.some(p=>p.tab===saved.tab&&p.pill===saved.pill)){this.activeTab.set(saved.tab);this.activePill.set(saved.pill);}}catch{/* Corrupt navigation state is ignored. */} }, error: () => this.error.set('Unable to load this review. Refresh or contact support.'),
      });
      onCleanup(() => subscription.unsubscribe());
      });
    });
    effect(()=>{const docs=this.relevantDocuments();untracked(()=>{void this.loadDocuments(docs);});});
  }
  navKey(){return `mera_driver_review_nav_${this.review()?.driverId??this.driverId()}`;}
  selectTab(tab: number) { this.issueKey.set(null);this.activeTab.set(tab); this.selectPill(0); }
  selectPill(pill:number){this.activePill.set(pill);try{localStorage.setItem(this.navKey(),JSON.stringify({tab:this.activeTab(),pill}));}catch{/* Navigation remains usable when storage is disabled. */}}
  historyValue(value:unknown){return value==null?'Not provided':typeof value==='object'?JSON.stringify(value):String(value);}
  dlHistoryLabel(action:string,value:unknown){if(action==='driver.dl.consent')return 'Historical consent recorded';if(action==='driver.dl.consent_challenge')return 'Historical consent challenge issued';const summary=value as {status?:string;reason?:string;providerCalled?:boolean};return [summary?.status??'Not checked',summary?.reason,summary?.providerCalled?'Provider request recorded':'No provider call'].filter(Boolean).join(' / '); }
  date(value:string|null|undefined){return value&&Number.isFinite(new Date(value).getTime())?new Date(value).toLocaleString():'Not provided';}
  savedDob(){return this.display(this.review()?.pills.flatMap(p=>p.items).find(i=>i.key==='field:dob')?.value);}
  total(p: ReviewPill) { return p.items.filter(i => i.checkable).length; }
  checked(p: ReviewPill) { return p.items.filter(i => i.checkable && i.status !== 'Pending').length; }
  label(field: string) { return ({dob:'Date of Birth',dlNo:'DL Number',ifscCode:'IFSC Code',avatar:'Profile Photo'} as Record<string,string>)[field]??field.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()); }
  display(value: unknown): string {
    if (value == null || value === '' || Array.isArray(value) && !value.length) return 'Not provided';
    if(Array.isArray(value))return value.map(v=>this.display(v)).join(', ');
    if(typeof value==='string'&&(/^(drivers\/|data:image\/)/.test(value)))return 'Uploaded file (see Documents)';
    if (typeof value === 'object') {
      const doc = value as { type?: string; fileName?: string; regNo?: string };
      return [doc.type, doc.fileName || 'No file uploaded', doc.regNo].filter(Boolean).join(' · ');
    }
    return String(value);
  }
  documentPath(item: ReviewItem): string | null {
    return item.key.startsWith('document:') ? (item.value as { filePath?: string })?.filePath ?? null : null;
  }
  setReason(key: string, value: string) { this.reasons.update(r => ({ ...r, [key]: value })); }
  save(item: ReviewItem, status: 'Pass' | 'Issue') {
    const reason = (this.reasons()[item.key] ?? item.reason ?? '').trim();
    if (status === 'Issue' && !reason) { this.error.set('Enter a specific correction reason before choosing Issue.'); return; }
    const version=this.reviewGeneration;this.saving.set(true); this.error.set(null);
    this.api.save(this.driverId(), item, status, reason).subscribe({
      next: r => { if(version!==this.reviewGeneration)return;this.review.set(r);this.issueKey.set(null);this.notice.set(`${item.label??this.label(item.field)} saved as ${status==='Pass'?'Passed':'Issue'}`); this.saving.set(false); },
      error: err => { if(version!==this.reviewGeneration)return;this.saving.set(false); this.error.set(err?.error?.error?.message ?? 'Could not save. Reload if the submission has changed.'); },
    });
  }
  preview(path: string) {
    const version=this.reviewGeneration;this.error.set(null);
    this.api.preview(path).subscribe({
      next: blob => {
        if(version!==this.reviewGeneration)return;
        if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) { this.previewFailed(); return; }
        this.closePreview();
        const url = URL.createObjectURL(blob);
        this.rawPreviewUrl.set(url); this.previewType.set(blob.type);
        this.previewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
      }, error: () => {if(version===this.reviewGeneration)this.previewFailed();},
    });
  }
  previewFailed() { this.closePreview(); this.error.set('Document is missing, unreadable, or not a supported image/PDF. Contact support for the original.'); }
  closePreview() { if (this.rawPreviewUrl()) URL.revokeObjectURL(this.rawPreviewUrl()); this.rawPreviewUrl.set(''); this.previewUrl.set(null); }
  initials(){return (this.review()?.profile?.name??'Driver').split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();}
  savedDl(){return this.display(this.review()?.pills.flatMap(p=>p.items).find(i=>i.field==='dlNo')?.value);}
  statusLabel(item:ReviewItem){return item.changedSinceReview?'Review required after changes':item.status==='Pass'?'Passed':item.status;}
  variant(status:string){return ['Pass','Passed','Verified','API verified'].includes(status)?'primary':['Issue','Invalid / no record found','Mismatch/Invalid','Expired'].includes(status)?'error':'secondary';}
  raiseIssue(item:ReviewItem){this.issueKey.set(item.key);this.error.set(null);}
  @HostListener('window:focus')
  refreshReview(){const id=this.driverId(),version=this.reviewGeneration;(this.own()?this.api.getOwn():this.staff()?this.api.getStaff(id):this.api.getAssigned(id)).subscribe({next:r=>{if(version===this.reviewGeneration)this.review.set(r);},error:err=>{void httpErrorMessage(err).then(m=>this.error.set(m));}});}
  async loadPhoto(photo:string|null){const version=this.reviewGeneration;this.photoFailed.set(false);if(!photo)return;if(photo.startsWith('data:image/')){this.photoUrl.set(photo);return;}if(!photo.startsWith('/uploads/drivers/')){this.photoFailed.set(true);return;}try{const blob=await firstValueFrom(this.api.preview(photo.slice('/uploads/'.length)));if(version!==this.reviewGeneration)return;this.photoUrl.set(URL.createObjectURL(blob));}catch{if(version===this.reviewGeneration)this.photoFailed.set(true);}}
  async loadDocuments(docs:ReviewDocument[]){let next=0;await Promise.all(Array.from({length:Math.min(3,docs.length)},async()=>{while(next<docs.length)await this.loadDocument(docs[next++]);}));}
  async loadDocument(doc:ReviewDocument){if(this.documentViews()[doc.id])return;const version=this.reviewGeneration;this.documentViews.update(v=>({...v,[doc.id]:{loading:true}}));try{if(!doc.filePath)throw new Error('Original file is missing');const blob=await firstValueFrom(this.api.preview(doc.filePath));const header=new Uint8Array(await blob.slice(0,8).arrayBuffer());const pdf=new TextDecoder().decode(header).startsWith('%PDF-');const image=header[0]===137&&header[1]===80||header[0]===255&&header[1]===216||new TextDecoder().decode(header).startsWith('RIFF');if(version!==this.reviewGeneration)return;const url=URL.createObjectURL(blob);this.documentViews.update(v=>({...v,[doc.id]:{url,pdf,safe:this.sanitizer.bypassSecurityTrustResourceUrl(url),...(!pdf&&!image?{error:'File is damaged or its preview format is unsupported'}:{})}}));}catch(err){if(version===this.reviewGeneration)this.documentViews.update(v=>({...v,[doc.id]:{error:err instanceof Error&&!('status' in err)?err.message:'Original file is unavailable or access was denied'}}));}}
  documentError(id:string){this.documentViews.update(v=>({...v,[id]:{...v[id],error:'Image is damaged or unavailable'}}));}
  loadAllDocuments(event:Event){if((event.target as HTMLDetailsElement).open)void this.loadDocuments(this.review()?.documentInventory??[]);}
  releaseDocuments(){new Set([this.photoUrl(),...Object.values(this.documentViews()).map(v=>v.url)]).forEach(url=>{if(url?.startsWith('blob:'))URL.revokeObjectURL(url);});this.photoUrl.set('');this.documentViews.set({});}
  ngOnDestroy() { this.reviewGeneration++;this.closePreview();this.releaseDocuments();this.closePreview(); }
}
