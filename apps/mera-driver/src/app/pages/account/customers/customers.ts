import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed, inject, OnInit } from '@angular/core';
import {AuthService} from '@skylabs-monorepo/shared-auth/angular';
import {httpErrorMessage} from '../../../core/http-error';
import { AdminPage } from '../../../admin/admin-page/admin-page';
import { CustomersApiService, type Customer } from '../../../core/customers/customers-api.service';

@Component({
  selector: 'md-account-customers',
  standalone: true,
  imports: [AdminPage],
  templateUrl: './customers.html',
  styleUrl: '../masters/masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class Customers implements OnInit {
  private readonly api = inject(CustomersApiService);
  readonly auth=inject(AuthService);readonly page=signal(1);readonly pageSize=signal(25);readonly sort=signal('createdAt');readonly direction=signal<'asc'|'desc'>('desc');readonly search=signal('');readonly status=signal('');readonly total=signal(0);readonly counts=signal<Partial<Record<string,number>>>({});readonly error=signal('');
  tableParams(event:Event){const detail=(event as CustomEvent).detail;this.page.set(detail.page??1);this.pageSize.set(detail.pageSize??25);const columns:Record<string,string>={first_name:'firstName',last_name:'lastName',mobile_number:'mobileNumber',email:'email',customer_type:'customerType',verification_status:'verificationStatus',account_status:'accountStatus'};this.sort.set(columns[detail.sortKey]??'createdAt');this.direction.set(detail.sortDir==='asc'?'asc':'desc');this.search.set(detail.search??'');this.reload();}
  filterStatus(status:string){this.status.set(status);this.page.set(1);this.reload();}
  readonly options = signal<Customer[]>([]);
  readonly loading = signal<boolean>(false);

  ngOnInit(): void {
    this.reload();
  }

  private reload(): void {
    this.loading.set(true);
    this.error.set('');this.api.search({page:this.page(),pageSize:this.pageSize(),sort:this.sort(),direction:this.direction(),search:this.search(),...(this.status()?{status:this.status()}:{})}).subscribe({
      next: (data) => {
        this.options.set(data.rows);this.total.set(data.meta.total);this.counts.set(data.meta.counts);
        this.loading.set(false);
      },
      error: (err) => {
        void httpErrorMessage(err).then(message=>this.error.set(message));
        this.loading.set(false);
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

  readonly tableActions = computed(()=>JSON.stringify([
    ...(this.auth.can('customers','edit')?[{icon:'edit',label:'Edit',event:'edit_option'}]:[]),
    ...(this.auth.can('customers','delete')?[{icon:'delete',label:'Delete',event:'delete_option',variant:'danger'}]:[]),
    ...(this.auth.can('customers','edit')?[{icon:'toggle_on',label:'Activate / Deactivate',event:'toggle_status'}]:[])
  ]));

  readonly tableRowsString = computed(() => {
    return JSON.stringify(this.options());
  });

  onRowAction(event: any): void {
    const detail = event.detail || event;
    const action = detail.action;
    const row = detail.row;
    if(action==='toggle_status'){this.toggleStatus(row);return;}
    if (action === 'edit_option') {
      this.startEdit(row);
    } else if (action === 'delete_option') {
      this.deleteOption(row);
    }
  }

  toggleStatus(row:Customer){if(!this.auth.can('customers','edit'))return;const next=row.account_status==='Active'?'Inactive':'Active';const impact=`${row.active_booking_count??0} active bookings remain unchanged. Inactive customers cannot login or create bookings; staff can continue existing trips.`;const reason=prompt(`${next} customer: ${row.first_name}. ${impact} Enter an audit reason:`);if(!reason?.trim())return;this.api.update(row.customer_uid,{first_name:row.first_name,mobile_number:row.mobile_number,account_status:next,statusReason:reason.trim(),acknowledgeActiveBookings:true}).subscribe({next:()=>this.reload(),error:async error=>this.error.set(await httpErrorMessage(error))});}
  startAdd(): void {
    if (!this.auth.can('customers','create')) return;
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
    if (!this.auth.can('customers','edit')) return;
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
    if (!this.auth.can('customers', this.editingId() === 'new' ? 'create' : 'edit')) return;
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

    const payload = {
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
    };

    const id = this.editingId();
    if(id!=='new'&&this.options().find(row=>row.customer_uid===id)?.account_status!==payload.account_status){const reason=prompt('Account status changes restrict login/new bookings. Existing trips and payments are preserved. Enter an audit reason:');if(!reason?.trim())return;Object.assign(payload,{statusReason:reason.trim(),acknowledgeActiveBookings:true});}
    const request = id === 'new' ? this.api.create(payload) : this.api.update(id as string, payload);
    request.subscribe({
      next: () => {
        this.reload();
        this.cancelEdit();
      },
      error: (err) => {
        console.error('Failed to save customer', err);
        alert('Failed to save customer. Please try again.');
      }
    });
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
    if (!this.auth.can('customers','delete')) return;
    if (confirm(`Are you sure you want to delete customer "${option.first_name} ${option.last_name || ''}"?`)) {
      this.api.delete(option.customer_uid).subscribe({
        next: () => this.reload(),
        error: (err) => {
          console.error('Failed to delete customer', err);
          alert('Failed to delete customer. Please try again.');
        }
      });
    }
  }
}
