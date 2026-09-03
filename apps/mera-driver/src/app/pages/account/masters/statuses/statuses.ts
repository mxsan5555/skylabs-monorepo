import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed } from '@angular/core';
import { AdminPage } from '../../../../admin/admin-page/admin-page';

interface MasterOption {
  id: number;
  name: string;
  status: 'Active' | 'Inactive';
}

@Component({
  selector: 'md-statuses-master',
  standalone: true,
  imports: [AdminPage],
  templateUrl: './statuses.html',
  styleUrl: '../masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class StatusesMaster {
  readonly options = signal<MasterOption[]>([
    { id: 1, name: 'Non-Verified', status: 'Active' },
    { id: 2, name: 'Verified', status: 'Active' },
    { id: 3, name: 'Partially Verified (P)', status: 'Active' },
    { id: 4, name: 'Partially Verified (K)', status: 'Active' },
    { id: 5, name: 'Blacklisted', status: 'Active' },
    { id: 6, name: 'Closed', status: 'Active' },
    { id: 7, name: 'Not Useful', status: 'Active' }
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
