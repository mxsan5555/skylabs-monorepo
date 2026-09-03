import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AdminPage } from '../../../admin/admin-page/admin-page';

interface FaqItem {
  id?: string;
  question: string;
  answer: string;
  category: string;
  display_order: number;
}

@Component({
  selector: 'app-faqs',
  standalone: true,
  imports: [CommonModule, AdminPage],
  styleUrl: '../masters/masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './faqs.html',
})
export class Faqs implements OnInit {
  private http = inject(HttpClient);

  faqList = signal<FaqItem[]>([]);
  showAddForm = signal(false);
  editingId = signal<string | 'new' | null>(null);

  // Form Signals according to Schema
  inputQuestion = signal('');
  inputAnswer = signal('');
  inputCategory = signal('General');
  inputDisplayOrder = signal(0);

  categoryOptions = signal<string[]>([
    'General',
    'Rides & Bookings',
    'Payments & Wallets',
    'Driver Support',
    'Account'
  ]);

  readonly tableColumns = JSON.stringify([
    { key: 'display_order', label: 'Order', sortable: true },
    { key: 'question', label: 'Question', sortable: true },
    { key: 'category', label: 'Category', sortable: true },
    { key: 'answer', label: 'Answer Content', sortable: false },
  ]);

  readonly tableActions = JSON.stringify([
    { icon: 'edit', label: 'Edit', event: 'edit_option' },
    { icon: 'delete', label: 'Delete', event: 'delete_option', variant: 'danger' }
  ]);

  readonly tableRowsString = computed(() => JSON.stringify(this.faqList()));

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.http.get<any[]>('data/faqs.json').subscribe({
      next: (data) => {
        if (data) {
          const mapped = data.map((item: any) => ({
            id: String(item.id || 'faq-' + Math.random()),
            question: item.question || 'How to request a driver?',
            answer: item.answer || 'Select pick & drop location on map and hit book.',
            category: item.category || 'General',
            display_order: Number(item.display_order || 0),
          }));
          this.faqList.set(mapped);
        }
      },
      error: () => {
        this.faqList.set([
          { id: 'faq-1', question: 'How do I book a driver?', answer: 'You can book via the web or mobile app.', category: 'Rides & Bookings', display_order: 1 },
          { id: 'faq-2', question: 'What is the cancellation policy?', answer: 'Free cancellation up to 15 mins before scheduled pickup.', category: 'Rides & Bookings', display_order: 2 },
          { id: 'faq-3', question: 'How are wallet earnings processed?', answer: 'Wallet balance can be withdrawn to bank account via Payout section.', category: 'Payments & Wallets', display_order: 3 },
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
    this.inputQuestion.set('');
    this.inputAnswer.set('');
    this.inputCategory.set('General');
    this.inputDisplayOrder.set(this.faqList().length + 1);
    this.showAddForm.set(true);
  }

  startEdit(row: FaqItem) {
    this.editingId.set(row.id || null);
    this.inputQuestion.set(row.question);
    this.inputAnswer.set(row.answer);
    this.inputCategory.set(row.category);
    this.inputDisplayOrder.set(row.display_order);
    this.showAddForm.set(true);
  }

  cancelEdit() {
    this.showAddForm.set(false);
    this.editingId.set(null);
  }

  saveOption() {
    const q = this.inputQuestion().trim();
    const a = this.inputAnswer().trim();
    if (!q || !a) {
      alert('Question and Answer content are required.');
      return;
    }
    const id = this.editingId();
    const record: FaqItem = {
      id: id === 'new' ? 'faq-' + Date.now() : id!,
      question: q,
      answer: a,
      category: this.inputCategory(),
      display_order: Number(this.inputDisplayOrder()),
    };

    if (id === 'new') this.faqList.update(list => [...list, record]);
    else this.faqList.update(list => list.map(item => item.id === id ? record : item));

    this.cancelEdit();
  }

  deleteOption(row: FaqItem) {
    if (confirm(`Delete FAQ "${row.question}"?`)) {
      this.faqList.update(list => list.filter(item => item.id !== row.id));
    }
  }
}
