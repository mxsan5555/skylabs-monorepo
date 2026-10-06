import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, inject, OnInit, computed, effect } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { httpErrorMessage } from '../../../core/http-error';
import { Router, NavigationEnd, ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom, filter } from 'rxjs';
import { calculateAge } from '@skylabs-monorepo/shared-utils';
import { AdminPage } from '../../../admin/admin-page/admin-page';
import { DriversApiService, type Driver } from '../../../core/drivers/drivers-api.service';
import { RbacApiService } from '../../../core/rbac/rbac-api.service';
import { AuthService } from '@skylabs-monorepo/shared-auth/angular';
import { InlineDl } from '../../../shared/inline-dl/inline-dl';

/** The 4 tabs are the onboarding wizard's persistence checkpoints — sub-section chip
 *  navigation within a tab is a pure UI concern and never itself hits the backend. */
const TOTAL_ONBOARDING_STEPS = 4;
// Sub-section counts for tabs 0-3, matching the actual number of `@if (activeSubSection() === N)`
// branches (and chips) rendered per tab in drivers.html — NOT the previous [4,2,6,3], which
// overcounted tabs 2 and 3 and made "Save & Next" walk through blank, content-less
// sub-sections before a tab was actually considered finished.
const MAX_SUBS = [4, 2, 3, 2];

const TAB_NAMES = ['Personal Details', 'Education & Health Details', 'Documents Details', 'Payment Details'];
// Current pill fields only: saving finance must not replay defaults or stale
// reviewed fields from unrelated pills. KYC status and trusted fee state are absent.
const PILL_SAVE_FIELDS: (keyof Driver)[][][] = [
  [['firstName','lastName','fatherName','motherName','dob','gender','maritalStatus','language'],['email','phone','emergencyNumber','pincode','state','city','address'],['height','weight','religion','color'],['sourceType','jobType','jobChoices','workLocation','workStates','experience','driverType','avatar']],
  [['education','trainingStatus','trainingCertificate'],['eyeVision','bloodGroup','healthInsurance']],
  [['licenseDetails','vehicleType','dlNo','dlIssueDate','dlExpiryDate'],['policeVerifiedStatus','policeVerifiedNo','currentSalary','expectedSalary'],[]],
  [['accountPaymentMethod','bankName','bankAccountNo','ifscCode','branchName','upiIdOrChequeNo'],['preferredPaymentMode','amount','paymentReceiptDate','driverStatusMasterId']],
];

/** Driver List progress display — e.g. "In Progress — Personal Details, sub-step 2 of 4 (18%)"
 *  / "Completed — 100%". A driver with no onboarding data at all (shouldn't happen
 *  post-migration, but defensively) reads as completed rather than a confusing label. */
function onboardingLabel(d: Driver): string {
  if (d.onboardingStatus === 'in_progress') {
    const tab = Math.min(Math.max(d.currentStep ?? 1, 1), TOTAL_ONBOARDING_STEPS);
    const sub = Math.min(Math.max(d.currentSubStep ?? 0, 0), MAX_SUBS[tab - 1] - 1);
    return `${d.completionPercentage ?? 0}% · ${TAB_NAMES[tab - 1]} → pill ${sub + 1}`;
  }
  return 'Completed — 100%';
}

/** Encodes a (0-based tab, 0-based sub) pair to match the backend's `tab*10+sub` storage
 *  (backend tabs are 1-based) — used to check `completedSubSteps` for chip/tick display. */
function subStepKey(tabIndex: number, subIndex: number): number {
  return (tabIndex + 1) * 10 + subIndex;
}

@Component({
  selector: 'md-account-drivers',
  standalone: true,
  imports: [AdminPage, RouterLink, InlineDl],
  templateUrl: './drivers.html',
  styleUrl: '../masters/masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class Drivers implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = inject(DriversApiService);
  private readonly rbac = inject(RbacApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly auth = inject(AuthService);
  readonly moreDriver = signal<Driver | null>(null);
  moreAction(action: string, driver: Driver): void {
    this.moreDriver.set(null);
    this.onRowAction(new CustomEvent('action', { detail: { action, row: driver } }));
  }

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe(() => {
        if (this.showAddForm()) {
          this.closeAddDriverForm();
        }
      });
  }

  // --- All Drivers Repository ---
  readonly allDrivers = signal<Driver[]>([]);
  readonly loading = signal<boolean>(false);

  // --- Driver User account (self-service portal login) ---
  // One-click creation only — no existing-user picker. See `createDriverUser()`.
  readonly linkPanelDriver = signal<Driver | null>(null);
  readonly linkSaving = signal<boolean>(false);
  readonly linkError = signal<string | null>(null);

  // --- KYC Verifier Assignment ---
  readonly verifierPanelDriver = signal<Driver | null>(null);
  readonly verifierOptions = signal<{ id: string; name: string }[]>([]);
  readonly verifierSaving = signal<boolean>(false);
  readonly verifierError = signal<string | null>(null);

  openPreview(driver: Driver): void { void this.router.navigate(['/account/drivers', driver.id, 'details']); }

  /** Download a fresh, authorized backend-generated PDF. */
  downloadPdf(driver: Driver, resume = false): void {
    if (!driver.id) return;
    (resume ? this.api.resumePdf(driver.id) : this.api.profileReport(driver.id)).subscribe({
      next: pdf => {
        const url = URL.createObjectURL(pdf);
        const link = document.createElement('a'); link.href = url; link.download = resume ? `${driver.name.normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu,'_').slice(0,80)||'Driver'}_Driver_Resume.pdf` : `driver-full-report-${driver.id}.pdf`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      }, error: async error => { alert(await httpErrorMessage(error)); },
    });
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
  // Nested (tab, sub) pairs already saved for the driver currently open in the form —
  // drives the "done" tick on sub-section chips. Encoded via `subStepKey()`.
  readonly formCompletedSubSteps = signal<number[]>([]);

  isSubStepDone(tabIndex: number, subIndex: number): boolean {
    return this.formCompletedSubSteps().includes(subStepKey(tabIndex, subIndex));
  }

  readonly totalSubSteps = MAX_SUBS.reduce((a, b) => a + b, 0);

  /** Caps the Date of Birth picker so a future date can't even be selected in the UI —
   *  the backend rejects it either way (see `business.schema.ts`'s `dob` refine). */
  readonly today = new Date().toISOString().slice(0, 10);

  maxSubsFor(tabIndex: number): number {
    return MAX_SUBS[tabIndex];
  }

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

  readonly emergencyNumberError = computed(() => {
    if (!this.isTouched('emergencyNumber')) return '';
    const val = this.inputEmergencyNumber().trim();
    if (!val) return 'Emergency number is required';
    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(val)) return 'Enter a valid 10-digit emergency number';
    return '';
  });

  readonly pincodeError = computed(() => {
    if (!this.isTouched('pincode')) return '';
    const val = this.inputPincode().trim();
    if (!val) return 'Pincode is required';
    const pincodeRegex = /^\d{6}$/;
    if (!pincodeRegex.test(val)) return 'Enter a valid 6-digit pincode';
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

  readonly avatarError = computed(() => {
    if (!this.isTouched('avatar')) return '';
    const val = this.inputAvatar().trim();
    if (!val) return 'Profile Image is required';
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
        this.markTouched('emergencyNumber');
        this.markTouched('pincode');
        return !this.emailError() && !this.phoneError() && !this.emergencyNumberError() && !this.pincodeError();
      } else if (sub === 3) {
        this.markTouched('driverType');
        this.markTouched('avatar');
        return !this.driverTypeError() && !this.avatarError();
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
  readonly inputGender = signal<string>('Male');
  readonly inputPassportNumber = signal<string>('');
  readonly inputReligion = signal<string>('Hindu');
  readonly inputColor = signal<string>('Light Skin');
  readonly inputLanguages = signal<string[]>(['Hindi']);
  readonly inputCountry = signal<string>('India');
  readonly inputState = signal<string>('');
  readonly inputCity = signal<string>('');
  readonly inputPincode = signal<string>('');
  readonly inputAddress = signal<string>('');
  readonly inputDriverTypes = signal<string[]>([]);
  readonly inputStatus = signal<string>('');
  readonly inputSourceType = signal<string>('');
  readonly inputVehicle = signal<string>('Personal Sedan');
  readonly inputAvatar = signal<string>('');

  onAvatarFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024){this.stepError.set('Upload a PNG, JPEG or WebP profile photo up to 10 MB');return;}
      this.inputAvatar.set(file.name);
      this.pendingFiles.set('avatar-0', file);
    }
  }

  clearAvatarFile(): void {
    this.inputAvatar.set('');
    this.pendingFiles.delete('avatar-0');
  }

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
  readonly inputEducation = signal<string>('');
  readonly inputTrainingStatus = signal<string>('No');
  readonly inputTrainingCertificate = signal<string>('');
  readonly inputEyeVision = signal<string>('Normal Vision');
  readonly inputHealthInsurance = signal<string>('No');
  readonly inputBloodGroup = signal<string>('O+');

  // --- Form Input Signals (Tab 3: Documents) ---
  readonly inputLicenseDetails = signal<string>('LMV');
  readonly inputVehicleType = signal<string>('');
  readonly inputDlNo = signal<string>('');
  readonly inputDlIssueDate = signal<string>('');
  readonly inputDlExpiryDate = signal<string>('');
  readonly inputPoliceVerifiedStatus = signal<string>('No');
  readonly inputPoliceVerifiedNo = signal<string>('');
  readonly inputPoliceVerifiedUpload = signal<string>('');
  readonly inputJobType = signal<string>('');
  readonly inputExperience = signal<string>('1 Year');
  readonly inputCurrentSalary = signal<string>('');
  readonly inputExpectedSalary = signal<string>('10000-15000');
  readonly inputDocumentCategory = signal<string>('Driving License');
  readonly inputDocumentUpload = signal<string>('');

  // --- Form Input Signals (Tab 4: Payments) ---
  readonly inputPreferredPaymentMode = signal<string>('Cash');
  readonly inputAccountPaymentMethod = signal<string>('Bank Account');
  readonly inputRegistrationFeeStatus = signal<string>('Unpaid');
  readonly actualFeeStatus = signal('Unpaid');
  private originalRegistrationDetails = '';
  readonly expectedRegistrationFeePaise = signal(0);
  readonly feeRequired = signal(false);
  readonly inputDriverStatusMasterId = signal<string | null>(null);
  readonly originalDriverStatusMasterId = signal<string | null>(null);
  readonly cashConfirmed = signal(false);
  readonly collectionReference = signal('');
  readonly collectionReason = signal('');
  readonly confirmingCollection = signal(false);
  private registrationReceipt: File | null = null;
  driverStatusOptions(){const all=this.formMasters()['statuses']??[];return all.filter(option=>option.status==='Active'||option.id===this.originalDriverStatusMasterId());}
  feePolicyLabel(){const amount=this.expectedRegistrationFeePaise();return amount>0?`${this.feeRequired()?'Required':'Optional'} fee: ${new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(amount/100)}`:'No registration amount configured; Accounts must configure a fee policy before recording collection.';}
  selectRegistrationFee(value: 'Paid' | 'Unpaid', event?: Event){
    if(value==='Unpaid' && this.actualFeeStatus()==='Paid'){const radio=event?.target as (HTMLElement & {checked:boolean})|undefined;if(radio){radio.checked=false;const paid=radio.closest('fieldset')?.querySelector('md-radio[value="Paid"]') as (HTMLElement & {checked:boolean})|null;if(paid)paid.checked=true;}this.stepError.set('This fee has a verified collection. Use Accounts Registration Fees refund/correction with a reason; this form cannot reverse its ledger.');return;}
    this.inputRegistrationFeeStatus.set(value);this.stepError.set(null);this.cashConfirmed.set(false);
    if(value==='Unpaid'){this.registrationReceipt=null;this.inputRegistrationReceiptFile.set('');}
  }
  private registrationDetailsError():string|null{
    if(this.inputRegistrationFeeStatus()!=='Paid')return null;
    if(this.actualFeeStatus()==='Paid'&&!this.registrationReceipt&&JSON.stringify([this.inputPreferredPaymentMode(),this.inputAmount(),this.inputPaymentReceiptDate()])===this.originalRegistrationDetails)return null;
    if(!this.registrationPaymentModes().includes(this.inputPreferredPaymentMode()))return 'Choose a configured payment mode';
    const amount=Number(this.inputAmount());
    if(!/^\d+(\.\d{1,2})?$/.test(this.inputAmount().trim())||amount<=0||!Number.isSafeInteger(Math.round(amount*100)))return 'Enter a positive payment amount with at most two decimal places';
    const date=this.inputPaymentReceiptDate();if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)return 'Enter a valid receipt date';
    return null;
  }
  async confirmCashCollection(){
    this.stepError.set(null);
    const error=this.registrationDetailsError();
    if(error){this.stepError.set(error);return;}
    if(!this.auth.can('payments.overview','edit')||this.inputRegistrationFeeStatus()!=='Paid'||this.inputPreferredPaymentMode()!=='Cash'||!this.cashConfirmed()||!this.collectionReference().trim()||!this.collectionReason().trim()){this.stepError.set('Confirm actual cash received and provide a transaction reference and audit reason');return;}
    if(this.expectedRegistrationFeePaise()<=0){this.stepError.set('Configure the registration fee policy in Accounts before confirming collection');return;}
    this.confirmingCollection.set(true);
    try{
      if(!await this.persistStep(3,1,false,false))return;
      await firstValueFrom(this.api.confirmRegistrationCash(this.editingDriverId()!,Math.round(Number(this.inputAmount())*100),this.collectionReference().trim(),this.collectionReason().trim()));
      const state=await firstValueFrom(this.api.registrationState(this.editingDriverId()!));this.actualFeeStatus.set(state.fee);this.cashConfirmed.set(false);this.reload();
    }catch(error){this.stepError.set(await httpErrorMessage(error as Parameters<typeof httpErrorMessage>[0]));}finally{this.confirmingCollection.set(false);}
  }
  readonly inputAmount = signal<string>('');
  readonly inputPaymentReceiptDate = signal<string>('');
  readonly inputRegistrationReceiptFile = signal<string>('');
  readonly inputBankName = signal<string>('');
  readonly inputBankAccountNo = signal<string>('');
  readonly inputIfscCode = signal<string>('');
  readonly inputBranchName = signal<string>('');
  readonly inputUpiIdOrChequeNo = signal<string>('');

  onRegistrationReceiptFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file=input.files[0];if(!['image/png','image/jpeg','image/webp','application/pdf'].includes(file.type)||file.size>10*1024*1024){this.stepError.set('Choose an image or PDF receipt up to 10 MB');return;}this.registrationReceipt=file;
      this.inputRegistrationReceiptFile.set(file.name);
    }
  }

  clearRegistrationReceiptFile(): void {
    this.registrationReceipt=null;this.inputRegistrationReceiptFile.set('');
  }

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

  readonly masterLoading=signal(false);readonly masterError=signal('');readonly formMasters=signal<Record<string,{id:string;name:string;status:string;code?:string}[]>>({});
  readonly inputJobChoices=signal<string[]>([]);readonly inputWorkLocation=signal('');readonly inputWorkStates=signal<string[]>([]);readonly stateSearch=signal('');readonly inputAccountStatus=signal('Active');readonly originalAccountStatus=signal('Active');readonly statusReason=signal('');
  loadFormMasters(){this.masterLoading.set(true);this.masterError.set('');this.api.formOptions().subscribe({next:options=>{this.formMasters.set(options);const fields:Record<string,{set:(value:string[])=>void}>={'source-types':this.sourceTypes,languages:this.languages,'driver-types':this.driverTypeOptions,education:this.educationLevels,'eye-visions':this.eyeVisions,'vehicle-types':this.vehicleTypeOptions,'job-types':this.jobTypeOptions,'personal-docs':this.personalDocTypes,'health-docs':this.healthDocTypes,'police-docs':this.policeDocTypes};for(const[key,field]of Object.entries(fields))field.set((options[key]??[]).filter(option=>option.status==='Active').map(option=>option.name));this.masterLoading.set(false);},error:async error=>{this.masterError.set(await httpErrorMessage(error));this.masterLoading.set(false);}});}
  choices(value:string){return value.split(',').map(v=>v.trim()).filter(Boolean);}
  choiceSelected(value:string[],name:string){return value.some(item=>item.toLowerCase()===name.toLowerCase());}
  masterNames(category:string,saved:string[]=[]){return this.choicesWithSaved(category,saved).map(item=>item.name);}
  choicesWithSaved(category:string,saved:string[]){const options=(this.formMasters()[category]??[]).filter(item=>item.status==='Active');return [...options,...saved.filter(value=>!options.some(item=>item.name.toLowerCase()===value.toLowerCase())).map(name=>({id:name,name,status:'Historical'}))];}
  toggleChoice(field:'jobType'|'vehicleType'|'jobChoices'|'workStates',name:string,checked:boolean){const signal=field==='jobType'?this.inputJobType:field==='vehicleType'?this.inputVehicleType:null;const current=signal?this.choices(signal()):field==='jobChoices'?this.inputJobChoices():this.inputWorkStates();const selected=current.filter(value=>value.toLowerCase()!==name.toLowerCase());if(checked)selected.push(name);if(signal)signal.set(selected.join(', '));else if(field==='jobChoices')this.inputJobChoices.set(selected);else this.inputWorkStates.set(selected);}
  stateOptions(){return this.choicesWithSaved('states',this.inputWorkStates()).filter(option=>option.name.toLowerCase().includes(this.stateSearch().toLowerCase()));}
  // --- Personal Detail Master Options ---
  readonly sourceTypes = signal<string[]>([]);
  readonly maritalStatuses = signal<string[]>(['Unmarried', 'Married', 'Divorced', 'Widowed']);
  readonly genders = signal<string[]>(['Male', 'Female', 'Other']);
  readonly religions = signal<string[]>(['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Parsi', 'Other']);
  readonly colors = signal<string[]>(['Light Skin', 'Dark Skin']);
  readonly languages = signal<string[]>([]);
  readonly driverTypeOptions = signal<string[]>([]);

  // --- Education Master Options ---
  readonly educationLevels = signal<string[]>([]);
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
  readonly eyeVisions = signal<string[]>([]);
  readonly bloodGroups = signal<string[]>(['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']);
  readonly healthInsurances = signal<string[]>(['Yes', 'No']);

  // --- Document Category Options ---
  readonly licenseDetailsOptions = signal<string[]>(['HMV', 'HPMV', 'HTV', 'LMV', 'LMV-TR', 'MCWG', 'MCWOG', 'MGV', 'TRAILER']);
  readonly vehicleTypeOptions = signal<string[]>([]);
  readonly policeVerifiedStatuses = signal<string[]>(['Yes', 'No']);
  readonly jobTypeOptions = signal<string[]>([]);
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
  readonly personalDocTypes = signal<string[]>([]);
  readonly healthDocTypes = signal<string[]>([]);
  readonly policeDocTypes = signal<string[]>([]);

  // --- Payment Master Options ---
  readonly registrationPaymentModes = signal<string[]>(['Cash', 'Cheque', 'NEFT', 'RTGS', 'Online']);
  readonly paymentModes = signal<string[]>(['Bank Account', 'UPI']);
  readonly driverStatuses = signal<string[]>(['Verified', 'Partially Verified (P)', 'Partially Verified (K)', 'Non-Verified', 'Blacklisted', 'Closed', 'Not Useful']);

  protected readonly content = signal({
    title: 'Driver Registry',
    subtitle: 'Manage and view registered drivers.',
    cardTitle: 'Add New Driver',
    btnRegister: 'Save Lead',
    errorEmptyFields: 'First Name, Email, and Phone are required.'
  });

  // --- Table Configuration JSON Strings ---
  readonly tableColumns = JSON.stringify([
    { key:'initials', label:'Photo / Initials', width:'56px' },
    { key: 'name', label: 'Driver', sortable: true, width:'220px' },
    { key:'id', label:'Driver ID', hidden:true, sortable:true },
    { key: 'firstName', label: 'First Name', sortable: true, hidden: true },
    { key: 'lastName', label: 'Last Name', sortable: true, hidden: true },
    { key: 'email', label: 'Email', sortable: true, hidden: true },
    { key: 'phone', label: 'Mobile', sortable: true, hidden:true },
    { key: 'city', label: 'City', sortable:true },
    { key: 'driverType', label: 'Driver Type', sortable: true },
    { key: 'kycLabel', label: 'KYC', type: 'status', statusMap: { Pending: 'warning', Verified: 'success', Partial: 'info', Blacklisted: 'error', Closed: 'error' } },
    { key: 'status', label: 'Full KYC Status', hidden: true, type: 'status', statusMap: {
        'Verified': 'success',
        'Partially Verified (P)': 'info',
        'Partially Verified (K)': 'info',
        'Non-Verified': 'warning',
        'Blacklisted': 'error',
        'Closed': 'error',
        'Not Useful': 'error'
      }
    },
    { key: 'accountStatus', label: 'Account Status', hidden:true, type: 'status', statusMap: { Active: 'success', Inactive: 'error',Suspended:'warning' } },
    { key: 'feeLabel', label: 'Registration Fee', type: 'status',statusMap:{Paid:'success',Waived:'info',Unpaid:'warning',Pending:'warning',Failed:'error',Refunded:'error'} },
    { key:'dlApiStatus',label:'DL API',type:'status',hidden:true,statusMap:{'Not checked':'neutral','Manual review required':'warning','Provider failed':'warning','Expired':'warning','Mismatch/Invalid':'error'} },
    { key: 'licenceStatus', label: 'Licence (human review)', type: 'status',statusMap:{'Manual approved':'success','Not checked':'warning','Expired / invalid':'error'}, hidden:true },
    { key: 'eligibilityLabel', label: 'Trip Eligibility', width:'230px' },
    { key: 'completionPercentage', label: 'Onboarding %', sortable: true },
    { key:'onboardingLabel', label:'Onboarding position', hidden:true },
    { key:'feeStatus', label:'Registration fee state', hidden:true },
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
    { key: 'driverStatusName', label: 'Driver Status', hidden: true },
    { key: 'amount', label: 'Payment Amount', sortable: true, hidden: true },
    { key: 'bankName', label: 'Bank Name', sortable: true, hidden: true },
    { key: 'bankAccountNo', label: 'Bank Account No', sortable: false, hidden: true },
    { key: 'ifscCode', label: 'IFSC Code', sortable: false, hidden: true },
    { key: 'upiIdOrChequeNo', label: 'UPI / Cheque', sortable: false, hidden: true },
    { key: 'linkedAccountLabel', label: 'Portal Account', sortable: false },
    { key: 'assignedVerifierLabel', label: 'KYC Verifier', sortable: false, hidden: true }
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
    { icon: 'badge', label: 'View', event: 'preview_driver' },
    { icon: 'more_horiz', label: 'More actions', event: 'more_driver' },
  ]);

  readonly loginFilter = signal('');
  readonly cityFilter = signal('');
  readonly stateFilter = signal('');
  readonly sourceFilter = signal('');
  readonly typeFilter = signal('');
  readonly accountFilter = signal('');
  readonly feeFilter = signal('');readonly eligibilityFilter=signal('');readonly availabilityFilter=signal('');readonly licenceFilter=signal('');
  readonly listError = signal<string | null>(null);
  readonly summary = signal<{totalDrivers:number;driverUsers:number;noLogin:number;kycPending:number;feeUnpaid?:number;readyForTrips?:number}>({ totalDrivers: 0, driverUsers: 0, noLogin: 0, kycPending: 0 });
  readonly totalDrivers = signal(0);
  private searchSequence = 0;
  readonly processedDrivers = computed(() => this.allDrivers());
  readonly selectedView = signal('all');
  readonly filtersVisible = signal(true);
  readonly listViews = [{key:'all',label:'All Drivers'},{key:'users',label:'Driver Users'},{key:'review',label:'Need KYC Review'},{key:'ready',label:'Ready for Trips'}];
  readonly activeFilters = computed(() => [
    {key:'type',label:'Skills: '+this.typeFilter(),value:this.typeFilter()},
    {key:'city',label:'City: '+this.cityFilter(),value:this.cityFilter()},
    {key:'kyc',label:'KYC: '+this.statusFilter(),value:this.statusFilter()==='all'?'':this.statusFilter()},
    {key:'fee',label:'Fee: '+this.feeFilter(),value:this.feeFilter()},
    {key:'availability',label:'Availability: '+this.availabilityFilter(),value:this.availabilityFilter()},
  ].filter(filter=>filter.value));
  summaryCount(view:string) { const stats=this.summary(); return view==='users'?stats.driverUsers:view==='review'?stats.kycPending:view==='ready'?stats.readyForTrips??0:stats.totalDrivers; }
  setListFilter(key: string, value: string) {
    const filters: Record<string, typeof this.loginFilter> = { login: this.loginFilter, city: this.cityFilter, state: this.stateFilter, source: this.sourceFilter, type: this.typeFilter, account: this.accountFilter,fee:this.feeFilter,eligibility:this.eligibilityFilter,availability:this.availabilityFilter,licence:this.licenceFilter,kyc:this.statusFilter };
    filters[key]?.set(key==='kyc' && !value?'all':value); this.page.set(1); this.reload();
  }
  quickView(view:string){this.selectedView.set(this.listViews.some(item=>item.key===view)?view:'all');this.page.set(1);this.reload();}
  toggleFilters(){this.filtersVisible.update(value=>!value);this.saveListState();}
  clearFilters(){this.typeFilter.set('');this.cityFilter.set('');this.statusFilter.set('all');this.feeFilter.set('');this.availabilityFilter.set('');this.page.set(1);this.reload();}
  private saveListState(){try{sessionStorage.setItem('mera-driver-list-state',JSON.stringify({view:this.selectedView(),type:this.typeFilter(),city:this.cityFilter(),kyc:this.statusFilter(),fee:this.feeFilter(),availability:this.availabilityFilter(),visible:this.filtersVisible(),search:this.searchQuery(),page:this.page(),pageSize:this.pageSize(),sort:this.sortKey(),direction:this.sortDir()}));}catch{/* Storage may be unavailable in a private browser. */}}
  private restoreListState(){try{const state=JSON.parse(sessionStorage.getItem('mera-driver-list-state')??'null');if(!state)return;this.selectedView.set(this.listViews.some(view=>view.key===state.view)?state.view:'all');this.typeFilter.set(state.type??'');this.cityFilter.set(state.city??'');this.statusFilter.set(state.kyc??'all');this.feeFilter.set(state.fee??'');this.availabilityFilter.set(state.availability??'');this.filtersVisible.set(state.visible!==false);this.searchQuery.set(state.search??'');this.page.set(Math.max(1,Number(state.page)||1));this.pageSize.set([10,25,50,100].includes(state.pageSize)?state.pageSize:10);this.sortKey.set(state.sort??'firstName');this.sortDir.set(state.direction==='desc'?'desc':'asc');}catch{/* Ignore invalid saved UI state. */}}

  // --- Paginated Rows to Pass to sky-data-table ---
  readonly tableRowsString = computed(() => {
    const list = this.processedDrivers();
    const paginated = list;
    // `linkedUser` is a nested object — the shared data table's generic detail drawer just
    // does `String(value)` per field, which would render `[object Object]`. Swap it for a
    // flat display label instead; the link/unlink panel reads the real object off
    // `allDrivers()` directly, not off this serialized row data.
    return JSON.stringify(
      paginated.map((d) => ({
        ...d,
        kycLabel: d.status === 'Non-Verified' ? 'Pending' : d.status?.startsWith('Partially Verified') ? 'Partial' : d.status,
        initials: (d.firstName || d.name || '').slice(0,1).toUpperCase() + (d.lastName || '').slice(0,1).toUpperCase(),
        name: `${d.name} · ID ${String(d.id).slice(0,8)} · ${d.phone || 'No mobile'}`,
        feeLabel: d.feeStatus==='Unpaid' && d.registrationFeeRequired===false?'Optional':d.feeStatus || 'Unpaid',
        eligibilityLabel: d.readyForTrips?'Ready':d.blockingReasons?.[0] || 'Not ready for trips',
        linkedUser: undefined,
        linkedAccountLabel: d.linkedUser ? `${d.linkedUser.name} (${d.linkedUser.phone ?? d.linkedUser.email ?? ''})` : 'Login not created',
        assignedVerifier: undefined,
        assignedVerifierLabel: d.assignedVerifier ? d.assignedVerifier.name : 'Unassigned',
        onboardingLabel: onboardingLabel(d),
      })),
    );
  });



  ngOnInit(): void {
    this.loadFormMasters();
    this.restoreListState();
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
    const edit=this.route.snapshot.queryParamMap.get('edit');
    if(edit && this.auth.can('drivers','edit'))this.api.search({search:edit,page:1,pageSize:1}).subscribe({next:result=>{const driver=result.rows.find(row=>row.id===edit);if(driver)this.onRowAction(new CustomEvent('action',{detail:{action:'edit_driver',row:driver}}));else this.listError.set('Driver not found');},error:async error=>this.listError.set(await httpErrorMessage(error))});
  }

  private reload(): void {
    this.saveListState();
    const sequence = ++this.searchSequence;
    this.loading.set(true); this.listError.set(null);
    const serverSort = this.sortKey()==='name'?'firstName':this.sortKey();
    const sortable = ['createdAt', 'firstName', 'lastName', 'phone', 'email', 'status', 'state', 'driverType', 'accountStatus','city','id','completionPercentage'];
    const query: Record<string, string | number> = { view:this.selectedView(), page: this.page(), pageSize: this.pageSize(), search: this.searchQuery(), sort: sortable.includes(serverSort) ? serverSort : 'createdAt', direction: this.sortDir() || 'desc' };
    const filters = { status: this.statusFilter() === 'all' ? '' : this.statusFilter(), city: this.cityFilter(), state: this.stateFilter(), sourceType: this.sourceFilter(), driverType: this.typeFilter(), login: this.loginFilter(), accountStatus: this.accountFilter(),fee:this.feeFilter(),eligibility:this.eligibilityFilter(),availability:this.availabilityFilter(),licence:this.licenceFilter() };
    for (const [key, value] of Object.entries(filters)) if (value) query[key] = value;
    this.api.search(query).subscribe({
      next: result => {
        if (sequence !== this.searchSequence) return;
        this.allDrivers.set(result.rows); this.totalDrivers.set(result.meta.total); this.summary.set(result.meta.summary); this.loading.set(false);
      }, error: () => {
        if (sequence !== this.searchSequence) return;
        this.loading.set(false); this.listError.set('Could not load drivers. Please try again.');
      },
    });
  }

  // Form values are selected by the active pill, including on initial creation.
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
      avatar: this.inputAvatar(),
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
      city: this.inputCity().trim(),
      pincode: this.inputPincode().trim(),
      address: this.inputAddress().trim(),
      driverType: this.inputDriverTypes().join(', '),
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
      jobType: this.inputJobType(),jobChoices:this.inputJobChoices(),workLocation:this.inputWorkLocation()||null,workStates:this.inputWorkStates(),
      experience: this.inputExperience(),
      currentSalary: this.inputCurrentSalary().trim(),
      expectedSalary: this.inputExpectedSalary(),
      // --- Payment Details ---
      driverStatusMasterId:this.inputDriverStatusMasterId(),
      preferredPaymentMode: this.inputPreferredPaymentMode(),
      amount: this.inputAmount().trim(),
      paymentReceiptDate: this.inputPaymentReceiptDate(),
      accountPaymentMethod: this.inputAccountPaymentMethod(),
      bankName: this.inputBankName().trim(),
      bankAccountNo: this.inputBankAccountNo().trim(),
      ifscCode: this.inputIfscCode().trim(),
      branchName: this.inputBranchName().trim(),
      upiIdOrChequeNo: this.inputUpiIdOrChequeNo().trim()
    };
  }

  /** Save only the active pill; creation also supplies the required identity fields. */
  private async persistStep(tabIndex: number, subIndex: number, isFinal: boolean, complete = true): Promise<boolean> {
    this.savingStep.set(true);
    this.stepError.set(null);
    const payload = this.buildPayload();
    const editingId = this.editingDriverId();
    const stepCompleted = tabIndex + 1;
    const fields:Partial<Driver>={};
    for(const key of PILL_SAVE_FIELDS[tabIndex][subIndex]) (fields as Record<string,unknown>)[key]=payload[key];

    try {
      if(tabIndex===3&&subIndex===1){
        fields.registrationFeeEntryChoice=this.inputRegistrationFeeStatus()==='Paid'?'Paid':'Unpaid';
        if(fields.registrationFeeEntryChoice==='Unpaid')for(const key of ['preferredPaymentMode','amount','paymentReceiptDate'] as const)delete fields[key];
        if(complete){const error=this.registrationDetailsError();if(error)throw new Error(error);}
        if(this.inputDriverStatusMasterId()!==this.originalDriverStatusMasterId()){
          if(!this.auth.can('drivers','status_change'))throw new Error('Driver status-change permission required');
          if(editingId && !this.statusReason().trim())throw new Error('Enter a driver status change reason');
          fields.driverStatusMasterId=this.inputDriverStatusMasterId();fields.driverStatusChangeReason=this.statusReason().trim();
        }else delete fields.driverStatusMasterId;
      }
      const avatarFile=tabIndex===0&&subIndex===3?this.pendingFiles.get('avatar-0'):undefined;
      if(avatarFile){
        delete fields.avatar;
        if(editingId){const doc=await firstValueFrom(this.api.uploadDocument(editingId,'personal','Profile Photo','',avatarFile));if(!doc.filePath)throw new Error('Profile photo upload did not return a saved file');fields.avatar=doc.filePath;this.inputAvatar.set(doc.filePath);this.pendingFiles.delete('avatar-0');}
      }
      const driver = editingId !== null
        ? await firstValueFrom(this.api.saveFormPill(editingId, fields, stepCompleted, subIndex, complete))
        : await firstValueFrom(this.api.create({ ...fields, name: payload.name, vehicle: '', phone: fields.phone ?? '', firstName: payload.firstName, gender: payload.gender }, stepCompleted, subIndex, complete));

      if (editingId === null) this.editingDriverId.set(driver.id!);
      if(tabIndex===3&&subIndex===1){this.originalDriverStatusMasterId.set(this.inputDriverStatusMasterId());this.statusReason.set('');
        if(this.inputRegistrationFeeStatus()==='Paid' && this.registrationReceipt){await firstValueFrom(this.api.uploadDocument(driver.id!,'personal','Registration Fee Receipt','',this.registrationReceipt));this.registrationReceipt=null;}
      }
      if(avatarFile && editingId===null){const doc=await firstValueFrom(this.api.uploadDocument(driver.id!,'personal','Profile Photo','',avatarFile));if(!doc.filePath)throw new Error('Profile photo upload did not return a saved file');this.inputAvatar.set(doc.filePath);this.pendingFiles.delete('avatar-0');}
      this.formCompletedSubSteps.set(driver.completedSubSteps ?? []);
      this.inputStatus.set(driver.status || 'Non-Verified');
      this.uploadPendingDocuments(driver.id!);
      this.reload();
      this.savingStep.set(false);

      if (isFinal) {
        this.resetForm();
        this.showAddForm.set(false);
      }
      return true;
    } catch (err) {
      console.error(`Failed to save tab ${stepCompleted} sub-step ${subIndex}`, err);
      this.savingStep.set(false);
      this.stepError.set(await httpErrorMessage(err as Parameters<typeof httpErrorMessage>[0]));
      return false;
    }
  }

  // --- Final "Save & Register" / "Save Changes" action (last tab's last sub-section) ---
  async addDriver(): Promise<void> {
    this.formSubmitted.set(true);
    // Every pill validates its own fields. A registration save cannot require
    // unrelated profile fields or attempt final KYC approval.
    if (!this.validateCurrentStep()) return;
    await this.persistStep(TOTAL_ONBOARDING_STEPS - 1, MAX_SUBS[TOTAL_ONBOARDING_STEPS - 1] - 1, true);
  }
  async saveDraft():Promise<void>{
    if(!this.editingDriverId()&&(!this.inputFirstName().trim()||!this.inputGender().trim())){this.markTouched('firstName');this.markTouched('gender');return;}
    await this.persistStep(this.activeFormTab(),this.activeSubSection(),false,false);
  }

  private uploadPendingDocuments(driverId: string): void {
    for (const [key, file] of this.pendingFiles.entries()) {
      if (key === 'avatar-0') continue;
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
    this.formCompletedSubSteps.set([]);
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
    this.inputGender.set('Male');
    this.inputPassportNumber.set('');
    this.inputReligion.set('Hindu');
    this.inputColor.set('Light Skin');
    this.inputLanguages.set(['Hindi']);
    this.inputAge.set('');
    this.inputHeight.set('');
    this.inputWeight.set('');
    this.inputCountry.set('India');
    this.inputState.set('');
    this.inputCity.set('');
    this.inputPincode.set('');
    this.inputAddress.set('');
    this.inputDriverTypes.set([]);
    this.inputStatus.set('');
    this.inputSourceType.set('');
    this.inputVehicle.set('Personal Sedan');
    this.inputAvatar.set('');
    this.inputEducation.set('');
    this.inputTrainingStatus.set('No');
    this.inputTrainingCertificate.set('');
    this.inputEyeVision.set('Normal Vision');
    this.inputHealthInsurance.set('No');
    this.inputBloodGroup.set('O+');
    // --- Revert Document Inputs ---
    this.inputLicenseDetails.set('LMV');
    this.inputVehicleType.set('');
    this.inputDlNo.set('');
    this.inputDlIssueDate.set('');
    this.inputDlExpiryDate.set('');
    this.inputPoliceVerifiedStatus.set('No');
    this.inputPoliceVerifiedNo.set('');
    this.inputPoliceVerifiedUpload.set('');
    this.inputJobType.set('');this.inputJobChoices.set([]);this.inputWorkLocation.set('');this.inputWorkStates.set([]);this.inputAccountStatus.set('Active');this.originalAccountStatus.set('Active');this.statusReason.set('');
    this.inputExperience.set('1 Year');
    this.inputCurrentSalary.set('');
    this.inputExpectedSalary.set('10000-15000');
    this.inputDocumentCategory.set('Driving License');
    this.inputDocumentUpload.set('');
    // --- Revert Payment Inputs ---
    this.inputPreferredPaymentMode.set('Cash');
    this.inputRegistrationFeeStatus.set('Unpaid');this.actualFeeStatus.set('Unpaid');this.expectedRegistrationFeePaise.set(0);this.feeRequired.set(false);this.inputDriverStatusMasterId.set(null);this.originalDriverStatusMasterId.set(null);this.cashConfirmed.set(false);this.collectionReference.set('');this.collectionReason.set('');this.registrationReceipt=null;this.originalRegistrationDetails='';
    this.inputAmount.set('');
    this.inputPaymentReceiptDate.set('');
    this.inputRegistrationReceiptFile.set('');
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
    this.page.set((detail.search ?? '') !== this.searchQuery() ? 1 : detail.page);
    this.pageSize.set(detail.pageSize);
    this.sortKey.set(detail.sortKey);
    this.sortDir.set(detail.sortDir);
    this.searchQuery.set(detail.search ?? '');
    // KYC is owned by the external filter panel, not the table's optional dropdown.
    this.reload();
  }

  onRowSelect(event: Event): void {
    const detail = (event as CustomEvent).detail;
    console.log('Selected Drivers:', detail.selected);
  }

  onRowAction(event: Event): void {
    const detail = (event as CustomEvent).detail;
    const action = detail.action;
    const row = detail.row;

    if (action === 'more_driver') {
      this.moreDriver.set(this.allDrivers().find(d => d.id === row.id) ?? null);
      return;
    }

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
      this.inputCity.set(row.city || '');
      this.inputPincode.set(row.pincode || '');
      this.inputAddress.set(row.address || '');
      this.inputDriverTypes.set(row.driverType ? row.driverType.split(', ').map((s: string) => s.trim()) : []);
      this.inputStatus.set(row.status || 'Non-Verified');
      this.inputSourceType.set(row.sourceType || '');
      this.inputVehicle.set(row.vehicle || 'Personal Sedan');
      this.inputAvatar.set(row.avatar || '');
      this.inputEducation.set(row.education || '');
      this.inputTrainingStatus.set(row.trainingStatus || 'No');
      this.inputTrainingCertificate.set(row.trainingCertificate || '');
      this.inputEyeVision.set(row.eyeVision || 'Normal Vision');
      this.inputHealthInsurance.set(row.healthInsurance || 'No');
      this.inputBloodGroup.set(row.bloodGroup || 'O+');
      this.inputLicenseDetails.set(row.licenseDetails || 'LMV');
      this.inputVehicleType.set(row.vehicleType || '');
      this.inputDlNo.set(row.dlNo || '');
      this.inputDlIssueDate.set(row.dlIssueDate || '');
      this.inputDlExpiryDate.set(row.dlExpiryDate || '');
      this.inputPoliceVerifiedStatus.set(row.policeVerifiedStatus || 'No');
      this.inputPoliceVerifiedNo.set(row.policeVerifiedNo || '');
      this.inputPoliceVerifiedUpload.set(row.policeVerifiedUpload || '');
      this.inputJobType.set(row.jobType || '');this.inputJobChoices.set(row.jobChoices??[]);this.inputWorkLocation.set(row.workLocation??'');this.inputWorkStates.set(row.workStates??[]);this.inputAccountStatus.set(row.accountStatus??'Active');this.originalAccountStatus.set(row.accountStatus??'Active');this.statusReason.set('');
      this.inputExperience.set(row.experience || '1 Year');
      this.inputCurrentSalary.set(row.currentSalary || '');
      this.inputExpectedSalary.set(row.expectedSalary || '10000-15000');
      this.inputDocumentCategory.set(row.documentCategory || 'Driving License');
      this.inputDocumentUpload.set(row.documentUpload || '');
      this.inputPreferredPaymentMode.set(row.preferredPaymentMode || '');
      this.actualFeeStatus.set(row.feeStatus || 'Unpaid');this.inputRegistrationFeeStatus.set(row.feeStatus==='Paid'?'Paid':'Unpaid');this.expectedRegistrationFeePaise.set(row.registrationFeePaise??0);this.feeRequired.set(row.registrationFeeRequired??false);this.inputDriverStatusMasterId.set(row.driverStatusMasterId??null);this.originalDriverStatusMasterId.set(row.driverStatusMasterId??null);this.registrationReceipt=null;this.cashConfirmed.set(false);this.collectionReference.set('');this.collectionReason.set('');
      this.inputAmount.set(row.amount || '');
      this.inputPaymentReceiptDate.set(row.paymentReceiptDate || '');this.inputRegistrationReceiptFile.set(row.registrationReceiptFile??'');this.originalRegistrationDetails=JSON.stringify([this.inputPreferredPaymentMode(),this.inputAmount(),this.inputPaymentReceiptDate()]);
      this.inputAccountPaymentMethod.set(row.accountPaymentMethod || '');
      this.inputBankName.set(row.bankName || '');
      this.inputBankAccountNo.set(row.bankAccountNo || '');
      this.inputIfscCode.set(row.ifscCode || '');
      this.inputBranchName.set(row.branchName || '');
      this.inputUpiIdOrChequeNo.set(row.upiIdOrChequeNo || '');
      this.personalDocs.set(row.personalDocs || [{ type: 'Aadhaar / National ID', regNo: '', file: '' }]);
      this.healthDocs.set(row.healthDocs || [{ type: 'Select Document Type', regNo: '', file: '' }]);
      this.educationDocs.set(row.educationDocs || [{ type: 'Select Document Type', regNo: '', file: '' }]);
      this.policeDocs.set(row.policeDocs || [{ type: 'Select Document Type', regNo: '', file: '' }]);

      this.formCompletedSubSteps.set(row.completedSubSteps || []);

      // Resume: an in-progress driver opens on its pending nested sub-step (from persisted
      // backend progress, not any frontend memory of where they left off — this component
      // was just (re)constructed from a fresh `GET /drivers` list). A completed (or legacy,
      // pre-onboarding-tracking) driver opens on tab 0 / sub 0 as a normal full edit/review,
      // same as before.
      if (row.onboardingStatus === 'in_progress' && row.currentStep) {
        const tab = Math.min(Math.max(Number(row.currentStep), 1), TOTAL_ONBOARDING_STEPS);
        const sub = Math.min(Math.max(Number(row.currentSubStep ?? 0), 0), MAX_SUBS[tab - 1] - 1);
        this.activeFormTab.set(tab - 1);
        this.activeSubSection.set(sub);
      } else {
        this.activeFormTab.set(0);
        this.activeSubSection.set(0);
      }
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
    } else if (action === 'toggle_driver_status') {
      const driver = this.allDrivers().find((d) => d.id === row.id);
      if (driver) this.toggleDriverStatus(driver);
    } else if (action === 'assign_verifier') {
      const driver = this.allDrivers().find((d) => d.id === row.id);
      if (driver) this.openVerifierPanel(driver);
    } else if (action === 'preview_driver') {
      // Look up the full record from `allDrivers()` (freshly reloaded after every
      // mutation), not the serialized table row — the resume must show the latest data.
      const driver = this.allDrivers().find((d) => d.id === row.id);
      if (driver) this.openPreview(driver);
    } else if (action === 'download_resume') { const driver = this.allDrivers().find(d=>d.id===row.id); if(driver)this.downloadPdf(driver,true); }
    else if (action === 'download_pdf') {
      const driver = this.allDrivers().find((d) => d.id === row.id);
      if (driver) this.downloadPdf(driver);
    }
  }

  // --- KYC Verifier Assignment ---
  /** Loads the picker options (every User holding the `kyc_verification` role) the first
   *  time the panel opens — reuses the existing Administration > Users list endpoint rather
   *  than adding a new one just for this picker. */
  openVerifierPanel(driver: Driver): void {
    this.verifierPanelDriver.set(driver);
    this.verifierError.set(null);
    if (this.verifierOptions().length === 0) {
      this.rbac.listUsers(1, 100).subscribe({
        next: (page) => {
          const verifiers = page.items
            .filter((u) => u.roles.some((r) => r.role.key === 'kyc_verification'))
            .map((u) => ({ id: u.id, name: u.name }));
          this.verifierOptions.set(verifiers);
        },
        error: (err) => {
          console.error('Failed to load KYC verifiers', err);
          this.verifierError.set('Failed to load the list of KYC verifiers.');
        },
      });
    }
  }

  closeVerifierPanel(): void {
    this.verifierPanelDriver.set(null);
  }

  onVerifierChange(event: Event): void {
    const val = (event.target as any).value || '';
    this.assignVerifier(val || null);
  }

  /** Assigns (`verifierId`) or clears (`null`) the driver's KYC reviewer. Independent of the
   *  self-service portal login link above. */
  assignVerifier(verifierId: string | null): void {
    const driver = this.verifierPanelDriver();
    if (!driver?.id) return;
    this.verifierSaving.set(true);
    this.verifierError.set(null);
    let reason:string|undefined;
    if(driver.assignedVerifierId && driver.assignedVerifierId!==verifierId){reason=window.prompt('Reason for changing the KYC verifier (previous review history is preserved)')?.trim();if(!reason){this.verifierSaving.set(false);this.verifierError.set('Reassignment reason required');return;}}
    this.api.assignVerifier(driver.id, verifierId, reason).subscribe({
      next: (updated) => {
        this.verifierSaving.set(false);
        this.allDrivers.update((list) => list.map((d) => (d.id === updated.id ? updated : d)));
        this.verifierPanelDriver.set(updated);
      },
      error: (err) => {
        this.verifierSaving.set(false);
        this.verifierError.set(err?.message || 'Failed to assign the KYC verifier. Please try again.');
      },
    });
  }

  // --- Driver User account (self-service portal login) ---
  openLinkPanel(driver: Driver): void {
    this.linkPanelDriver.set(driver);
    this.linkError.set(null);
  }

  closeLinkPanel(): void {
    this.linkPanelDriver.set(null);
  }

  /** The only way a driver gets a portal login — creates the User, assigns the `driver`
   *  role, and links it server-side in one call. No existing-user selection. */
  createDriverUser(driver: Driver): void {
    if (!driver.id) return;
    this.linkSaving.set(true);
    this.linkError.set(null);
    this.api.createDriverUser(driver.id).subscribe({
      next: (updated) => {
        this.linkSaving.set(false);
        this.allDrivers.update((list) => list.map((d) => (d.id === updated.id ? updated : d)));
        this.linkPanelDriver.set(updated);
        this.reload();
      },
      error: (err) => {
        this.linkSaving.set(false);
        this.linkError.set(err?.message || 'Failed to create the driver user account. Please try again.');
      },
    });
  }

  /** Toggles a driver's Active/Inactive account status from the Driver List row action —
   *  independent of the KYC `status` column. Confirmed before the call so a mis-click can't
   *  silently lock out (or restore) a driver's portal login. */
  toggleDriverStatus(driver: Driver): void {
    if (!driver.id) return;
    const next: 'Active' | 'Inactive' = driver.accountStatus !== 'Active' ? 'Active' : 'Inactive';
    const question =
      next === 'Inactive'
        ? 'Are you sure you want to deactivate this driver?'
        : 'Are you sure you want to activate this driver?';
    if (!confirm(question)) return;
    this.api.setAccountStatus(driver.id, next).subscribe({
      next: (updated) => this.allDrivers.update((list) => list.map((d) => (d.id === updated.id ? updated : d))),
      error: (err) => {
        console.error('Failed to update driver status', err);
        alert('Failed to update driver status. Please try again.');
      },
    });
  }

  suspendDriver(driver:Driver):void{if(!driver.id||!this.auth.can('drivers','status_change'))return;const reason=prompt('Reason for suspending this driver');if(!reason?.trim())return;this.moreDriver.set(null);this.api.setAccountStatus(driver.id,'Suspended',reason.trim()).subscribe({next:()=>this.reload(),error:()=>alert('Unable to suspend driver')});}

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
    this.formCompletedSubSteps.set([]);
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
   * Every nested sub-step is its own persistence checkpoint — "Save & Next" always saves the
   * sub-step just finished to Postgres before moving on, whether or not it's also the last
   * sub-step of its parent tab. That save is awaited before the UI advances, so "Continue"
   * always means "this step is now in Postgres", never just a local signal update. The very
   * last sub-step of the last tab has its own button/handler (`addDriver()`, bound in the
   * template when `isLastStep()`), so this method is never called for that one.
   */
  async onSaveAndNext(): Promise<void> {
    if (!this.validateCurrentStep()) {
      return;
    }

    const currentTab = this.activeFormTab();
    const currentSub = this.activeSubSection();

    const ok = await this.persistStep(currentTab, currentSub, false);
    if (!ok) return; // stay put — stepError is already showing why

    const isLastSubOfTab = currentSub >= MAX_SUBS[currentTab] - 1;
    if (!isLastSubOfTab) {
      this.activeSubSection.set(currentSub + 1);
    } else {
      this.activeFormTab.set(currentTab + 1);
      this.activeSubSection.set(0);
    }
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
      case 'city': this.inputCity.set(val); break;
      case 'pincode': this.inputPincode.set(val); break;
      case 'address': this.inputAddress.set(val); break;
      case 'status': this.inputStatus.set(val); break;
      case 'sourceType': this.inputSourceType.set(val); break;
      case 'vehicle': this.inputVehicle.set(val); break;
      case 'avatar': this.inputAvatar.set(val); break;
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
      case 'accountPaymentMethod': this.inputAccountPaymentMethod.set(val); break;
      case 'registrationFeeStatus': this.selectRegistrationFee(val as 'Paid'|'Unpaid'); break;
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
