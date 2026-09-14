import { Component, CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { AdminPage } from '../../../admin/admin-page/admin-page';

export interface CategoryItem {
  id: number;
  name: string;
  status: 'Active' | 'Inactive';
}

@Component({
  selector: 'md-account-category',
  standalone: true,
  imports: [AdminPage],
  templateUrl: './category.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Category {
  categories = signal<CategoryItem[]>([
    { id: 1, name: 'Sedan Booking', status: 'Active' },
    { id: 2, name: 'SUV Booking', status: 'Active' },
    { id: 3, name: 'Outstation Rides', status: 'Inactive' },
    { id: 4, name: 'Hourly Rental', status: 'Active' },
  ]);

  editingId = signal<number | 'new' | null>(null);
  draft = signal<{ name: string; status: 'Active' | 'Inactive' }>({
    name: '',
    status: 'Active',
  });

  addCategory(): void {
    this.draft.set({ name: '', status: 'Active' });
    this.editingId.set('new');
  }

  editCategory(item: CategoryItem): void {
    this.draft.set({ name: item.name, status: item.status });
    this.editingId.set(item.id);
  }

  submit(): void {
    const id = this.editingId();
    const data = this.draft();
    if (!data.name.trim()) return;

    if (id === 'new') {
      this.categories.update((list) => [
        ...list,
        { id: Date.now(), name: data.name.trim(), status: data.status },
      ]);
    } else if (id !== null) {
      this.categories.update((list) =>
        list.map((c) =>
          c.id === id ? { ...c, name: data.name.trim(), status: data.status } : c,
        ),
      );
    }
    this.editingId.set(null);
  }

  cancel(): void {
    this.editingId.set(null);
  }

  deleteCategory(item: CategoryItem): void {
    if (confirm(`Are you sure you want to delete "${item.name}"?`)) {
      this.categories.update((list) => list.filter((c) => c.id !== item.id));
    }
  }
}
