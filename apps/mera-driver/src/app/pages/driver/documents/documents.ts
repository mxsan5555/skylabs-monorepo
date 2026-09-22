import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, inject, signal } from '@angular/core';
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
export class DriverDocuments implements OnInit {
  private readonly api = inject(DriverSelfApiService);

  protected readonly categories = CATEGORIES;
  protected readonly documents = signal<DriverSelfDocument[]>([]);
  protected readonly loading = signal(true);
  protected readonly uploading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected category = signal<DriverSelfDocument['category']>('personal');
  protected docType = signal('');
  protected regNo = signal('');
  protected file: File | null = null;

  ngOnInit(): void {
    this.reload();
  }

  private reload(): void {
    this.loading.set(true);
    this.api.listDocuments().subscribe({
      next: (docs) => {
        this.documents.set(docs);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.file = input.files?.[0] ?? null;
  }

  protected upload(): void {
    const type = this.docType().trim();
    if (!type) {
      this.error.set('Please enter a document type.');
      return;
    }
    if (!this.file) {
      this.error.set('Please choose a file to upload.');
      return;
    }
    this.error.set(null);
    this.uploading.set(true);
    this.api.uploadDocument(this.category(), type, this.regNo().trim(), this.file).subscribe({
      next: () => {
        this.uploading.set(false);
        this.docType.set('');
        this.regNo.set('');
        this.file = null;
        this.reload();
      },
      error: (err) => {
        this.uploading.set(false);
        this.error.set(err?.message ?? 'Upload failed. Please try again.');
      },
    });
  }

  protected remove(doc: DriverSelfDocument): void {
    if (!confirm(`Delete "${doc.type}"?`)) return;
    this.api.deleteDocument(doc.id).subscribe({
      next: () => this.reload(),
      error: (err) => this.error.set(err?.message ?? 'Delete failed. Please try again.'),
    });
  }

  protected docsFor(category: DriverSelfDocument['category']): DriverSelfDocument[] {
    return this.documents().filter((d) => d.category === category);
  }
}
