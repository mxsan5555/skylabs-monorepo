import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ReviewItem {
  key: string; field: string; label?:string; value: unknown; hash: string; checkable: boolean;
  status: string; reason?: string | null; changedSinceReview: boolean;
}
export interface ReviewPill {
  category?:string; tab: number; pill: number; tabLabel: string; label: string; completed: boolean;
  items: ReviewItem[];
}
export interface PillReview {
  profile?:{name:string;photo:string|null;assignedReviewer:string;loginLinked?:boolean;kycStatus?:string};
  approval?:{ready:boolean;reasons:string[]};
  dl?:{submissionHash?:string;checkedByName?:string|null;providerCalled?:boolean;identityMatch?:boolean|null;validFrom?:string|null;validTo?:string|null;checkedAt?:string|null;inputs?:{dlNo:string|null;dob:string|null};enabled:boolean;status:string;reason:string;history:{id:string;createdAt:string;initiatorId:string;initiatorName?:string;action:string;summary:unknown}[]};
  driverId: string; pills: ReviewPill[]; checked: number; total: number; issues: number; status: string;
  documentInventory?: {id:string;type:string;category:string;fileName:string|null;filePath:string|null;version:number;createdAt:string;archivedAt:string|null;expiresAt:string|null;review?:{status:string;reason:string|null}|null}[];
  history?: {id:string;itemKey:string;status:string;reason:string|null;reviewerId:string;reviewerName?:string;label?:string;createdAt:string;submittedValue:unknown}[];
}

@Injectable({ providedIn: 'root' })
export class PillReviewApi {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;
  getAssigned(id: string) {
    return this.http.get<{ data: PillReview }>(`${this.base}/drivers/assigned-to-me/${id}/pill-review`).pipe(map(r => r.data));
  }
  getStaff(id: string) {
    return this.http.get<{ data: PillReview }>(`${this.base}/drivers/${id}/pill-review`).pipe(map(r => r.data));
  }
  getOwn() {
    return this.http.get<{ data: PillReview }>(`${this.base}/drivers/me/pill-review`).pipe(map(r => r.data));
  }
  verifyDl(id:string,retry=false){return this.http.post<{data:PillReview}>(`${this.base}/drivers/${id}/dl-verification/preflight`,{retry}).pipe(map(r=>r.data));}
  save(id: string, item: ReviewItem, status: 'Pass' | 'Issue', reason?: string) {
    return this.http.patch<{ data: PillReview }>(`${this.base}/drivers/${id}/pill-review`, { key: item.key, hash: item.hash, status, reason }).pipe(map(r => r.data));
  }
  preview(path: string) {
    return this.http.get(`${this.base}/uploads/${path.split('/').map(encodeURIComponent).join('/')}`, { responseType: 'blob' });
  }
}
