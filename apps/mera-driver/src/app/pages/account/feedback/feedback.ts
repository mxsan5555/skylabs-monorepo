import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AdminPage } from '../../../admin/admin-page/admin-page';

interface FeedbackItem {
  id?: string;
  booking_code: string;
  given_by: 'customer' | 'driver';
  rating: number;
  comment: string;
}

@Component({
  selector: 'app-feedback',
  standalone: true,
  imports: [CommonModule, AdminPage],
  styleUrl: '../masters/masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './feedback.html',
})
export class Feedback implements OnInit {
  private http = inject(HttpClient);

  feedbackList = signal<FeedbackItem[]>([]);
  showAddForm = signal(false);
  editingId = signal<string | 'new' | null>(null);

  inputBookingCode = signal('');
  inputGivenBy = signal<'customer' | 'driver'>('customer');
  inputRating = signal(5);
  inputComment = signal('');

  givenByOptions = signal<string[]>(['customer', 'driver']);
  ratingOptions = signal<number[]>([5, 4, 3, 2, 1]);

  readonly tableColumns = JSON.stringify([
    { key: 'booking_code', label: 'Booking Ref', sortable: true },
    { key: 'given_by', label: 'Given By', sortable: true },
    { key: 'rating', label: 'Rating (1-5 ⭐)', sortable: true },
    { key: 'comment', label: 'Review Comment', sortable: false },
  ]);

  readonly tableActions = JSON.stringify([
    { icon: 'edit', label: 'Edit', event: 'edit_option' },
    { icon: 'delete', label: 'Delete', event: 'delete_option', variant: 'danger' }
  ]);

  readonly tableRowsString = computed(() => JSON.stringify(this.feedbackList()));

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.http.get<any[]>('data/feedback.json').subscribe({
      next: (data) => {
        if (data) {
          const mapped = data.map((item: any) => ({
            id: String(item.id || 'rr-' + Math.random()),
            booking_code: item.booking_code || 'BK-1001',
            given_by: (item.given_by || item.role || 'customer').toLowerCase(),
            rating: Number(item.rating || 5),
            comment: item.comment || item.comments || 'Great service!',
          }));
          this.feedbackList.set(mapped);
        }
      },
      error: () => {
        this.feedbackList.set([
          { id: 'rr-1', booking_code: 'BK-1001', given_by: 'customer', rating: 5, comment: 'Great service! Driver arrived on time.' },
          { id: 'rr-2', booking_code: 'BK-1002', given_by: 'driver', rating: 4, comment: 'Polite passenger and smooth trip.' },
        ]);
      }
    });
  }

  onRowAction(event: any): void {
    const detail = event.detail || event;
    const action = detail.action;
    const row = detail.row;
    if (action === 'edit_option') {
      this.startEdit(row);
    } else if (action === 'delete_option') {
      this.deleteOption(row);
    }
  }

  startAdd() {
    this.editingId.set('new');
    this.inputBookingCode.set('BK-100' + (this.feedbackList().length + 1));
    this.inputGivenBy.set('customer');
    this.inputRating.set(5);
    this.inputComment.set('');
    this.showAddForm.set(true);
  }

  startEdit(row: FeedbackItem) {
    this.editingId.set(row.id || null);
    this.inputBookingCode.set(row.booking_code);
    this.inputGivenBy.set(row.given_by);
    this.inputRating.set(row.rating);
    this.inputComment.set(row.comment);
    this.showAddForm.set(true);
  }

  cancelEdit() {
    this.showAddForm.set(false);
    this.editingId.set(null);
  }

  saveOption() {
    const code = this.inputBookingCode().trim();
    if (!code) {
      alert('Booking Code reference is required.');
      return;
    }
    const id = this.editingId();
    const record: FeedbackItem = {
      id: id === 'new' ? 'rr-' + Date.now() : id!,
      booking_code: code,
      given_by: this.inputGivenBy(),
      rating: Number(this.inputRating()),
      comment: this.inputComment().trim(),
    };

    if (id === 'new') this.feedbackList.update(list => [...list, record]);
    else this.feedbackList.update(list => list.map(item => item.id === id ? record : item));

    this.cancelEdit();
  }

  deleteOption(row: FeedbackItem) {
    if (confirm(`Delete feedback entry for booking "${row.booking_code}"?`)) {
      this.feedbackList.update(list => list.filter(item => item.id !== row.id));
    }
  }
}
