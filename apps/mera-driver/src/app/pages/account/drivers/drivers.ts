import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, inject, OnInit, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AdminPage } from '../../../admin/admin-page/admin-page';
import { DriversApiService, type Driver } from '../../../core/drivers/drivers-api.service';
import { RbacApiService } from '../../../core/rbac/rbac-api.service';
import { buildResumeHtml, buildResumeSections, type ResumeSection } from './driver-resume';

/** The 4 tabs are the onboarding wizard's persistence checkpoints — sub-section chip
 *  navigation within a tab is a pure UI concern and never itself hits the backend. */
const TOTAL_ONBOARDING_STEPS = 4;
// Sub-section counts for tabs 0-3, matching the actual number of `@if (activeSubSection() === N)`
// branches (and chips) rendered per tab in drivers.html — NOT the previous [4,2,6,3], which
// overcounted tabs 2 and 3 and made "Save & Next" walk through blank, content-less
// sub-sections before a tab was actually considered finished.
const MAX_SUBS = [4, 2, 3, 1];

/** Driver List progress display — e.g. "In Progress — Step 2 of 4 (25%)" / "Completed — 100%".
 *  A driver with no onboarding data at all (shouldn't happen post-migration, but defensively)
 *  reads as completed rather than a confusing "Step undefined of 4". */
function onboardingLabel(d: Driver): string {
  if (d.onboardingStatus === 'in_progress') {
    const step = Math.min(Math.max(d.currentStep ?? 1, 1), TOTAL_ONBOARDING_STEPS);
    return `In Progress — Step ${step} of ${TOTAL_ONBOARDING_STEPS} (${d.completionPercentage ?? 0}%)`;
  }
  return 'Completed — 100%';
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
  private readonly api = inject(DriversApiService);
  private readonly rbac = inject(RbacApiService);

  // --- All Drivers Repository ---
  readonly allDrivers = signal<Driver[]>([]);
  readonly loading = signal<boolean>(false);

  // --- Driver <-> User account linking (grants/revokes self-service portal access) ---
  readonly linkPanelDriver = signal<Driver | null>(null);
  readonly linkUsers = signal<{ id: string; name: string; phone?: string; email?: string }[]>([]);
  readonly linkSelectedUserId = signal<string>('');
  readonly linkSaving = signal<boolean>(false);
  readonly linkError = signal<string | null>(null);

  // --- Read-only Driver Resume/Profile Preview ---
  readonly previewDriver = signal<Driver | null>(null);
  readonly previewSections = computed<ResumeSection[]>(() => {
    const d = this.previewDriver();
    return d ? buildResumeSections(d) : [];
  });

  openPreview(driver: Driver): void {
    this.previewDriver.set(driver);
  }

  closePreview(): void {
    this.previewDriver.set(null);
  }

  /** Browser-native print-to-PDF — no new PDF library. Opens the resume in its own
   *  window with print-only styling (not the admin console chrome) and invokes print(),
   *  which every major browser can save as a PDF from its destination picker. */
  downloadPdf(driver: Driver): void {
    const html = buildResumeHtml(driver);
    const win = window.open('', '_blank', 'width=850,height=1100');
    if (!win) {
      alert('Please allow pop-ups for this site to download the PDF.');
      return;
    }
    win.document.write(html);
    win.document.close();
    win.onload = () => {
      win.focus();
      win.print();
    };
  }

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
  readonly activeSubSection = signal<number>(0);
  readonly editingDriverId = signal<string | null>(null);

  // --- Step-by-step persistence (onboarding wizard) ---
  readonly savingStep = signal<boolean>(false);
  readonly stepError = signal<string | null>(null);

  // --- Form Validation Signals & Helpers ---
  readonly formSubmitted = signal<boolean>(false);
  readonly touchedFields = signal<Record<string, boolean>>({});

  markTouched(field: string): void {
    this.touchedFields.update(prev => ({ ...prev, [field]: true }));
  }

  isTouched(field: string): boolean {
    return this.formSubmitted() || !!this.touchedFields()[field];
  }

  readonly firstNameError = computed(() => {
    if (!this.isTouched('firstName')) return '';
    const val = this.inputFirstName().trim();
    if (!val) return 'First Name is required';
    return '';
  });

  readonly genderError = computed(() => {
    if (!this.isTouched('gender')) return '';
    const val = this.inputGender().trim();
    if (!val) return 'Gender is required';
    return '';
  });

  readonly emailError = computed(() => {
    if (!this.isTouched('email')) return '';
    const val = this.inputEmail().trim();
    if (!val) return 'Email address is required';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(val)) return 'Enter a valid email address';
    return '';
  });

  readonly phoneError = computed(() => {
    if (!this.isTouched('phone')) return '';
    const val = this.inputPhone().trim();
    if (!val) return 'Phone number is required';
    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(val)) return 'Enter a valid 10-digit mobile number';
    return '';
  });

  readonly statusError = computed(() => {
    if (!this.isTouched('status')) return '';
    const val = this.inputStatus().trim();
    if (!val) return 'Driver status is required';
    return '';
  });

  readonly driverTypeError = computed(() => {
    if (!this.isTouched('driverType')) return '';
    if (this.inputDriverTypes().length === 0) return 'At least one Driver Type is required';
    return '';
  });

  readonly dlNoError = computed(() => {
    if (!this.isTouched('dlNo')) return '';
    const val = this.inputDlNo().trim();
    if (!val) return 'Driving License No. is required';
    return '';
  });

  validateCurrentStep(): boolean {
    const tab = this.activeFormTab();
    const sub = this.activeSubSection();

    if (tab === 0) {
      if (sub === 0) {
        this.markTouched('firstName');
        this.markTouched('gender');
        return !this.firstNameError() && !this.genderError();
      } else if (sub === 1) {
        this.markTouched('email');
        this.markTouched('phone');
        return !this.emailError() && !this.phoneError();
      } else if (sub === 3) {
        this.markTouched('status');
        this.markTouched('driverType');
        return !this.statusError() && !this.driverTypeError();
      }
    } else if (tab === 2) {
      if (sub === 0) {
        this.markTouched('dlNo');
        return !this.dlNoError();
      }
    }
    return true;
  }

  // --- Form Input Signals (Tab 1: Personal) ---
  readonly inputAppNo = signal<string>('');
  readonly inputJoiningDate = signal<string>('');
  readonly inputFirstName = signal<string>('');
  readonly inputLastName = signal<string>('');
  readonly inputFatherName = signal<string>('');
  readonly inputMotherName = signal<string>('');
  readonly inputEmail = signal<string>('');
  readonly inputPhone = signal<string>('');
  readonly inputEmergencyNumber = signal<string>('');
  readonly inputDob = signal<string>('');
  readonly inputMaritalStatus = signal<string>('Unmarried');
  readonly inputGender = signal<string>('');
  readonly inputPassportNumber = signal<string>('');
  readonly inputReligion = signal<string>('Hindu');
  readonly inputColor = signal<string>('Light Skin');
  readonly inputLanguages = signal<string[]>(['Hindi']);
  readonly inputCountry = signal<string>('India');
  readonly inputState = signal<string>('');
  readonly inputPincode = signal<string>('');
  readonly inputAddress = signal<string>('');
  readonly inputDriverTypes = signal<string[]>([]);
  readonly inputStatus = signal<string>('');
  readonly inputSourceType = signal<string>('WalkIn');
  readonly inputVehicle = signal<string>('Personal Sedan');

  // Dropdown Open/Close Signals & Text Computeds
  readonly isLangDropdownOpen = signal<boolean>(false);
  readonly isDriverTypeDropdownOpen = signal<boolean>(false);

  toggleLangDropdown(): void {
    this.isLangDropdownOpen.update((v) => !v);
  }

  toggleDriverTypeDropdown(): void {
    this.isDriverTypeDropdownOpen.update((v) => !v);
  }

  readonly selectedLanguagesText = computed(() => {
    const list = this.inputLanguages();
    return list.length > 0 ? list.join(', ') : 'Select Languages...';
  });

  readonly selectedDriverTypesText = computed(() => {
    const list = this.inputDriverTypes();
    return list.length > 0 ? list.join(', ') : 'Select Driver Types...';
  });

  // Multi-select Checkbox Helpers
  isLanguageSelected(lang: string): boolean {
    return this.inputLanguages().includes(lang);
  }
  toggleLanguage(lang: string): void {
    this.inputLanguages.update(list =>
      list.includes(lang) ? list.filter(l => l !== lang) : [...list, lang]
    );
  }

  isDriverTypeSelected(type: string): boolean {
    return this.inputDriverTypes().includes(type);
  }
  toggleDriverType(type: string): void {
    this.markTouched('driverType');
    this.inputDriverTypes.update(list =>
      list.includes(type) ? list.filter(t => t !== type) : [...list, type]
    );
  }

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
  readonly inputPreferredPaymentMode = signal<string>('Bank Account');
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
    { type: 'Select Document Type', regNo: '', file: '' }
  ]);
  readonly policeDocs = signal<Array<{ type: string; regNo: string; file: string }>>([
    { type: 'Select Document Type', regNo: '', file: '' }
  ]);

  // Raw File blobs pending upload, keyed by `${category}-${idx}` — uploaded once the
  // driver record has a real id (on save), since document rows have no id until then.
  private readonly pendingFiles = new Map<string, File>();

  // --- Personal Detail Master Options ---
  readonly sourceTypes = signal<string[]>(['WalkIn', 'Website', 'Referral']);
  readonly maritalStatuses = signal<string[]>(['Unmarried', 'Married', 'Divorced', 'Widowed']);
  readonly genders = signal<string[]>(['Male', 'Female', 'Other']);
  readonly religions = signal<string[]>(['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Parsi', 'Other']);
  readonly colors = signal<string[]>(['Light Skin', 'Dark Skin']);
  readonly languages = signal<string[]>(['Hindi', 'English', 'Bhojpuri', 'Other']);
  readonly driverTypeOptions = signal<string[]>(['Personal driver', 'Car Driver', 'Bike Rider', 'Ambulance Driver', 'Construction Vehicle Driver']);

  // --- Education Master Options ---
  readonly educationLevels = signal<string[]>(['No Formal Education', 'Primary School (Class 1–5)', 'Secondary School (Class 6–10)', 'Higher Secondary (Class 11–12)', 'Diploma / Certification Course', "Bachelor's Degree", "Master's Degree", 'Doctorate / PhD']);
  readonly trainingStatuses = signal<string[]>(['Yes', 'No']);
  readonly educationDocTypes = signal<string[]>([
    '10th Certificate / Marksheet',
    '12th Certificate / Marksheet',
    'Diploma / Vocational Certificate',
    "Bachelor's Degree Certificate",
    "Master's Degree Certificate",
    'Training Certificate',
    'Other Educational Certificate'
  ]);

  // --- Health Master Options ---
  readonly eyeVisions = signal<string[]>(['Normal Vision', 'Wear Glasses', 'Color Blind']);
  readonly bloodGroups = signal<string[]>(['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']);
  readonly healthInsurances = signal<string[]>(['Yes', 'No']);

  // --- Document Category Options ---
  readonly licenseDetailsOptions = signal<string[]>(['HMV', 'HPMV', 'HTV', 'LMV', 'LMV-TR', 'MCWG', 'MCWOG', 'MGV', 'TRAILER']);
  readonly vehicleTypeOptions = signal<string[]>(['HUV', 'MUV', 'SUV', 'SEDAN', 'HATCHBACK']);
  readonly policeVerifiedStatuses = signal<string[]>(['Yes', 'No']);
  readonly jobTypeOptions = signal<string[]>(['Full time', 'Part Time']);
  readonly experienceOptions = signal<string[]>(['1 Year', '2 Year', '3 Year', '4 Year', '5+ Years']);
  readonly expectedSalaryOptions = signal<string[]>(['10000-15000', '15000-20000', '20000-25000', '25000+']);
  readonly documentCategoryOptions = signal<string[]>([
    'Address Proof',
    'Affidavit of No Criminal Record',
    'Bank Passbook / Cancelled Cheque',
    'Commercial Driving License',
    'Driver Badge',
    'Driving License',
    'PAN Card',
    'Passport-size Photograph',
    'Police Station NOC',
    'Police Verification Certificate (PCC)',
    'UPI / Bank Details for Payments',
    'Vehicle Insurance Certificate',
    'Vehicle Registration Certificate (RC)'
  ]);
  readonly personalDocTypes = signal<string[]>(['Aadhaar / National ID', 'Passport', 'PAN Card', 'Driving License', 'Voter ID']);
  readonly healthDocTypes = signal<string[]>(['Eye Vision Test', 'Medical Fitness Certificate', 'Health Insurance Policy', 'Vaccine Certificate']);
  readonly policeDocTypes = signal<string[]>(['Address Proof', 'Police Clearance Certificate (PCC)', 'Character Verification Form']);

  // --- Payment Master Options ---
  readonly paymentModes = signal<string[]>(['Bank Account', 'UPI']);

  protected readonly content = signal({
    title: 'Driver Registry',
    subtitle: 'Manage and view registered drivers.',
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
    { key: 'onboardingLabel', label: 'Onboarding', sortable: false },
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
    { key: 'upiIdOrChequeNo', label: 'UPI / Cheque', sortable: false, hidden: true },
    { key: 'linkedAccountLabel', label: 'Portal Account', sortable: false, hidden: true }
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
    { icon: 'badge', label: 'Preview / View Resume', event: 'preview_driver' },
    { icon: 'picture_as_pdf', label: 'Download PDF', event: 'download_pdf' },
    { icon: 'visibility', label: 'View Details', event: '__view_detail__' },
    { icon: 'edit', label: 'Edit', event: 'edit_driver' },
    { icon: 'link', label: 'Link / Unlink Portal Account', event: 'link_driver' },
    { icon: 'delete', label: 'Delete', event: 'delete_driver', variant: 'danger' }
  ]);

  // --- Processed and Filtered Dataset ---
  readonly processedDrivers = computed(() => {
    let list: Driver[] = this.allDrivers();

    // 1. Search Query Filter
    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      list = list.filter(d =>
        (d.firstName || '').toLowerCase().includes(query) ||
        (d.lastName || '').toLowerCase().includes(query) ||
        (d.email || '').toLowerCase().includes(query) ||
        (d.phone || '').includes(query) ||
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
    // `linkedUser` is a nested object — the shared data table's generic detail drawer just
    // does `String(value)` per field, which would render `[object Object]`. Swap it for a
    // flat display label instead; the link/unlink panel reads the real object off
    // `allDrivers()` directly, not off this serialized row data.
    return JSON.stringify(
      paginated.map((d) => ({
        ...d,
        linkedUser: undefined,
        linkedAccountLabel: d.linkedUser ? `${d.linkedUser.name} (${d.linkedUser.phone ?? d.linkedUser.email ?? ''})` : 'Not linked',
        onboardingLabel: onboardingLabel(d),
      })),
    );
  });

  readonly totalDrivers = computed(() => this.processedDrivers().length);

  ngOnInit(): void {
    // Load copy strings dynamically (static UI copy, not business data)
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

    this.reload();
  }

  private reload(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: (data) => {
        this.allDrivers.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load drivers', err);
        this.loading.set(false);
      }
    });
  }

  // --- Build the current full-form snapshot (reused by every step save + the final save) ---
  private buildPayload(): Driver {
    const firstName = this.inputFirstName().trim();
    const lastName = this.inputLastName().trim();
    const phone = this.inputPhone().trim();
    const email = this.inputEmail().trim();

    return {
      name: `${firstName} ${lastName}`.trim(),
      firstName,
      lastName,
      phone,
      email,
      vehicle: this.inputVehicle().trim(),
      fatherName: this.inputFatherName().trim(),
      motherName: this.inputMotherName().trim(),
      emergencyNumber: this.inputEmergencyNumber().trim(),
      dob: this.inputDob(),
      maritalStatus: this.inputMaritalStatus(),
      gender: this.inputGender(),
      passportNumber: this.inputPassportNumber().trim(),
      religion: this.inputReligion(),
      color: this.inputColor(),
      language: this.inputLanguages().join(', '),
      age: this.inputAge().trim(),
      height: this.inputHeight().trim(),
      weight: this.inputWeight().trim(),
      country: this.inputCountry(),
      state: this.inputState().trim(),
      pincode: this.inputPincode().trim(),
      address: this.inputAddress().trim(),
      driverType: this.inputDriverTypes().join(', '),
      status: this.inputStatus(),
      sourceType: this.inputSourceType(),
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
      jobType: this.inputJobType(),
      experience: this.inputExperience(),
      currentSalary: this.inputCurrentSalary().trim(),
      expectedSalary: this.inputExpectedSalary(),
      // --- Payment Details ---
      preferredPaymentMode: this.inputPreferredPaymentMode(),
      amount: this.inputAmount().trim(),
      paymentReceiptDate: this.inputPaymentReceiptDate(),
      bankName: this.inputBankName().trim(),
      bankAccountNo: this.inputBankAccountNo().trim(),
      ifscCode: this.inputIfscCode().trim(),
      branchName: this.inputBranchName().trim(),
      upiIdOrChequeNo: this.inputUpiIdOrChequeNo().trim()
    };
  }

  /**
   * Persists the current full-form snapshot immediately, tagged with the onboarding step
   * that was just completed. Step 1 (no driver yet) creates the record; every later step
   * updates the SAME record (`editingDriverId`, set from the step-1 response) — never a
   * second `POST`. Resolves `true` on success (caller advances the UI), `false` on failure
   * (caller stays put — the error is already surfaced via `stepError`).
   */
  private async persistStep(stepCompleted: number, isFinal: boolean): Promise<boolean> {
    this.savingStep.set(true);
    this.stepError.set(null);
    const payload = this.buildPayload();
    const editingId = this.editingDriverId();

    try {
      const driver = editingId !== null
        ? await firstValueFrom(this.api.update(editingId, payload, stepCompleted))
        : await firstValueFrom(this.api.create(payload, stepCompleted));

      if (editingId === null) this.editingDriverId.set(driver.id!);
      this.uploadPendingDocuments(driver.id!);
      this.reload();
      this.savingStep.set(false);

      if (isFinal) {
        this.resetForm();
        this.showAddForm.set(false);
      }
      return true;
    } catch (err) {
      console.error(`Failed to save step ${stepCompleted}`, err);
      this.savingStep.set(false);
      this.stepError.set('Failed to save. Please check your connection and try again.');
      return false;
    }
  }

  // --- Final "Save & Register" / "Save Changes" action (last tab's last sub-section) ---
  async addDriver(): Promise<void> {
    this.formSubmitted.set(true);
    if (this.firstNameError() || this.genderError() || this.phoneError() || this.emailError() || this.statusError() || this.driverTypeError()) {
      this.activeFormTab.set(0);
      return;
    }
    await this.persistStep(TOTAL_ONBOARDING_STEPS, true);
  }

  private uploadPendingDocuments(driverId: string): void {
    for (const [key, file] of this.pendingFiles.entries()) {
      const [category, idxStr] = key.split('-') as ['personal' | 'health' | 'education' | 'police', string];
      const idx = Number(idxStr);
      const docs =
        category === 'personal' ? this.personalDocs() :
        category === 'health' ? this.healthDocs() :
        category === 'education' ? this.educationDocs() :
        this.policeDocs();
      const doc = docs[idx];
      if (!doc) continue;
      this.api.uploadDocument(driverId, category, doc.type, doc.regNo, file).subscribe({
        error: (err) => console.error(`Failed to upload ${category} document`, err)
      });
    }
    this.pendingFiles.clear();
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
    this.educationDocs.update(docs => [...docs, { type: 'Select Document Type', regNo: '', file: '' }]);
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
    if (!file) return;
    this.pendingFiles.set(`${category}-${idx}`, file);
    const val = file.name;
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

  clearDocFile(category: 'personal' | 'health' | 'education' | 'police', idx: number): void {
    this.pendingFiles.delete(`${category}-${idx}`);
    if (category === 'personal') {
      this.personalDocs.update(docs => docs.map((doc, i) => i === idx ? { ...doc, file: '' } : doc));
    } else if (category === 'health') {
      this.healthDocs.update(docs => docs.map((doc, i) => i === idx ? { ...doc, file: '' } : doc));
    } else if (category === 'education') {
      this.educationDocs.update(docs => docs.map((doc, i) => i === idx ? { ...doc, file: '' } : doc));
    } else if (category === 'police') {
      this.policeDocs.update(docs => docs.map((doc, i) => i === idx ? { ...doc, file: '' } : doc));
    }
  }

  resetForm(): void {
    this.formSubmitted.set(false);
    this.touchedFields.set({});
    this.editingDriverId.set(null);
    this.stepError.set(null);
    this.savingStep.set(false);
    this.pendingFiles.clear();
    this.inputFirstName.set('');
    this.inputLastName.set('');
    this.inputFatherName.set('');
    this.inputMotherName.set('');
    this.inputEmail.set('');
    this.inputPhone.set('');
    this.inputEmergencyNumber.set('');
    this.inputDob.set('');
    this.inputMaritalStatus.set('Unmarried');
    this.inputGender.set('');
    this.inputPassportNumber.set('');
    this.inputReligion.set('Hindu');
    this.inputColor.set('Light Skin');
    this.inputLanguages.set(['Hindi']);
    this.inputAge.set('');
    this.inputHeight.set('');
    this.inputWeight.set('');
    this.inputCountry.set('India');
    this.inputState.set('');
    this.inputPincode.set('');
    this.inputAddress.set('');
    this.inputDriverTypes.set([]);
    this.inputStatus.set('');
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
    this.inputPreferredPaymentMode.set('Bank Account');
    this.inputAmount.set('');
    this.inputPaymentReceiptDate.set('');
    this.inputBankName.set('');
    this.inputBankAccountNo.set('');
    this.inputIfscCode.set('');
    this.inputBranchName.set('');
    this.inputUpiIdOrChequeNo.set('');
    this.personalDocs.set([{ type: 'Aadhaar / National ID', regNo: '', file: '' }]);
    this.healthDocs.set([{ type: 'Select Document Type', regNo: '', file: '' }]);
    this.educationDocs.set([{ type: 'Select Document Type', regNo: '', file: '' }]);
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
      this.inputLanguages.set(row.language ? row.language.split(', ').map((s: string) => s.trim()) : ['Hindi']);
      this.inputAge.set(row.age || '');
      this.inputHeight.set(row.height || '');
      this.inputWeight.set(row.weight || '');
      this.inputCountry.set(row.country || 'India');
      this.inputState.set(row.state || '');
      this.inputPincode.set(row.pincode || '');
      this.inputAddress.set(row.address || '');
      this.inputDriverTypes.set(row.driverType ? row.driverType.split(', ').map((s: string) => s.trim()) : []);
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
      this.inputPreferredPaymentMode.set(row.preferredPaymentMode || 'Bank Account');
      this.inputAmount.set(row.amount || '');
      this.inputPaymentReceiptDate.set(row.paymentReceiptDate || '');
      this.inputBankName.set(row.bankName || '');
      this.inputBankAccountNo.set(row.bankAccountNo || '');
      this.inputIfscCode.set(row.ifscCode || '');
      this.inputBranchName.set(row.branchName || '');
      this.inputUpiIdOrChequeNo.set(row.upiIdOrChequeNo || '');
      this.personalDocs.set(row.personalDocs || [{ type: 'Aadhaar / National ID', regNo: '', file: '' }]);
      this.healthDocs.set(row.healthDocs || [{ type: 'Select Document Type', regNo: '', file: '' }]);
      this.educationDocs.set(row.educationDocs || [{ type: 'Select Document Type', regNo: '', file: '' }]);
      this.policeDocs.set(row.policeDocs || [{ type: 'Select Document Type', regNo: '', file: '' }]);

      // Resume: an in-progress driver opens on its pending step (from persisted backend
      // progress, not any frontend memory of where they left off — this component was just
      // (re)constructed from a fresh `GET /drivers` list). A completed (or legacy, pre-
      // onboarding-tracking) driver opens on tab 0 as a normal full edit/review, same as before.
      if (row.onboardingStatus === 'in_progress' && row.currentStep) {
        const step = Math.min(Math.max(Number(row.currentStep), 1), TOTAL_ONBOARDING_STEPS);
        this.activeFormTab.set(step - 1);
      } else {
        this.activeFormTab.set(0);
      }
      this.activeSubSection.set(0);
      this.showAddForm.set(true);
    } else if (action === 'delete_driver') {
      if (confirm(`Are you sure you want to delete lead "${row.firstName} ${row.lastName}"?`)) {
        this.api.delete(row.id).subscribe({
          next: () => this.reload(),
          error: (err) => {
            console.error('Failed to delete driver', err);
            alert('Failed to delete driver. Please try again.');
          }
        });
      }
    } else if (action === 'link_driver') {
      const driver = this.allDrivers().find((d) => d.id === row.id);
      if (driver) this.openLinkPanel(driver);
    } else if (action === 'preview_driver') {
      // Look up the full record from `allDrivers()` (freshly reloaded after every
      // mutation), not the serialized table row — the resume must show the latest data.
      const driver = this.allDrivers().find((d) => d.id === row.id);
      if (driver) this.openPreview(driver);
    } else if (action === 'download_pdf') {
      const driver = this.allDrivers().find((d) => d.id === row.id);
      if (driver) this.downloadPdf(driver);
    }
  }

  // --- Driver <-> User account linking ---
  openLinkPanel(driver: Driver): void {
    this.linkPanelDriver.set(driver);
    this.linkSelectedUserId.set('');
    this.linkError.set(null);
    if (this.linkUsers().length === 0) {
      this.rbac.listUsers(1, 200).subscribe({
        next: (page) => this.linkUsers.set(page.items.map((u) => ({ id: u.id, name: u.name, phone: u.phone, email: u.email }))),
        error: (err) => console.error('Failed to load users for linking', err),
      });
    }
  }

  closeLinkPanel(): void {
    this.linkPanelDriver.set(null);
  }

  confirmLink(): void {
    const driver = this.linkPanelDriver();
    const userId = this.linkSelectedUserId();
    if (!driver?.id || !userId) {
      this.linkError.set('Please select a user account.');
      return;
    }
    this.linkSaving.set(true);
    this.linkError.set(null);
    this.api.linkToUser(driver.id, userId).subscribe({
      next: (updated) => {
        this.linkSaving.set(false);
        this.allDrivers.update((list) => list.map((d) => (d.id === updated.id ? updated : d)));
        this.closeLinkPanel();
      },
      error: (err) => {
        this.linkSaving.set(false);
        this.linkError.set(err?.message || 'Failed to link account — the user may already be linked to another driver.');
      },
    });
  }

  unlinkUser(driver: Driver): void {
    if (!driver.id) return;
    if (!confirm(`Unlink ${driver.firstName} ${driver.lastName}'s account? They will lose access to the driver portal.`)) return;
    this.api.unlinkUser(driver.id).subscribe({
      next: (updated) => this.allDrivers.update((list) => list.map((d) => (d.id === updated.id ? updated : d))),
      error: (err) => {
        console.error('Failed to unlink account', err);
        alert('Failed to unlink account. Please try again.');
      },
    });
  }

  // --- View Control Events ---
  openAddDriverForm(): void {
    this.showAddForm.set(true);
    this.activeFormTab.set(0);
    this.activeSubSection.set(0);
  }

  closeAddDriverForm(): void {
    this.showAddForm.set(false);
    this.resetForm();
    // A step may already have been persisted (driver created/updated mid-wizard) — refresh
    // so it shows up immediately with its correct in-progress status, not stale/missing.
    this.reload();
  }

  onFormTabChange(event: Event): void {
    const index = (event.target as HTMLElement & { activeTabIndex: number }).activeTabIndex;
    this.activeFormTab.set(index);
    this.activeSubSection.set(0);
  }

  // --- Step Navigation Actions ---
  isLastStep(): boolean {
    return this.activeFormTab() === 3 && this.activeSubSection() === MAX_SUBS[3] - 1;
  }

  /**
   * Sub-section chip navigation *within* a tab never touches the backend — only finishing
   * the last sub-section of a tab (about to cross into the next tab, or finishing the form
   * entirely) does. That save is awaited before the UI advances, so "Continue" always means
   * "this step is now in Postgres", never just a local signal update.
   */
  async onSaveAndNext(): Promise<void> {
    if (!this.validateCurrentStep()) {
      return;
    }

    if (this.isLastStep()) {
      await this.addDriver();
      return;
    }

    const currentTab = this.activeFormTab();
    const currentSub = this.activeSubSection();
    const isLastSubOfTab = currentSub >= MAX_SUBS[currentTab] - 1;

    if (!isLastSubOfTab) {
      this.activeSubSection.set(currentSub + 1);
      return;
    }

    const stepCompleted = currentTab + 1;
    const ok = await this.persistStep(stepCompleted, false);
    if (!ok) return; // stay put — stepError is already showing why

    this.activeFormTab.set(currentTab + 1);
    this.activeSubSection.set(0);
  }

  onPrevSubSection(): void {
    const currentTab = this.activeFormTab();
    const currentSub = this.activeSubSection();

    if (currentSub > 0) {
      this.activeSubSection.set(currentSub - 1);
    } else if (currentTab > 0) {
      const prevTab = currentTab - 1;
      this.activeFormTab.set(prevTab);
      this.activeSubSection.set(MAX_SUBS[prevTab] - 1);
    }
  }

  // --- Input Handlers ---
  onInputChange(field: string, event: Event): void {
    const val = (event.target as any).value || '';
    switch(field) {
      case 'appNo': this.inputAppNo.set(val); break;
      case 'joiningDate': this.inputJoiningDate.set(val); break;
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
      case 'age': this.inputAge.set(val); break;
      case 'height': this.inputHeight.set(val); break;
      case 'weight': this.inputWeight.set(val); break;
      case 'country': this.inputCountry.set(val); break;
      case 'state': this.inputState.set(val); break;
      case 'pincode': this.inputPincode.set(val); break;
      case 'address': this.inputAddress.set(val); break;
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
