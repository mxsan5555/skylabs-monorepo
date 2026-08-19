import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AdminPage } from '../../../admin/admin-page/admin-page';

interface Customer {
  customer_uid: string;
  first_name: string;
  last_name: string | null;
  profile_image: string | null;
  mobile_number: string;
  email: string | null;
  password_hash: string | null;
  date_of_birth: string | null;
  gender: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  state_id: number | null;
  city_id: number | null;
  pincode: string | null;
  alternate_phone: string | null;
  customer_type: 'Individual' | 'Corporate' | null;
  registration_source: 'Website' | 'App' | 'Admin' | 'Referral' | null;
  verification_status: 'Pending' | 'Verified' | 'Rejected';
  account_status: 'Active' | 'Inactive' | 'Blocked';
  last_login_at: string | null;
  notes: string | null;
}

@Component({
  selector: 'md-account-customers',
  standalone: true,
  imports: [AdminPage],
  templateUrl: './customers.html',
  styleUrl: '../masters/masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class Customers implements OnInit {
  private readonly http = inject(HttpClient);
  readonly options = signal<Customer[]>([]);

  ngOnInit(): void {
    this.http.get<Customer[]>('data/customers.json').subscribe({
      next: (data) => {
        this.options.set(data || []);
      },
      error: (err) => {
        console.error('Failed to load mock customers JSON', err);
      }
    });
  }

  readonly showAddForm = signal<boolean>(false);
  readonly editingId = signal<string | 'new' | null>(null);

  // Form Input Signals
  readonly inputFirstName = signal<string>('');
  readonly inputLastName = signal<string>('');
  readonly inputProfileImage = signal<string>('');
  readonly inputMobileNumber = signal<string>('');
  readonly inputEmail = signal<string>('');
  readonly inputDateOfBirth = signal<string>('');
  readonly inputGender = signal<string>('');
  readonly inputAddress1 = signal<string>('');
  readonly inputAddress2 = signal<string>('');
  readonly inputStateId = signal<number | null>(null);
  readonly inputCityId = signal<number | null>(null);
  readonly inputPincode = signal<string>('');
  readonly inputAlternatePhone = signal<string>('');
  readonly inputCustomerType = signal<'Individual' | 'Corporate'>('Individual');
  readonly inputRegSource = signal<'Website' | 'App' | 'Admin' | 'Referral'>('App');
  readonly inputVerStatus = signal<'Pending' | 'Verified' | 'Rejected'>('Pending');
  readonly inputAccStatus = signal<'Active' | 'Inactive' | 'Blocked'>('Active');
  readonly inputNotes = signal<string>('');

  // --- Showcase Datatable Configuration ---
  readonly tableColumns = JSON.stringify([
    { key: 'first_name', label: 'First Name', sortable: true },
    { key: 'last_name', label: 'Last Name', sortable: true },
    { key: 'mobile_number', label: 'Mobile Number', sortable: true },
    { key: 'email', label: 'Email', sortable: true },
    { key: 'customer_type', label: 'Type', sortable: true },
    { key: 'verification_status', label: 'Verification', type: 'status', statusMap: { 'Verified': 'success', 'Pending': 'warning', 'Rejected': 'error' } },
    { key: 'account_status', label: 'Account Status', type: 'status', statusMap: { 'Active': 'success', 'Inactive': 'warning', 'Blocked': 'error' } }
  ]);

  readonly tableActions = JSON.stringify([
    { icon: 'edit', label: 'Edit', event: 'edit_option' },
    { icon: 'delete', label: 'Delete', event: 'delete_option', variant: 'danger' }
  ]);

  readonly tableRowsString = computed(() => {
    // Return rows with full name resolved if needed, or raw options
    return JSON.stringify(this.options());
  });

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
    this.inputFirstName.set('');
    this.inputLastName.set('');
    this.inputProfileImage.set('');
    this.inputMobileNumber.set('');
    this.inputEmail.set('');
    this.inputDateOfBirth.set('');
    this.inputGender.set('');
    this.inputAddress1.set('');
    this.inputAddress2.set('');
    this.inputStateId.set(null);
    this.inputCityId.set(null);
    this.inputPincode.set('');
    this.inputAlternatePhone.set('');
    this.inputCustomerType.set('Individual');
    this.inputRegSource.set('App');
    this.inputVerStatus.set('Pending');
    this.inputAccStatus.set('Active');
    this.inputNotes.set('');
    this.showAddForm.set(true);
  }

  startEdit(option: Customer): void {
    this.editingId.set(option.customer_uid);
    this.inputFirstName.set(option.first_name);
    this.inputLastName.set(option.last_name || '');
    this.inputProfileImage.set(option.profile_image || '');
    this.inputMobileNumber.set(option.mobile_number);
    this.inputEmail.set(option.email || '');
    this.inputDateOfBirth.set(option.date_of_birth || '');
    this.inputGender.set(option.gender || '');
    this.inputAddress1.set(option.address_line_1 || '');
    this.inputAddress2.set(option.address_line_2 || '');
    this.inputStateId.set(option.state_id);
    this.inputCityId.set(option.city_id);
    this.inputPincode.set(option.pincode || '');
    this.inputAlternatePhone.set(option.alternate_phone || '');
    this.inputCustomerType.set(option.customer_type || 'Individual');
    this.inputRegSource.set(option.registration_source || 'App');
    this.inputVerStatus.set(option.verification_status);
    this.inputAccStatus.set(option.account_status);
    this.inputNotes.set(option.notes || '');
    this.showAddForm.set(true);
  }

  saveOption(): void {
    const firstName = this.inputFirstName().trim();
    const mobile = this.inputMobileNumber().trim();

    if (!firstName) {
      alert('First Name is required.');
      return;
    }
    if (!mobile) {
      alert('Mobile Number is required.');
      return;
    }

    const id = this.editingId();
    if (id === 'new') {
      const newOption: Customer = {
        customer_uid: 'cust-' + Date.now(),
        first_name: firstName,
        last_name: this.inputLastName().trim() || null,
        profile_image: this.inputProfileImage().trim() || null,
        mobile_number: mobile,
        email: this.inputEmail().trim() || null,
        password_hash: null,
        date_of_birth: this.inputDateOfBirth() || null,
        gender: this.inputGender() || null,
        address_line_1: this.inputAddress1().trim() || null,
        address_line_2: this.inputAddress2().trim() || null,
        state_id: this.inputStateId(),
        city_id: this.inputCityId(),
        pincode: this.inputPincode().trim() || null,
        alternate_phone: this.inputAlternatePhone().trim() || null,
        customer_type: this.inputCustomerType(),
        registration_source: this.inputRegSource(),
        verification_status: this.inputVerStatus(),
        account_status: this.inputAccStatus(),
        last_login_at: null,
        notes: this.inputNotes().trim() || null
      };
      this.options.update(list => [...list, newOption]);
    } else if (id) {
      this.options.update(list => list.map(opt => opt.customer_uid === id ? {
        ...opt,
        first_name: firstName,
        last_name: this.inputLastName().trim() || null,
        profile_image: this.inputProfileImage().trim() || null,
        mobile_number: mobile,
        email: this.inputEmail().trim() || null,
        date_of_birth: this.inputDateOfBirth() || null,
        gender: this.inputGender() || null,
        address_line_1: this.inputAddress1().trim() || null,
        address_line_2: this.inputAddress2().trim() || null,
        state_id: this.inputStateId(),
        city_id: this.inputCityId(),
        pincode: this.inputPincode().trim() || null,
        alternate_phone: this.inputAlternatePhone().trim() || null,
        customer_type: this.inputCustomerType(),
        registration_source: this.inputRegSource(),
        verification_status: this.inputVerStatus(),
        account_status: this.inputAccStatus(),
        notes: this.inputNotes().trim() || null
      } : opt));
    }

    this.cancelEdit();
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.inputFirstName.set('');
    this.inputLastName.set('');
    this.inputProfileImage.set('');
    this.inputMobileNumber.set('');
    this.inputEmail.set('');
    this.inputDateOfBirth.set('');
    this.inputGender.set('');
    this.inputAddress1.set('');
    this.inputAddress2.set('');
    this.inputStateId.set(null);
    this.inputCityId.set(null);
    this.inputPincode.set('');
    this.inputAlternatePhone.set('');
    this.inputCustomerType.set('Individual');
    this.inputRegSource.set('App');
    this.inputVerStatus.set('Pending');
    this.inputAccStatus.set('Active');
    this.inputNotes.set('');
    this.showAddForm.set(false);
  }

  deleteOption(option: Customer): void {
    if (confirm(`Are you sure you want to delete customer "${option.first_name} ${option.last_name || ''}"?`)) {
      this.options.update(list => list.filter(opt => opt.customer_uid !== option.customer_uid));
    }
  }
}
