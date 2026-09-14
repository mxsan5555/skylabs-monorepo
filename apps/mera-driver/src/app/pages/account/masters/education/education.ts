import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed } from '@angular/core';
import { AdminPage } from '../../../../admin/admin-page/admin-page';

interface MasterOption {
  id: number;
  name: string;
  status: 'Active' | 'Inactive';
}

@Component({
  selector: 'md-education-master',
  standalone: true,
  imports: [AdminPage],
  templateUrl: './education.html',
  styleUrl: '../masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class EducationMaster {
  readonly options = signal<MasterOption[]>([
    { id: 1, name: 'No Formal Education', status: 'Active' },
    { id: 2, name: 'Primary School (Class 1–5)', status: 'Active' },
    { id: 3, name: 'Secondary School (Class 6–10)', status: 'Active' },
    { id: 4, name: 'Higher Secondary (Class 11–12)', status: 'Active' },
    { id: 5, name: 'Diploma / Certification Course', status: 'Active' },
    { id: 6, name: "Bachelor's Degree", status: 'Active' },
    { id: 7, name: "Master's Degree", status: 'Active' },
    { id: 8, name: 'Doctorate / PhD', status: 'Active' }
  ]);

  readonly showAddForm = signal<boolean>(false);
  readonly editingId = signal<number | 'new' | null>(null);
  readonly inputName = signal<string>('');
  readonly inputStatus = signal<'Active' | 'Inactive'>('Active');

  // --- Showcase Datatable Configuration ---
  readonly tableColumns = JSON.stringify([
    { key: 'name', label: 'Option Name / Label', sortable: true },
    { key: 'status', label: 'Status', type: 'status', statusMap: { 'Active': 'success', 'Inactive': 'error' } }
  ]);

  readonly tableActions = JSON.stringify([
    { icon: 'edit', label: 'Edit', event: 'edit_option' },
    { icon: 'delete', label: 'Delete', event: 'delete_option', variant: 'danger' }
  ]);

  readonly tableRowsString = computed(() => JSON.stringify(this.options()));

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

  startAdd(): void {
    this.editingId.set('new');
    this.inputName.set('');
    this.inputStatus.set('Active');
    this.showAddForm.set(true);
  }

  startEdit(option: MasterOption): void {
    this.editingId.set(option.id);
    this.inputName.set(option.name);
    this.inputStatus.set(option.status);
    this.showAddForm.set(true);
  }

  saveOption(): void {
    const name = this.inputName().trim();
    if (!name) {
      alert('Option name cannot be empty.');
      return;
    }

    const id = this.editingId();
    if (id === 'new') {
      const newOption: MasterOption = {
        id: Date.now(),
        name,
        status: this.inputStatus()
      };
      this.options.update(list => [...list, newOption]);
    } else if (typeof id === 'number') {
      this.options.update(list => list.map(opt => opt.id === id ? { ...opt, name, status: this.inputStatus() } : opt));
    }

    this.cancelEdit();
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.inputName.set('');
    this.inputStatus.set('Active');
    this.showAddForm.set(false);
  }

  deleteOption(option: MasterOption): void {
    if (confirm(`Are you sure you want to delete option "${option.name}"?`)) {
      this.options.update(list => list.filter(opt => opt.id !== option.id));
    }
  }
}
