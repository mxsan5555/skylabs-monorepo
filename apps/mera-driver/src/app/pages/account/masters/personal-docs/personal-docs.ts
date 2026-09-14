import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed } from '@angular/core';
import { AdminPage } from '../../../../admin/admin-page/admin-page';

interface MasterOption {
  id: number;
  name: string;
  status: 'Active' | 'Inactive';
}

@Component({
  selector: 'md-personal-docs-master',
  standalone: true,
  imports: [AdminPage],
  templateUrl: './personal-docs.html',
  styleUrl: '../masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class PersonalDocsMaster {
  readonly options = signal<MasterOption[]>([
    { id: 1, name: 'Address Proof', status: 'Active' },
    { id: 2, name: 'Affidavit of No Criminal Record', status: 'Active' },
    { id: 3, name: 'Bank Passbook / Cancelled Cheque', status: 'Active' },
    { id: 4, name: 'Commercial Driving License', status: 'Active' },
    { id: 5, name: 'Driver Badge', status: 'Active' },
    { id: 6, name: 'Driving License', status: 'Active' },
    { id: 7, name: 'PAN Card', status: 'Active' },
    { id: 8, name: 'Passport-size Photograph', status: 'Active' },
    { id: 9, name: 'Police Station NOC', status: 'Active' },
    { id: 10, name: 'Police Verification Certificate (PCC)', status: 'Active' },
    { id: 11, name: 'UPI / Bank Details for Payments', status: 'Active' },
    { id: 12, name: 'Vehicle Insurance Certificate', status: 'Active' },
    { id: 13, name: 'Vehicle Registration Certificate (RC)', status: 'Active' }
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
