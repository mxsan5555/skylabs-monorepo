import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed, inject, OnInit } from '@angular/core';
import { AdminPage } from '../../../../admin/admin-page/admin-page';
import { MasterListApiService, type MasterOption } from '../../../../core/masters/master-list-api.service';

const CATEGORY = 'eye-visions';

@Component({
  selector: 'md-eye-visions-master',
  standalone: true,
  imports: [AdminPage],
  templateUrl: './eye-visions.html',
  styleUrl: '../masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class EyeVisionsMaster implements OnInit {
  private readonly api = inject(MasterListApiService);

  readonly options = signal<MasterOption[]>([]);
  readonly loading = signal<boolean>(false);

  readonly showAddForm = signal<boolean>(false);
  readonly editingId = signal<string | number | 'new' | null>(null);
  readonly inputName = signal<string>('');
  readonly inputStatus = signal<'Active' | 'Inactive'>('Active');

  readonly tableColumns = JSON.stringify([
    { key: 'name', label: 'Option Name / Label', sortable: true },
    { key: 'status', label: 'Status', type: 'status', statusMap: { 'Active': 'success', 'Inactive': 'error' } }
  ]);

  readonly tableActions = JSON.stringify([
    { icon: 'edit', label: 'Edit', event: 'edit_option' },
    { icon: 'delete', label: 'Delete', event: 'delete_option', variant: 'danger' }
  ]);

  readonly tableRowsString = computed(() => JSON.stringify(this.options()));

  ngOnInit(): void {
    this.reload();
  }

  private reload(): void {
    this.loading.set(true);
    this.api.list(CATEGORY).subscribe({
      next: (data) => {
        this.options.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load eye vision options', err);
        this.loading.set(false);
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
    const payload = { name, status: this.inputStatus() };
    const request = id === 'new' || id === null ? this.api.create(CATEGORY, payload) : this.api.update(CATEGORY, id, payload);
    request.subscribe({
      next: () => {
        this.reload();
        this.cancelEdit();
      },
      error: (err) => {
        console.error('Failed to save option', err);
        alert('Failed to save option. Please try again.');
      }
    });
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.inputName.set('');
    this.inputStatus.set('Active');
    this.showAddForm.set(false);
  }

  deleteOption(option: MasterOption): void {
    if (confirm(`Are you sure you want to delete option "${option.name}"?`)) {
      this.api.delete(CATEGORY, option.id).subscribe({
        next: () => this.reload(),
        error: (err) => {
          console.error('Failed to delete option', err);
          alert('Failed to delete option. Please try again.');
        }
      });
    }
  }
}
