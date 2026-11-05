import { PillReviewApi } from '../../../core/drivers/pill-review-api.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { DriversApiService } from '../../../core/drivers/drivers-api.service';
import { documentChoices, availableDocumentChoices, DocumentChoice, duplicateDocumentRow } from '../../../core/drivers/document-type-selection';
import { httpErrorMessage } from '../../../core/http-error';
import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DriverSelfApiService, type DriverSelfDocument } from '../../../core/drivers/driver-self-api.service';
import { AdminPage } from '../../../admin/admin-page/admin-page';

const CATEGORIES: { value: DriverSelfDocument['category']; label: string }[] = [
  { value: 'personal', label: 'Personal' },
  { value: 'health', label: 'Health' },
  { value: 'education', label: 'Education' },
  { value: 'police', label: 'Police verification' },
];

@Component({
  selector: 'md-driver-documents',
  imports: [AdminPage],
  templateUrl: './documents.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DriverDocuments implements OnInit, OnDestroy {
  private readonly api = inject(DriverSelfApiService);
  private readonly fileApi = inject(PillReviewApi);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly route = inject(ActivatedRoute);
  private destroyed = false;
  private fileInput:HTMLInputElement|null = null;
  protected readonly previews = signal<Record<string,{url?:string;safe?:SafeResourceUrl;pdf?:boolean;image?:boolean;loading?:boolean;error?:string}>>({});
  private readonly driversApi=inject(DriversApiService);
  protected readonly masters=signal<Record<string,DocumentChoice[]>>({});
  protected readonly mastersLoading=signal(true);
  protected readonly replacing=signal<DriverSelfDocument|null>(null);
  protected readonly deleting=signal<string|null>(null);

  protected readonly categories = CATEGORIES;
  protected readonly documents = signal<DriverSelfDocument[]>([]);
  protected readonly loading = signal(true);
  protected readonly uploading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected category = signal<DriverSelfDocument['category']>('personal');
  protected docType = signal('');
  protected regNo = signal('');
  protected expiry = signal('');
  protected file: File | null = null;

  ngOnInit(): void {
    this.driversApi.formOptions().subscribe({next:options=>{this.masters.set(options);this.mastersLoading.set(false);},error:async err=>{this.error.set(await httpErrorMessage(err));}});
    const requested = this.route.snapshot.queryParamMap.get('category');
    if (requested && this.categories.some(c => c.value === requested)) this.category.set(requested as DriverSelfDocument['category']);
    this.reload(requested);
  }

  private reload(scrollToCategory?: string | null): void {
    this.loading.set(true);
    this.api.listDocuments().subscribe({
      next: (docs) => {
        this.documents.set(docs);
        this.loading.set(false);
        if (scrollToCategory) setTimeout(() => document.getElementById(`docs-${scrollToCategory}`)?.scrollIntoView({ behavior: 'smooth' }));
      },
      error: () => this.error.set("Could not load saved documents. Reload before adding a document."),
    });
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.fileInput=input;this.file = input.files?.[0] ?? null;
  }

  protected upload(): void {
    if(this.loading()||this.mastersLoading()||this.uploading())return;
    const choice=this.options().find(option=>option.id===this.docType());
    const type = this.replacing()?.type??choice?.name??'';
    if (!type) {
      this.error.set('Select Document Type.');
      return;
    }
    if (!this.file) {
      this.error.set('Please choose a file to upload.');
      return;
    }
    this.error.set(null);
    this.uploading.set(true);
    this.api.uploadDocument(this.category(), type, this.regNo().trim(), this.file, this.expiry() || undefined, choice?.status==='Active'?choice.id:undefined,this.replacing()?.id).subscribe({
      next: () => {
        this.uploading.set(false);
        this.replacing.set(null);this.docType.set('');
        this.regNo.set('');
        this.expiry.set('');
        this.clearFile();
        this.reload();
      },
      error: async (err) => {
        this.uploading.set(false);
        this.error.set(await httpErrorMessage(err));
      },
    });
  }

  protected remove(doc: DriverSelfDocument): void {
    if (!confirm(`Withdraw "${doc.type}" from review? Its original file and previous decisions will be preserved.`)) return;
    if(this.deleting())return;this.deleting.set(doc.id);
    this.api.deleteDocument(doc.id).subscribe({
      next: () => {this.deleting.set(null);if(this.replacing()?.id===doc.id)this.cancelReplacement();this.reload();},
      error: async (err) => {this.deleting.set(null);this.error.set(await httpErrorMessage(err));},
    });
  }

  protected clearFile(){this.file=null;if(this.fileInput)this.fileInput.value='';}
  protected async preview(doc:DriverSelfDocument){
    if(this.previews()[doc.id]?.url||this.previews()[doc.id]?.loading)return;
    this.previews.update(views=>({...views,[doc.id]:{loading:true}}));
    try{
      if(!doc.filePath)throw new Error('Original file is missing');
      const blob=await firstValueFrom(this.fileApi.preview(doc.filePath));
      const header=new Uint8Array(await blob.slice(0,8).arrayBuffer());
      const pdf=new TextDecoder().decode(header).startsWith('%PDF-');
      const image=header[0]===137&&header[1]===80||header[0]===255&&header[1]===216||new TextDecoder().decode(header).startsWith('RIFF');
      if(this.destroyed)return;
      const previewBlob=pdf?new Blob([blob],{type:'application/pdf'}):image?new Blob([blob],{type:header[0]===137?'image/png':header[0]===255?'image/jpeg':'image/webp'}):blob;
      const url=URL.createObjectURL(previewBlob);
      this.previews.update(views=>({...views,[doc.id]:{url,pdf,image,safe:this.sanitizer.bypassSecurityTrustResourceUrl(url),...(!pdf&&!image?{error:'File is damaged or its preview format is unsupported'}:{})}}));
    }catch(err){if(!this.destroyed)this.previews.update(views=>({...views,[doc.id]:{error:err instanceof Error&&!('status' in err)?err.message:'Original file is unavailable or access was denied'}}));}
  }
  ngOnDestroy(){this.destroyed=true;for(const preview of Object.values(this.previews()))if(preview.url)URL.revokeObjectURL(preview.url);}
  protected selectedTypeLabel(){return this.replacing()?.type??this.options().find(option=>option.id===this.docType())?.name??'Select Document Type';}
  protected options(){const rows=this.documents().filter(doc=>doc.category===this.category()&&!doc.archivedAt).map(doc=>({id:doc.id,type:doc.type,regNo:doc.regNo??'',file:doc.fileName??''}));return availableDocumentChoices(documentChoices(this.category(),this.masters()),rows,this.replacing()?rows.findIndex(row=>row.id===this.replacing()?.id):-1);}
  protected changeCategory(value:DriverSelfDocument['category']){this.cancelReplacement();this.category.set(value);this.docType.set('');}
  protected replace(doc:DriverSelfDocument){this.replacing.set(doc);this.category.set(doc.category);this.docType.set(this.options().find(option=>option.name===doc.type)?.id??'');this.regNo.set(doc.regNo??'');this.expiry.set(doc.expiresAt?.slice(0,10)??'');this.clearFile();}
  protected cancelReplacement(){this.replacing.set(null);this.docType.set('');this.regNo.set('');this.expiry.set('');this.clearFile();}
  protected duplicate(doc:DriverSelfDocument){const rows=this.documents().filter(item=>item.category===doc.category&&!item.archivedAt).map(item=>({id:item.id,type:item.type,regNo:'',file:''}));return !doc.archivedAt&&duplicateDocumentRow(documentChoices(doc.category,this.masters()),rows,rows.findIndex(item=>item.id===doc.id));}
  protected docsFor(category: DriverSelfDocument['category']): DriverSelfDocument[] {
    return this.documents().filter((d) => d.category === category);
  }

  protected currentDocsFor(category: DriverSelfDocument['category']): DriverSelfDocument[] {
    return this.docsFor(category).filter((d) => !d.archivedAt);
  }

  protected historyDocsFor(category: DriverSelfDocument['category']): DriverSelfDocument[] {
    return this.docsFor(category).filter((d) => d.archivedAt);
  }
}
