import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, inject, OnInit, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AdminPage } from '../../../admin/admin-page/admin-page';

interface Driver {
  id?: number;
  name: string;
  phone: string;
  vehicle: string;
  city?: string;
  // --- Onboarding Leads Fields ---
  firstName?: string;
  lastName?: string;
  fatherName?: string;
  motherName?: string;
  email?: string;
  emergencyNumber?: string;
  dob?: string;
  maritalStatus?: string;
  gender?: string;
  passportNumber?: string;
  religion?: string;
  color?: string;
  language?: string;
  age?: string;
  height?: string;
  weight?: string;
  country?: string;
  state?: string;
  pincode?: string;
  address?: string;
  driverType?: string;
  status?: string;
  sourceType?: string;
  avatar?: string;
  // --- Education & Health Fields ---
  education?: string;
  trainingStatus?: string;
  trainingCertificate?: string;
  eyeVision?: string;
  healthInsurance?: string;
  bloodGroup?: string;
  // --- Documents Fields ---
  licenseDetails?: string;
  vehicleType?: string;
  dlNo?: string;
  dlIssueDate?: string;
  dlExpiryDate?: string;
  policeVerifiedStatus?: string;
  policeVerifiedNo?: string;
  policeVerifiedUpload?: string;
  jobType?: string;
  experience?: string;
  currentSalary?: string;
  expectedSalary?: string;
  documentCategory?: string;
  documentUpload?: string;
  // --- Payment Fields ---
  preferredPaymentMode?: string;
  amount?: string;
  paymentReceiptDate?: string;
  bankName?: string;
  bankAccountNo?: string;
  ifscCode?: string;
  branchName?: string;
  upiIdOrChequeNo?: string;
  personalDocs?: Array<{ type: string; regNo: string; file: string }>;
  healthDocs?: Array<{ type: string; regNo: string; file: string }>;
  educationDocs?: Array<{ type: string; regNo: string; file: string }>;
  policeDocs?: Array<{ type: string; regNo: string; file: string }>;
}

@Component({
  selector: 'md-account-drivers',
  standalone: true,
  imports: [AdminPage],
  templateUrl: './drivers.html',
  styleUrl: '../masters/masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class Drivers implements OnInit {
  private readonly http = inject(HttpClient);

  // --- All Drivers Repository ---
  readonly allDrivers = signal<Driver[]>([]);

  // --- Search, Filter, Sort & Pagination Signals ---
  readonly searchQuery = signal<string>('');
  readonly statusFilter = signal<string>('all');
  readonly sortKey = signal<string>('firstName');
  readonly sortDir = signal<'asc' | 'desc' | ''>('asc');
  readonly page = signal<number>(1);
  readonly pageSize = signal<number>(10);

  // --- View Switcher (Page vs Form) & Tab Controls ---
  readonly showAddForm = signal<boolean>(false);
  readonly activeFormTab = signal<number>(0);
  readonly editingDriverId = signal<number | null>(null);

  // --- Form Input Signals (Tab 1: Personal) ---
  readonly inputFirstName = signal<string>('');
  readonly inputLastName = signal<string>('');
  readonly inputFatherName = signal<string>('');
  readonly inputMotherName = signal<string>('');
  readonly inputEmail = signal<string>('');
  readonly inputPhone = signal<string>('');
  readonly inputEmergencyNumber = signal<string>('');
  readonly inputDob = signal<string>('');
  readonly inputMaritalStatus = signal<string>('Unmarried');
  readonly inputGender = signal<string>('Male');
  readonly inputPassportNumber = signal<string>('');
  readonly inputReligion = signal<string>('Hindu');
  readonly inputColor = signal<string>('Light Skin');
  readonly inputLanguage = signal<string>('Hindi');
  readonly inputCountry = signal<string>('India');
  readonly inputState = signal<string>('');
  readonly inputPincode = signal<string>('');
  readonly inputAddress = signal<string>('');
  readonly inputDriverType = signal<string>('Personal driver');
  readonly inputStatus = signal<string>('Non-Verified');
  readonly inputSourceType = signal<string>('WalkIn');
  readonly inputVehicle = signal<string>('Personal Sedan');

  // --- Form Input Signals (Tab 2: Education & Health) ---
  readonly inputAge = signal<string>('');
  readonly inputHeight = signal<string>('');
  readonly inputWeight = signal<string>('');
  readonly inputEducation = signal<string>('No Formal Education');
  readonly inputTrainingStatus = signal<string>('No');
  readonly inputTrainingCertificate = signal<string>('');
  readonly inputEyeVision = signal<string>('Normal Vision');
  readonly inputHealthInsurance = signal<string>('No');
  readonly inputBloodGroup = signal<string>('O+');

  // --- Form Input Signals (Tab 3: Documents) ---
  readonly inputLicenseDetails = signal<string>('LMV');
  readonly inputVehicleType = signal<string>('SEDAN');
  readonly inputDlNo = signal<string>('');
  readonly inputDlIssueDate = signal<string>('');
  readonly inputDlExpiryDate = signal<string>('');
  readonly inputPoliceVerifiedStatus = signal<string>('No');
  readonly inputPoliceVerifiedNo = signal<string>('');
  readonly inputPoliceVerifiedUpload = signal<string>('');
  readonly inputJobType = signal<string>('Full time');
  readonly inputExperience = signal<string>('1 Year');
  readonly inputCurrentSalary = signal<string>('');
  readonly inputExpectedSalary = signal<string>('10000-15000');
  readonly inputDocumentCategory = signal<string>('Driving License');
  readonly inputDocumentUpload = signal<string>('');

  // --- Form Input Signals (Tab 4: Payments) ---
  readonly inputPreferredPaymentMode = signal<string>('Cash');
  readonly inputAmount = signal<string>('');
  readonly inputPaymentReceiptDate = signal<string>('');
  readonly inputBankName = signal<string>('');
  readonly inputBankAccountNo = signal<string>('');
  readonly inputIfscCode = signal<string>('');
  readonly inputBranchName = signal<string>('');
  readonly inputUpiIdOrChequeNo = signal<string>('');

  // --- Dynamic Document Lists ---
  readonly personalDocs = signal<Array<{ type: string; regNo: string; file: string }>>([
    { type: 'Aadhaar / National ID', regNo: '', file: '' }
  ]);
  readonly healthDocs = signal<Array<{ type: string; regNo: string; file: string }>>([
    { type: 'Select Document Type', regNo: '', file: '' }
  ]);
  readonly educationDocs = signal<Array<{ type: string; regNo: string; file: string }>>([
    { type: '', regNo: '', file: '' }
  ]);
  readonly policeDocs = signal<Array<{ type: string; regNo: string; file: string }>>([
    { type: 'Select Document Type', regNo: '', file: '' }
  ]);
  // --- Personal Detail Master Options ---
  readonly sourceTypes = signal<string[]>(['WalkIn', 'Website', 'Referral']);
  readonly maritalStatuses = signal<string[]>(['Unmarried', 'Married', 'Divorced', 'Widowed']);
  readonly genders = signal<string[]>(['Male', 'Female', 'Other']);
  readonly religions = signal<string[]>(['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Parsi', 'Other']);
  readonly colors = signal<string[]>(['Light Skin', 'Dark Skin']);
  readonly languages = signal<string[]>(['Hindi', 'English', 'Bhojpuri', 'Other']);

  // --- Education Master Options ---
  readonly educationLevels = signal<string[]>(['No Formal Education', 'Primary School (Class 1–5)', 'Secondary School (Class 6–10)', 'Higher Secondary (Class 11–12)', 'Diploma / Certification Course', "Bachelor's Degree", "Master's Degree", 'Doctorate / PhD']);
  readonly trainingStatuses = signal<string[]>(['Yes', 'No']);

  // --- Health Master Options ---
  readonly eyeVisions = signal<string[]>(['Normal Vision', 'Wear Glasses', 'Color Blind']);
  readonly bloodGroups = signal<string[]>(['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']);
  readonly healthInsurances = signal<string[]>(['Yes', 'No']);

  // --- Document Category Options ---
  readonly personalDocTypes = signal<string[]>(['Aadhaar / National ID', 'Passport', 'PAN Card', 'Driving License', 'Voter ID']);
  readonly healthDocTypes = signal<string[]>(['Eye Vision Test', 'Medical Fitness Certificate', 'Health Insurance Policy', 'Vaccine Certificate']);
  readonly policeDocTypes = signal<string[]>(['Address Proof', 'Police Clearance Certificate (PCC)', 'Character Verification Form']);

  // --- Payment Master Options ---
  readonly paymentModes = signal<string[]>(['Cash', 'Cheque', 'NEFT', 'RTGS', 'Online']);

  protected readonly content = signal({
    title: 'Driver Registry',
    subtitle: 'Manage and view registered drivers (Loaded dynamically from static JSON data).',
    cardTitle: 'Add New Driver',
    btnRegister: 'Save Lead',
    errorEmptyFields: 'First Name, Email, and Phone are required.'
  });

  // --- Table Configuration JSON Strings ---
  readonly tableColumns = JSON.stringify([
    { key: 'avatar', label: 'Image', type: 'image' },
    { key: 'firstName', label: 'First Name', sortable: true },
    { key: 'lastName', label: 'Last Name', sortable: true },
    { key: 'email', label: 'Email', sortable: true },
    { key: 'phone', label: 'Phone', sortable: true },
    { key: 'driverType', label: 'Driver Type', sortable: true },
    { key: 'status', label: 'Status', type: 'status', statusMap: { 
        'Verified': 'success', 
        'Partially Verified (P)': 'info', 
        'Partially Verified (K)': 'info', 
        'Non-Verified': 'warning', 
        'Blacklisted': 'error', 
        'Closed': 'error', 
        'Not Useful': 'error' 
      } 
    },
    { key: 'fatherName', label: 'Father Name', sortable: true, hidden: true },
    { key: 'motherName', label: 'Mother Name', sortable: true, hidden: true },
    { key: 'emergencyNumber', label: 'Emergency No', sortable: false, hidden: true },
    { key: 'dob', label: 'DOB', sortable: true, hidden: true },
    { key: 'maritalStatus', label: 'Marital Status', sortable: true, hidden: true },
    { key: 'gender', label: 'Gender', sortable: true, hidden: true },
    { key: 'passportNumber', label: 'Passport No', sortable: true, hidden: true },
    { key: 'religion', label: 'Religion', sortable: true, hidden: true },
    { key: 'color', label: 'Color', sortable: true, hidden: true },
    { key: 'language', label: 'Language', sortable: true, hidden: true },
    { key: 'age', label: 'Age', sortable: true, hidden: true },
    { key: 'height', label: 'Height', sortable: true, hidden: true },
    { key: 'weight', label: 'Weight', sortable: true, hidden: true },
    { key: 'country', label: 'Country', sortable: true, hidden: true },
    { key: 'state', label: 'State', sortable: true, hidden: true },
    { key: 'pincode', label: 'Pincode', sortable: true, hidden: true },
    { key: 'address', label: 'Address', sortable: false, hidden: true },
    { key: 'vehicle', label: 'Vehicle Name', sortable: true, hidden: true },
    { key: 'education', label: 'Education', sortable: true, hidden: true },
    { key: 'trainingStatus', label: 'Training Status', sortable: true, hidden: true },
    { key: 'trainingCertificate', label: 'Training Cert', sortable: false, hidden: true },
    { key: 'eyeVision', label: 'Eye Vision', sortable: true, hidden: true },
    { key: 'healthInsurance', label: 'Health Ins', sortable: true, hidden: true },
    { key: 'bloodGroup', label: 'Blood Group', sortable: true, hidden: true },
    { key: 'licenseDetails', label: 'License Details', sortable: true, hidden: true },
    { key: 'vehicleType', label: 'Vehicle Type', sortable: true, hidden: true },
    { key: 'dlNo', label: 'Driving License No', sortable: true, hidden: true },
    { key: 'dlIssueDate', label: 'DL Issue Date', sortable: true, hidden: true },
    { key: 'dlExpiryDate', label: 'DL Expired Date', sortable: true, hidden: true },
    { key: 'policeVerifiedStatus', label: 'Police Verified', sortable: true, hidden: true },
    { key: 'policeVerifiedNo', label: 'Police Verified No', sortable: true, hidden: true },
    { key: 'jobType', label: 'Job Type', sortable: true, hidden: true },
    { key: 'experience', label: 'Experience', sortable: true, hidden: true },
    { key: 'currentSalary', label: 'Current Salary', sortable: true, hidden: true },
    { key: 'expectedSalary', label: 'Expected Salary', sortable: true, hidden: true },
    { key: 'preferredPaymentMode', label: 'Payment Mode', sortable: true, hidden: true },
    { key: 'amount', label: 'Payment Amount', sortable: true, hidden: true },
    { key: 'bankName', label: 'Bank Name', sortable: true, hidden: true },
    { key: 'bankAccountNo', label: 'Bank Account No', sortable: false, hidden: true },
    { key: 'ifscCode', label: 'IFSC Code', sortable: false, hidden: true },
    { key: 'upiIdOrChequeNo', label: 'UPI / Cheque', sortable: false, hidden: true }
  ]);

  readonly tableFilterOptions = JSON.stringify([
    { value: 'all', label: 'All Statuses' },
    { value: 'Verified', label: 'Verified' },
    { value: 'Partially Verified (P)', label: 'Partially Verified (P)' },
    { value: 'Partially Verified (K)', label: 'Partially Verified (K)' },
    { value: 'Non-Verified', label: 'Non-Verified' },
    { value: 'Blacklisted', label: 'Blacklisted' },
    { value: 'Closed', label: 'Closed' },
    { value: 'Not Useful', label: 'Not Useful' }
  ]);

  readonly tableActions = JSON.stringify([
    { icon: 'visibility', label: 'View Details', event: '__view_detail__' },
    { icon: 'edit', label: 'Edit', event: 'edit_driver' },
    { icon: 'delete', label: 'Delete', event: 'delete_driver', variant: 'danger' }
  ]);

  // --- Processed and Filtered Dataset ---
  readonly processedDrivers = computed(() => {
    let list = this.allDrivers().map(d => {
      const parts = d.name.split(' ');
      const firstName = d.firstName || parts[0] || '';
      const lastName = d.lastName || parts.slice(1).join(' ') || '';
      const email = d.email || `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/\s/g, '') || 'driver'}@meradriver.com`;
      
      const indianAvatars = [
        'https://images.unsplash.com/photo-1607990283143-e81e7a2c93ab?auto=format&fit=crop&q=80&w=150&h=150', // Indian man
        'https://images.unsplash.com/photo-1581391528803-54be77ce23e3?auto=format&fit=crop&q=80&w=150&h=150', // Indian man with turban/beard
        'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=150&h=150', // Smiling man
        'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&q=80&w=150&h=150', // Clean portrait
        'https://images.unsplash.com/photo-1619380061814-58f03707f082?auto=format&fit=crop&q=80&w=150&h=150', // Indian woman smiling
        'https://images.unsplash.com/photo-1624561172888-ac93c696e10c?auto=format&fit=crop&q=80&w=150&h=150', // Professional headshot
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150&h=150', // Smiling man
        'https://images.unsplash.com/photo-1562572159-4ebcd318f4dd?auto=format&fit=crop&q=80&w=150&h=150'  // Young woman portrait
      ];
      const avatarIdx = (d.id || 1) % indianAvatars.length;
      const avatar = (d.avatar && !d.avatar.includes('pravatar')) 
        ? d.avatar 
        : indianAvatars[avatarIdx];
      
      const driverType = d.driverType || (d.id && d.id % 4 === 0 ? 'Car Driver' : (d.id && d.id % 3 === 0 ? 'Ambulance Driver' : 'Personal driver'));
      const status = d.status || (d.id && d.id % 7 === 0 ? 'Blacklisted' : (d.id && d.id % 5 === 0 ? 'Non-Verified' : 'Verified'));
      const sourceType = d.sourceType || 'Website';

      return {
        fatherName: d.fatherName || `${firstName} Lal`,
        motherName: d.motherName || `${firstName} Devi`,
        emergencyNumber: d.emergencyNumber || '9999988888',
        dob: d.dob || '1992-06-15',
        maritalStatus: d.maritalStatus || 'Unmarried',
        gender: d.gender || 'Male',
        passportNumber: d.passportNumber || 'P9876543',
        religion: d.religion || 'Hindu',
        color: d.color || 'Light Skin',
        language: d.language || 'Hindi',
        age: d.age || '32',
        height: d.height || '5.7',
        weight: d.weight || '68',
        country: d.country || 'India',
        state: d.state || 'Delhi',
        pincode: d.pincode || '110001',
        address: d.address || 'Connaught Place, New Delhi',
        education: d.education || 'No Formal Education',
        trainingStatus: d.trainingStatus || 'No',
        trainingCertificate: d.trainingCertificate || 'None',
        eyeVision: d.eyeVision || 'Normal Vision',
        healthInsurance: d.healthInsurance || 'No',
        bloodGroup: d.bloodGroup || 'O+',
        licenseDetails: d.licenseDetails || 'LMV',
        vehicleType: d.vehicleType || 'SEDAN',
        dlNo: d.dlNo || 'DL-987654321',
        dlIssueDate: d.dlIssueDate || '2018-10-12',
        dlExpiryDate: d.dlExpiryDate || '2038-10-11',
        policeVerifiedStatus: d.policeVerifiedStatus || 'Yes',
        policeVerifiedNo: d.policeVerifiedNo || 'POL-99238',
        policeVerifiedUpload: d.policeVerifiedUpload || 'Police_Clearance.pdf',
        jobType: d.jobType || 'Full time',
        experience: d.experience || '3 Year',
        currentSalary: d.currentSalary || '15000',
        expectedSalary: d.expectedSalary || '18000',
        documentCategory: d.documentCategory || 'Driving License',
        documentUpload: d.documentUpload || 'Driving_License_Copy.jpg',
        preferredPaymentMode: d.preferredPaymentMode || 'Online',
        amount: d.amount || '0',
        paymentReceiptDate: d.paymentReceiptDate || '2026-08-11',
        bankName: d.bankName || 'State Bank of India',
        bankAccountNo: d.bankAccountNo || '332211009988',
        ifscCode: d.ifscCode || 'SBIN0001234',
        branchName: d.branchName || 'Connaught Place Branch',
        upiIdOrChequeNo: d.upiIdOrChequeNo || 'driver@okaxis',
        ...d,
        firstName,
        lastName,
        email,
        avatar,
        driverType,
        status,
        sourceType
      };
    });

    // 1. Search Query Filter
    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      list = list.filter(d =>
        d.firstName.toLowerCase().includes(query) ||
        d.lastName.toLowerCase().includes(query) ||
        d.email.toLowerCase().includes(query) ||
        d.phone.includes(query) ||
        (d.driverType && d.driverType.toLowerCase().includes(query)) ||
        (d.state && d.state.toLowerCase().includes(query))
      );
    }

    // 2. Dropdown Status Filter
    const filter = this.statusFilter();
    if (filter !== 'all') {
      list = list.filter(d => d.status === filter);
    }

    // 3. Columns Sort
    const key = this.sortKey();
    const dir = this.sortDir();
    if (key && dir) {
      list = [...list].sort((a: any, b: any) => {
        const valA = String(a[key] ?? '').toLowerCase();
        const valB = String(b[key] ?? '').toLowerCase();
        return dir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      });
    }

    return list;
  });

  // --- Paginated Rows to Pass to sky-data-table ---
  readonly tableRowsString = computed(() => {
    const list = this.processedDrivers();
    const start = (this.page() - 1) * this.pageSize();
    const paginated = list.slice(start, start + this.pageSize());
    return JSON.stringify(paginated);
  });

  readonly totalDrivers = computed(() => this.processedDrivers().length);

  ngOnInit(): void {
    // Load copy strings dynamically
    this.http.get<any>('data/drivers-registry.json').subscribe({
      next: (data) => {
        if (data) {
          this.content.set({
            ...this.content(),
            ...data
          });
        }
      },
      error: (err) => {
        console.error('Failed to load drivers registry copy from drivers-registry.json, using defaults', err);
      }
    });

    // Load static data from the JSON file inside public/data directory
    this.http.get<Driver[]>('data/drivers.json').subscribe({
      next: (data) => {
        this.allDrivers.set(data || []);
      },
      error: (err) => {
        console.error('Failed to load mock drivers JSON', err);
      }
    });
  }

  // --- Add New Driver Action ---
  addDriver(): void {
    const firstName = this.inputFirstName().trim();
    const lastName = this.inputLastName().trim();
    const phone = this.inputPhone().trim();
    const email = this.inputEmail().trim();

    if (!firstName || !phone || !email) {
      alert(this.content().errorEmptyFields);
      return;
    }

    const newDriver: Driver = {
      id: Date.now(),
      name: `${firstName} ${lastName}`.trim(),
      firstName,
      lastName,
      phone,
      email,
      fatherName: this.inputFatherName().trim(),
      motherName: this.inputMotherName().trim(),
      emergencyNumber: this.inputEmergencyNumber().trim(),
      dob: this.inputDob(),
      maritalStatus: this.inputMaritalStatus(),
      gender: this.inputGender(),
      passportNumber: this.inputPassportNumber().trim(),
      religion: this.inputReligion(),
      color: this.inputColor(),
      language: this.inputLanguage(),
      age: this.inputAge().trim(),
      height: this.inputHeight().trim(),
      weight: this.inputWeight().trim(),
      country: this.inputCountry(),
      state: this.inputState().trim(),
      pincode: this.inputPincode().trim(),
      address: this.inputAddress().trim(),
      driverType: this.inputDriverType(),
      status: this.inputStatus(),
      sourceType: this.inputSourceType(),
      vehicle: this.inputVehicle().trim(),
      avatar: `https://i.pravatar.cc/100?img=${Date.now() % 70}`,
      education: this.inputEducation(),
      trainingStatus: this.inputTrainingStatus(),
      trainingCertificate: this.inputTrainingCertificate().trim(),
      eyeVision: this.inputEyeVision(),
      healthInsurance: this.inputHealthInsurance(),
      bloodGroup: this.inputBloodGroup(),
      // --- Document Details ---
      licenseDetails: this.inputLicenseDetails(),
      vehicleType: this.inputVehicleType(),
      dlNo: this.inputDlNo().trim(),
      dlIssueDate: this.inputDlIssueDate(),
      dlExpiryDate: this.inputDlExpiryDate(),
      policeVerifiedStatus: this.inputPoliceVerifiedStatus(),
      policeVerifiedNo: this.inputPoliceVerifiedNo().trim(),
      policeVerifiedUpload: this.inputPoliceVerifiedUpload().trim(),
      jobType: this.inputJobType(),
      experience: this.inputExperience(),
      currentSalary: this.inputCurrentSalary().trim(),
      expectedSalary: this.inputExpectedSalary(),
      documentCategory: this.inputDocumentCategory(),
      documentUpload: this.inputDocumentUpload().trim(),
      // --- Payment Details ---
      preferredPaymentMode: this.inputPreferredPaymentMode(),
      amount: this.inputAmount().trim(),
      paymentReceiptDate: this.inputPaymentReceiptDate(),
      bankName: this.inputBankName().trim(),
      bankAccountNo: this.inputBankAccountNo().trim(),
      ifscCode: this.inputIfscCode().trim(),
      branchName: this.inputBranchName().trim(),
      upiIdOrChequeNo: this.inputUpiIdOrChequeNo().trim(),
      personalDocs: this.personalDocs(),
      healthDocs: this.healthDocs(),
      educationDocs: this.educationDocs(),
      policeDocs: this.policeDocs()
    };

    const editingId = this.editingDriverId();
    if (editingId !== null) {
      // Edit mode: update existing driver while preserving original values like id and avatar
      const originalDriver = this.allDrivers().find(d => d.id === editingId);
      const updatedDriver: Driver = {
        ...newDriver,
        id: editingId,
        avatar: originalDriver?.avatar || newDriver.avatar
      };
      this.allDrivers.update(list => list.map(d => d.id === editingId ? updatedDriver : d));
    } else {
      // Create mode
      this.allDrivers.update((list) => [newDriver, ...list]);
    }

    // Reset inputs and close form view
    this.resetForm();
    this.showAddForm.set(false);
  }

  // --- Document List Actions ---
  addPersonalDoc(): void {
    this.personalDocs.update(docs => [...docs, { type: 'Aadhaar / National ID', regNo: '', file: '' }]);
  }
  deletePersonalDoc(idx: number): void {
    this.personalDocs.update(docs => docs.filter((_, i) => i !== idx));
  }

  addHealthDoc(): void {
    this.healthDocs.update(docs => [...docs, { type: 'Select Document Type', regNo: '', file: '' }]);
  }
  deleteHealthDoc(idx: number): void {
    this.healthDocs.update(docs => docs.filter((_, i) => i !== idx));
  }

  addEducationDoc(): void {
    this.educationDocs.update(docs => [...docs, { type: '', regNo: '', file: '' }]);
  }
  deleteEducationDoc(idx: number): void {
    this.educationDocs.update(docs => docs.filter((_, i) => i !== idx));
  }

  addPoliceDoc(): void {
    this.policeDocs.update(docs => [...docs, { type: 'Select Document Type', regNo: '', file: '' }]);
  }
  deletePoliceDoc(idx: number): void {
    this.policeDocs.update(docs => docs.filter((_, i) => i !== idx));
  }

  onDocChange(category: 'personal' | 'health' | 'education' | 'police', idx: number, field: 'type' | 'regNo' | 'file', event: Event): void {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const val = target.value;
    if (category === 'personal') {
      this.personalDocs.update(docs => docs.map((doc, i) => i === idx ? { ...doc, [field]: val } : doc));
    } else if (category === 'health') {
      this.healthDocs.update(docs => docs.map((doc, i) => i === idx ? { ...doc, [field]: val } : doc));
    } else if (category === 'education') {
      this.educationDocs.update(docs => docs.map((doc, i) => i === idx ? { ...doc, [field]: val } : doc));
    } else if (category === 'police') {
      this.policeDocs.update(docs => docs.map((doc, i) => i === idx ? { ...doc, [field]: val } : doc));
    }
  }

  onDocFileChange(category: 'personal' | 'health' | 'education' | 'police', idx: number, event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    const val = file ? file.name : '';
    if (category === 'personal') {
      this.personalDocs.update(docs => docs.map((doc, i) => i === idx ? { ...doc, file: val } : doc));
    } else if (category === 'health') {
      this.healthDocs.update(docs => docs.map((doc, i) => i === idx ? { ...doc, file: val } : doc));
    } else if (category === 'education') {
      this.educationDocs.update(docs => docs.map((doc, i) => i === idx ? { ...doc, file: val } : doc));
    } else if (category === 'police') {
      this.policeDocs.update(docs => docs.map((doc, i) => i === idx ? { ...doc, file: val } : doc));
    }
  }

  resetForm(): void {
    this.editingDriverId.set(null);
    this.inputFirstName.set('');
    this.inputLastName.set('');
    this.inputFatherName.set('');
    this.inputMotherName.set('');
    this.inputEmail.set('');
    this.inputPhone.set('');
    this.inputEmergencyNumber.set('');
    this.inputDob.set('');
    this.inputMaritalStatus.set('Unmarried');
    this.inputGender.set('Male');
    this.inputPassportNumber.set('');
    this.inputReligion.set('Hindu');
    this.inputColor.set('Light Skin');
    this.inputLanguage.set('Hindi');
    this.inputAge.set('');
    this.inputHeight.set('');
    this.inputWeight.set('');
    this.inputCountry.set('India');
    this.inputState.set('');
    this.inputPincode.set('');
    this.inputAddress.set('');
    this.inputDriverType.set('Personal driver');
    this.inputStatus.set('Non-Verified');
    this.inputSourceType.set('WalkIn');
    this.inputVehicle.set('Personal Sedan');
    this.inputEducation.set('No Formal Education');
    this.inputTrainingStatus.set('No');
    this.inputTrainingCertificate.set('');
    this.inputEyeVision.set('Normal Vision');
    this.inputHealthInsurance.set('No');
    this.inputBloodGroup.set('O+');
    // --- Revert Document Inputs ---
    this.inputLicenseDetails.set('LMV');
    this.inputVehicleType.set('SEDAN');
    this.inputDlNo.set('');
    this.inputDlIssueDate.set('');
    this.inputDlExpiryDate.set('');
    this.inputPoliceVerifiedStatus.set('No');
    this.inputPoliceVerifiedNo.set('');
    this.inputPoliceVerifiedUpload.set('');
    this.inputJobType.set('Full time');
    this.inputExperience.set('1 Year');
    this.inputCurrentSalary.set('');
    this.inputExpectedSalary.set('10000-15000');
    this.inputDocumentCategory.set('Driving License');
    this.inputDocumentUpload.set('');
    // --- Revert Payment Inputs ---
    this.inputPreferredPaymentMode.set('Cash');
    this.inputAmount.set('');
    this.inputPaymentReceiptDate.set('');
    this.inputBankName.set('');
    this.inputBankAccountNo.set('');
    this.inputIfscCode.set('');
    this.inputBranchName.set('');
    this.inputUpiIdOrChequeNo.set('');
    this.personalDocs.set([{ type: 'Aadhaar / National ID', regNo: '', file: '' }]);
    this.healthDocs.set([{ type: 'Select Document Type', regNo: '', file: '' }]);
    this.educationDocs.set([{ type: '', regNo: '', file: '' }]);
    this.policeDocs.set([{ type: 'Select Document Type', regNo: '', file: '' }]);
    this.activeFormTab.set(0);
  }

  // --- DataTable Event Observers ---
  onParamsChange(event: Event): void {
    const detail = (event as CustomEvent).detail;
    this.page.set(detail.page);
    this.pageSize.set(detail.pageSize);
    this.sortKey.set(detail.sortKey);
    this.sortDir.set(detail.sortDir);
    this.searchQuery.set(detail.search);
    this.statusFilter.set(detail.filter || 'all');
  }

  onRowSelect(event: Event): void {
    const detail = (event as CustomEvent).detail;
    console.log('Selected Drivers:', detail.selected);
  }

  onRowAction(event: Event): void {
    const detail = (event as CustomEvent).detail;
    const action = detail.action;
    const row = detail.row;

    if (action === 'edit_driver') {
      this.editingDriverId.set(row.id);
      
      // Populate form signals
      this.inputFirstName.set(row.firstName || '');
      this.inputLastName.set(row.lastName || '');
      this.inputFatherName.set(row.fatherName || '');
      this.inputMotherName.set(row.motherName || '');
      this.inputEmail.set(row.email || '');
      this.inputPhone.set(row.phone || '');
      this.inputEmergencyNumber.set(row.emergencyNumber || '');
      this.inputDob.set(row.dob || '');
      this.inputMaritalStatus.set(row.maritalStatus || 'Unmarried');
      this.inputGender.set(row.gender || 'Male');
      this.inputPassportNumber.set(row.passportNumber || '');
      this.inputReligion.set(row.religion || 'Hindu');
      this.inputColor.set(row.color || 'Light Skin');
      this.inputLanguage.set(row.language || 'Hindi');
      this.inputAge.set(row.age || '');
      this.inputHeight.set(row.height || '');
      this.inputWeight.set(row.weight || '');
      this.inputCountry.set(row.country || 'India');
      this.inputState.set(row.state || '');
      this.inputPincode.set(row.pincode || '');
      this.inputAddress.set(row.address || '');
      this.inputDriverType.set(row.driverType || 'Personal driver');
      this.inputStatus.set(row.status || 'Non-Verified');
      this.inputSourceType.set(row.sourceType || 'WalkIn');
      this.inputVehicle.set(row.vehicle || 'Personal Sedan');
      this.inputEducation.set(row.education || 'No Formal Education');
      this.inputTrainingStatus.set(row.trainingStatus || 'No');
      this.inputTrainingCertificate.set(row.trainingCertificate || '');
      this.inputEyeVision.set(row.eyeVision || 'Normal Vision');
      this.inputHealthInsurance.set(row.healthInsurance || 'No');
      this.inputBloodGroup.set(row.bloodGroup || 'O+');
      this.inputLicenseDetails.set(row.licenseDetails || 'LMV');
      this.inputVehicleType.set(row.vehicleType || 'SEDAN');
      this.inputDlNo.set(row.dlNo || '');
      this.inputDlIssueDate.set(row.dlIssueDate || '');
      this.inputDlExpiryDate.set(row.dlExpiryDate || '');
      this.inputPoliceVerifiedStatus.set(row.policeVerifiedStatus || 'No');
      this.inputPoliceVerifiedNo.set(row.policeVerifiedNo || '');
      this.inputPoliceVerifiedUpload.set(row.policeVerifiedUpload || '');
      this.inputJobType.set(row.jobType || 'Full time');
      this.inputExperience.set(row.experience || '1 Year');
      this.inputCurrentSalary.set(row.currentSalary || '');
      this.inputExpectedSalary.set(row.expectedSalary || '10000-15000');
      this.inputDocumentCategory.set(row.documentCategory || 'Driving License');
      this.inputDocumentUpload.set(row.documentUpload || '');
      this.inputPreferredPaymentMode.set(row.preferredPaymentMode || 'Cash');
      this.inputAmount.set(row.amount || '');
      this.inputPaymentReceiptDate.set(row.paymentReceiptDate || '');
      this.inputBankName.set(row.bankName || '');
      this.inputBankAccountNo.set(row.bankAccountNo || '');
      this.inputIfscCode.set(row.ifscCode || '');
      this.inputBranchName.set(row.branchName || '');
      this.inputUpiIdOrChequeNo.set(row.upiIdOrChequeNo || '');
      this.personalDocs.set(row.personalDocs || [{ type: 'Aadhaar / National ID', regNo: '', file: '' }]);
      this.healthDocs.set(row.healthDocs || [{ type: 'Select Document Type', regNo: '', file: '' }]);
      this.educationDocs.set(row.educationDocs || [{ type: '', regNo: '', file: '' }]);
      this.policeDocs.set(row.policeDocs || [{ type: 'Select Document Type', regNo: '', file: '' }]);

      this.activeFormTab.set(0);
      this.showAddForm.set(true);
    } else if (action === 'delete_driver') {
      if (confirm(`Are you sure you want to delete lead "${row.firstName} ${row.lastName}"?`)) {
        this.allDrivers.update(list => list.filter(d => d.id !== row.id));
      }
    }
  }

  // --- View Control Events ---
  openAddDriverForm(): void {
    this.showAddForm.set(true);
    this.activeFormTab.set(0);
  }

  closeAddDriverForm(): void {
    this.showAddForm.set(false);
    this.resetForm();
  }

  onFormTabChange(event: Event): void {
    const index = (event.target as HTMLElement & { activeTabIndex: number }).activeTabIndex;
    this.activeFormTab.set(index);
  }

  // --- Input Handlers ---
  onInputChange(field: string, event: Event): void {
    const val = (event.target as any).value || '';
    switch(field) {
      case 'firstName': this.inputFirstName.set(val); break;
      case 'lastName': this.inputLastName.set(val); break;
      case 'fatherName': this.inputFatherName.set(val); break;
      case 'motherName': this.inputMotherName.set(val); break;
      case 'email': this.inputEmail.set(val); break;
      case 'phone': this.inputPhone.set(val); break;
      case 'emergencyNumber': this.inputEmergencyNumber.set(val); break;
      case 'dob': this.inputDob.set(val); break;
      case 'maritalStatus': this.inputMaritalStatus.set(val); break;
      case 'gender': this.inputGender.set(val); break;
      case 'passportNumber': this.inputPassportNumber.set(val); break;
      case 'religion': this.inputReligion.set(val); break;
      case 'color': this.inputColor.set(val); break;
      case 'language': this.inputLanguage.set(val); break;
      case 'age': this.inputAge.set(val); break;
      case 'height': this.inputHeight.set(val); break;
      case 'weight': this.inputWeight.set(val); break;
      case 'country': this.inputCountry.set(val); break;
      case 'state': this.inputState.set(val); break;
      case 'pincode': this.inputPincode.set(val); break;
      case 'address': this.inputAddress.set(val); break;
      case 'driverType': this.inputDriverType.set(val); break;
      case 'status': this.inputStatus.set(val); break;
      case 'sourceType': this.inputSourceType.set(val); break;
      case 'vehicle': this.inputVehicle.set(val); break;
      case 'education': this.inputEducation.set(val); break;
      case 'trainingStatus': this.inputTrainingStatus.set(val); break;
      case 'trainingCertificate': this.inputTrainingCertificate.set(val); break;
      case 'eyeVision': this.inputEyeVision.set(val); break;
      case 'healthInsurance': this.inputHealthInsurance.set(val); break;
      case 'bloodGroup': this.inputBloodGroup.set(val); break;
      // --- Document details ---
      case 'licenseDetails': this.inputLicenseDetails.set(val); break;
      case 'vehicleType': this.inputVehicleType.set(val); break;
      case 'dlNo': this.inputDlNo.set(val); break;
      case 'dlIssueDate': this.inputDlIssueDate.set(val); break;
      case 'dlExpiryDate': this.inputDlExpiryDate.set(val); break;
      case 'policeVerifiedStatus': this.inputPoliceVerifiedStatus.set(val); break;
      case 'policeVerifiedNo': this.inputPoliceVerifiedNo.set(val); break;
      case 'policeVerifiedUpload': this.inputPoliceVerifiedUpload.set(val); break;
      case 'jobType': this.inputJobType.set(val); break;
      case 'experience': this.inputExperience.set(val); break;
      case 'currentSalary': this.inputCurrentSalary.set(val); break;
      case 'expectedSalary': this.inputExpectedSalary.set(val); break;
      case 'documentCategory': this.inputDocumentCategory.set(val); break;
      case 'documentUpload': this.inputDocumentUpload.set(val); break;
      // --- Payment details ---
      case 'preferredPaymentMode': this.inputPreferredPaymentMode.set(val); break;
      case 'amount': this.inputAmount.set(val); break;
      case 'paymentReceiptDate': this.inputPaymentReceiptDate.set(val); break;
      case 'bankName': this.inputBankName.set(val); break;
      case 'bankAccountNo': this.inputBankAccountNo.set(val); break;
      case 'ifscCode': this.inputIfscCode.set(val); break;
      case 'branchName': this.inputBranchName.set(val); break;
      case 'upiIdOrChequeNo': this.inputUpiIdOrChequeNo.set(val); break;
    }
  }
}
